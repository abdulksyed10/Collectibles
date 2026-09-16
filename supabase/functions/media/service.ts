import { MediaError,URL_TTL_SECONDS,validateJpegBase64,type Action } from './validation.ts';
export interface Session { query<T extends Record<string,unknown> = Record<string,unknown>>(sql:string,params?:unknown[]):Promise<T[]> }
export interface Database extends Session { transaction<T>(run:(tx:Session)=>Promise<T>):Promise<T> }
export interface ObjectStore { put(key:string,bytes:Uint8Array):Promise<void>; remove(keys:string[]):Promise<void>; sign(key:string):Promise<string> }
type Inventory = {attempt_id:string;item_id:string;owner_id:string;full_key:string;thumb_key:string;deleted_at:string|null} & Record<string,unknown>;

export function imageKeys(owner:string,item:string,attempt:string) {
  return {full:`${owner}/${item}/${attempt}/full.jpg`,thumb:`${owner}/${item}/${attempt}/thumb.jpg`};
}

export async function lockOwner(tx:Session,owner:string,allowDeleting=false) {
  await tx.query('INSERT INTO private.owner_state(owner_id) VALUES ($1) ON CONFLICT DO NOTHING',[owner]);
  const [state]=await tx.query<{deleting:boolean}>('SELECT deleting FROM private.owner_state WHERE owner_id=$1 FOR UPDATE',[owner]);
  if (!state) throw new MediaError(401,'invalid_session','Account not found.');
  if (state.deleting && !allowDeleting) throw new MediaError(409,'account_deleting','Account deletion is in progress. Retry deleting your account.');
}

export function createMediaService(db:Database,store:ObjectStore,deleteUser:(owner:string)=>Promise<void>) {
  async function upload(owner:string,action:Extract<Action,{action:'upload'}>) {
    // Check ownership before spending CPU decoding attacker-supplied image bytes.
    await db.transaction(async tx=>{
      await lockOwner(tx,owner);
      const [item]=await tx.query('SELECT id FROM public.items WHERE id=$1 AND owner_id=$2',[action.itemId,owner]);
      if(!item) throw new MediaError(404,'not_found','Item not found.');
      const [photo]=await tx.query('SELECT id FROM public.item_images WHERE item_id=$1',[action.itemId]);
      if(photo) throw new MediaError(409,'photo_exists','This item already has a photo.');
    });
    const full=validateJpegBase64(action.imageBase64,false);
    const thumb=validateJpegBase64(action.thumbnailBase64,true);
    // Never reuse a previous request's object keys. Aborting a PUT locally does
    // not guarantee that R2 stopped it; a late completion may touch only this
    // attempt, never a later committed retry.
    const attemptId=crypto.randomUUID();
    const keys=imageKeys(owner,action.itemId,attemptId);
    // Commit inventory separately so a process crash cannot roll back our only
    // record of an R2 PUT. No object write occurs before this transaction commits.
    await db.transaction(async tx=>{
      await lockOwner(tx,owner);
      const [item]=await tx.query('SELECT id FROM public.items WHERE id=$1 AND owner_id=$2',[action.itemId,owner]);
      if(!item) throw new MediaError(404,'not_found','Item not found.');
      await tx.query('INSERT INTO private.media_inventory(attempt_id,item_id,owner_id,full_key,thumb_key) VALUES ($1,$2,$3,$4,$5)',[attemptId,action.itemId,owner,keys.full,keys.thumb]);
    });
    await db.transaction(async tx=>{
      await lockOwner(tx,owner);
      const [item]=await tx.query('SELECT id FROM public.items WHERE id=$1 AND owner_id=$2',[action.itemId,owner]);
      if(!item) throw new MediaError(404,'not_found','Item not found.');
      const [inventory]=await tx.query<Inventory>('SELECT * FROM private.media_inventory WHERE attempt_id=$1 AND item_id=$2 AND owner_id=$3 AND deleted_at IS NULL',[attemptId,action.itemId,owner]);
      if(!inventory) throw new MediaError(409,'retired_item','This item cannot accept a photo.');
      const [photo]=await tx.query('SELECT id FROM public.item_images WHERE item_id=$1',[action.itemId]);
      if(photo) throw new MediaError(409,'photo_exists','This item already has a photo.');
      // Sequential requests stay under the owner lock. Any remotely delayed PUT
      // after a failure remains tracked as an abandoned attempt for cleanup.
      await store.put(keys.full,full);
      await store.put(keys.thumb,thumb);
      await tx.query('INSERT INTO public.item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,$3,$4,$5)',[action.itemId,owner,keys.full,keys.thumb,full.length+thumb.length]);
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
    await tx.query('UPDATE private.media_inventory SET deleted_at=coalesce(deleted_at,now()) WHERE owner_id=$1 AND item_id=ANY($2::uuid[])',[owner,itemIds]);
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
        await tx.query('UPDATE private.media_inventory SET deleted_at=coalesce(deleted_at,now()) WHERE owner_id=$1',[owner]);
        await tx.query('UPDATE private.owner_state SET deleting=true WHERE owner_id=$1',[owner]);
      }
    });
    // Auth deletion cascades through metadata and needs the same DB locks. Call
    // it after commit; the durable deleting flag prevents new writes meanwhile.
    if(action.action==='delete-account')await deleteUser(owner);
    return {ok:true};
  }};
}
