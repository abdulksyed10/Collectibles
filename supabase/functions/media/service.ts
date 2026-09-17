import { MediaError,URL_TTL_SECONDS,validateJpegBase64,type Action } from './validation.ts';
export interface Session { query<T extends Record<string,unknown> = Record<string,unknown>>(sql:string,params?:unknown[]):Promise<T[]> }
export interface Database extends Session { transaction<T>(run:(tx:Session)=>Promise<T>):Promise<T> }
export interface ObjectStore { put(key:string,bytes:Uint8Array):Promise<void>; remove(keys:string[]):Promise<void>; sign(key:string):Promise<string> }
type Inventory = {attempt_id:string;item_id:string;owner_id:string;full_key:string;thumb_key:string;deleted_at:string|null} & Record<string,unknown>;
type Limits = {
  uploads_enabled:boolean; active_photos_per_owner:number; attempts_per_owner_hour:number;
  attempts_per_owner_day:number; attempts_per_app_day:number; reserved_bytes_per_owner:number;
  reserved_bytes_per_app:number;
};

export function imageKeys(owner:string,item:string,attempt:string) {
  return {full:`${owner}/${item}/${attempt}/full.jpg`,thumb:`${owner}/${item}/${attempt}/thumb.jpg`};
}

export async function lockOwner(tx:Session,owner:string,allowDeleting=false) {
  await tx.query('INSERT INTO private.owner_state(owner_id) VALUES ($1) ON CONFLICT DO NOTHING',[owner]);
  const [state]=await tx.query<{deleting:boolean}>('SELECT deleting FROM private.owner_state WHERE owner_id=$1 FOR UPDATE',[owner]);
  if (!state) throw new MediaError(401,'invalid_session','Account not found.');
  if (state.deleting && !allowDeleting) throw new MediaError(409,'account_deleting','Account deletion is in progress. Retry deleting your account.');
}

function limitError(code:string, message:string) { return new MediaError(429,code,message); }

async function limitsForUpdate(tx:Session):Promise<Limits> {
  const [limits]=await tx.query<Limits>('SELECT uploads_enabled,active_photos_per_owner,attempts_per_owner_hour,attempts_per_owner_day,attempts_per_app_day,reserved_bytes_per_owner,reserved_bytes_per_app FROM private.media_limits WHERE singleton=true FOR UPDATE');
  if(!limits)throw new MediaError(503,'media_limits_unavailable','Photo uploads are temporarily unavailable. Please try again.');
  return limits;
}

async function reserveAttempt(db:Database,owner:string,itemId:string) {
  await db.transaction(async tx=>{
    await lockOwner(tx,owner);
    const limits=await limitsForUpdate(tx);
    if(!limits.uploads_enabled)throw new MediaError(403,'uploads_disabled','Photo uploads are temporarily disabled.');
    const [item]=await tx.query('SELECT id FROM public.items WHERE id=$1 AND owner_id=$2',[itemId,owner]);
    if(!item)throw new MediaError(404,'not_found','Item not found.');
    const [photo]=await tx.query('SELECT id FROM public.item_images WHERE item_id=$1',[itemId]);
    if(photo)throw new MediaError(409,'photo_exists','This item already has a photo.');
    const [{count:hourly}]=await tx.query<{count:string}>('SELECT count(*)::text as count FROM private.media_upload_attempts WHERE owner_id=$1 AND created_at>=clock_timestamp()-interval \'1 hour\'',[owner]);
    if(Number(hourly)>=limits.attempts_per_owner_hour)throw limitError('upload_hour_limit','You have reached the hourly photo upload limit. Try again later.');
    const [{count:daily}]=await tx.query<{count:string}>('SELECT count(*)::text as count FROM private.media_upload_attempts WHERE owner_id=$1 AND created_at>=current_date',[owner]);
    if(Number(daily)>=limits.attempts_per_owner_day)throw limitError('upload_daily_limit','You have reached today’s photo upload limit. Try again tomorrow.');
    const [{count:appDaily}]=await tx.query<{count:string}>('SELECT count(*)::text as count FROM private.media_upload_attempts WHERE created_at>=current_date');
    if(Number(appDaily)>=limits.attempts_per_app_day)throw limitError('uploads_busy','Photo uploads have reached today’s limit. Try again tomorrow.');
    await tx.query('INSERT INTO private.media_upload_attempts(owner_id) VALUES ($1)',[owner]);
  });
}

async function reserveInventory(db:Database,owner:string,itemId:string,attemptId:string,keys:{full:string;thumb:string},bytes:number) {
  await db.transaction(async tx=>{
    await lockOwner(tx,owner);
    const limits=await limitsForUpdate(tx);
    if(!limits.uploads_enabled)throw new MediaError(403,'uploads_disabled','Photo uploads are temporarily disabled.');
    const [item]=await tx.query('SELECT id FROM public.items WHERE id=$1 AND owner_id=$2',[itemId,owner]);
    if(!item)throw new MediaError(404,'not_found','Item not found.');
    const [photo]=await tx.query('SELECT id FROM public.item_images WHERE item_id=$1',[itemId]);
    if(photo)throw new MediaError(409,'photo_exists','This item already has a photo.');
    const [{count:activePhotos}]=await tx.query<{count:string}>('SELECT count(*)::text as count FROM public.item_images WHERE owner_id=$1',[owner]);
    if(Number(activePhotos)>=limits.active_photos_per_owner)throw limitError('photo_limit','You have reached the photo limit for this account.');
    await tx.query('INSERT INTO private.media_budget_owner(owner_id) VALUES ($1) ON CONFLICT DO NOTHING',[owner]);
    const [ownerBudget]=await tx.query<{reserved_bytes:string}>('SELECT reserved_bytes::text FROM private.media_budget_owner WHERE owner_id=$1 FOR UPDATE',[owner]);
    const [appBudget]=await tx.query<{reserved_bytes:string}>('SELECT reserved_bytes::text FROM private.media_budget_global WHERE singleton=true FOR UPDATE');
    if(!ownerBudget || !appBudget)throw new MediaError(503,'media_limits_unavailable','Photo uploads are temporarily unavailable. Please try again.');
    if(Number(ownerBudget.reserved_bytes)+bytes>limits.reserved_bytes_per_owner)throw limitError('storage_limit','This account has reached its photo storage limit.');
    if(Number(appBudget.reserved_bytes)+bytes>limits.reserved_bytes_per_app)throw limitError('storage_full','Photo storage is temporarily full. Try again later.');
    await tx.query('UPDATE private.media_budget_owner SET reserved_bytes=reserved_bytes+$2 WHERE owner_id=$1',[owner,bytes]);
    await tx.query('UPDATE private.media_budget_global SET reserved_bytes=reserved_bytes+$1 WHERE singleton=true',[bytes]);
    await tx.query("INSERT INTO private.media_inventory(attempt_id,item_id,owner_id,full_key,thumb_key,reserved_bytes,budget_status) VALUES ($1,$2,$3,$4,$5,$6,'pending')",[attemptId,itemId,owner,keys.full,keys.thumb,bytes]);
  });
}

export function createMediaService(db:Database,store:ObjectStore,deleteUser:(owner:string)=>Promise<void>) {
  async function upload(owner:string,action:Extract<Action,{action:'upload'}>) {
    // Consume a durable attempt before decoding. Invalid images cannot become a
    // free CPU-amplification path, and limits are shared by all function isolates.
    await reserveAttempt(db,owner,action.itemId);
    const full=validateJpegBase64(action.imageBase64,false);
    const thumb=validateJpegBase64(action.thumbnailBase64,true);
    // Never reuse a previous request's object keys. Aborting a PUT locally does
    // not guarantee that R2 stopped it; a late completion may touch only this
    // attempt, never a later committed retry.
    const attemptId=crypto.randomUUID();
    const keys=imageKeys(owner,action.itemId,attemptId);
    // Commit inventory and its lifetime budget separately so a crashed PUT can
    // never make an unaccounted object. Cleanup deliberately does not refund it.
    await reserveInventory(db,owner,action.itemId,attemptId,keys,full.length+thumb.length);
    await db.transaction(async tx=>{
      await lockOwner(tx,owner);
      const [item]=await tx.query('SELECT id FROM public.items WHERE id=$1 AND owner_id=$2',[action.itemId,owner]);
      if(!item) throw new MediaError(404,'not_found','Item not found.');
      const [inventory]=await tx.query<Inventory>('SELECT * FROM private.media_inventory WHERE attempt_id=$1 AND item_id=$2 AND owner_id=$3 AND deleted_at IS NULL',[attemptId,action.itemId,owner]);
      if(!inventory) throw new MediaError(409,'retired_item','This item cannot accept a photo.');
      const [photo]=await tx.query('SELECT id FROM public.item_images WHERE item_id=$1',[action.itemId]);
      if(photo) throw new MediaError(409,'photo_exists','This item already has a photo.');
      const [liveLimits]=await tx.query<{uploads_enabled:boolean;active_photos_per_owner:number}>('SELECT uploads_enabled,active_photos_per_owner FROM private.media_limits WHERE singleton=true');
      if(!liveLimits)throw new MediaError(503,'media_limits_unavailable','Photo uploads are temporarily unavailable. Please try again.');
      if(!liveLimits.uploads_enabled)throw new MediaError(403,'uploads_disabled','Photo uploads are temporarily disabled.');
      const [{count:activePhotos}]=await tx.query<{count:string}>('SELECT count(*)::text as count FROM public.item_images WHERE owner_id=$1',[owner]);
      if(Number(activePhotos)>=liveLimits.active_photos_per_owner)throw limitError('photo_limit','You have reached the photo limit for this account.');
      // Sequential requests stay under the owner lock. Any remotely delayed PUT
      // after a failure remains tracked as an abandoned attempt for cleanup.
      await store.put(keys.full,full);
      await store.put(keys.thumb,thumb);
      await tx.query('INSERT INTO public.item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,$3,$4,$5)',[action.itemId,owner,keys.full,keys.thumb,full.length+thumb.length]);
      await tx.query("UPDATE private.media_inventory SET budget_status='committed' WHERE attempt_id=$1",[attemptId]);
    });
    return {ok:true};
  }

  async function retire(tx:Session,owner:string,itemIds:string[]) {
    if(!itemIds.length)return;
    // Items with no attempt still need a tombstone so their IDs cannot be reused.
    // The original key layout is retained for these empty/legacy reservations.
    await tx.query(`INSERT INTO private.media_inventory(item_id,owner_id,full_key,thumb_key,deleted_at)
      SELECT p.id,p.owner_id,p.owner_id::text||'/'||p.id::text||'/full.jpg',p.owner_id::text||'/'||p.id::text||'/thumb.jpg',now()
      FROM public.items p WHERE p.owner_id=$1 AND p.id=ANY($2::uuid[])
        AND NOT EXISTS(SELECT 1 FROM private.media_inventory i WHERE i.item_id=p.id)`,[owner,itemIds]);
    await tx.query("UPDATE private.media_inventory SET deleted_at=coalesce(deleted_at,now()),budget_status='retired' WHERE owner_id=$1 AND item_id=ANY($2::uuid[])",[owner,itemIds]);
    const inventory=await tx.query<Inventory>('SELECT * FROM private.media_inventory WHERE owner_id=$1 AND item_id=ANY($2::uuid[])',[owner,itemIds]);
    await store.remove(inventory.flatMap(row=>[row.full_key,row.thumb_key]));
  }

  return {async handle(owner:string,action:Action):Promise<unknown> {
    if(action.action==='upload')return upload(owner,action);
    if(action.action==='read')return db.transaction(async tx=>{
      await lockOwner(tx,owner);
      const photos=await tx.query<Inventory>('SELECT item_id,owner_id,full_key,thumb_key FROM public.item_images WHERE owner_id=$1 AND item_id=ANY($2::uuid[])',[owner,action.itemIds]);
      const expiresAt=new Date(Date.now()+URL_TTL_SECONDS*1000).toISOString();
      const images=await Promise.all(photos.map(async photo=>({itemId:photo.item_id,url:await store.sign(photo.full_key),thumbnailUrl:await store.sign(photo.thumb_key),expiresAt})));
      return {images};
    });
    await db.transaction(async tx=>{
      await lockOwner(tx,owner,action.action==='delete-account');
      if(action.action==='delete-item') {
        const items=await tx.query<{id:string}>('SELECT id FROM public.items WHERE id=$1 AND owner_id=$2',[action.itemId,owner]);
        await retire(tx,owner,items.map(item=>item.id));
        await tx.query('DELETE FROM public.items WHERE id=$1 AND owner_id=$2',[action.itemId,owner]);
      } else if(action.action==='delete-collection') {
        const items=await tx.query<{id:string}>('SELECT id FROM public.items WHERE collection_id=$1 AND owner_id=$2',[action.collectionId,owner]);
        await retire(tx,owner,items.map(item=>item.id));
        await tx.query('DELETE FROM public.collections WHERE id=$1 AND owner_id=$2',[action.collectionId,owner]);
      } else {
        const items=await tx.query<{id:string}>('SELECT id FROM public.items WHERE owner_id=$1',[owner]);
        await retire(tx,owner,items.map(item=>item.id));
        // Include old reservations/tombstones left by previous failed deletes.
        const inventory=await tx.query<Inventory>('SELECT * FROM private.media_inventory WHERE owner_id=$1',[owner]);
        await store.remove(inventory.flatMap(row=>[row.full_key,row.thumb_key]));
        await tx.query("UPDATE private.media_inventory SET deleted_at=coalesce(deleted_at,now()),budget_status='retired' WHERE owner_id=$1",[owner]);
        await tx.query('UPDATE private.owner_state SET deleting=true WHERE owner_id=$1',[owner]);
      }
    });
    // Auth deletion cascades through metadata and needs the same DB locks. Call
    // it after commit; the durable deleting flag prevents new writes meanwhile.
    if(action.action==='delete-account')await deleteUser(owner);
    return {ok:true};
  }};
}
