import { MediaError,URL_TTL_SECONDS,validateJpegBase64,type Action } from './validation.ts';
export interface Session { query<T extends Record<string,unknown> = Record<string,unknown>>(sql:string,params?:unknown[]):Promise<T[]> }
export interface Database extends Session { transaction<T>(run:(tx:Session)=>Promise<T>):Promise<T> }
export interface ObjectStore { put(key:string,bytes:Uint8Array):Promise<void>; remove(keys:string[]):Promise<void>; sign(key:string):Promise<string> }
type Inventory = {pin_id:string;owner_id:string;full_key:string;thumb_key:string;deleted_at:string|null} & Record<string,unknown>;

export function imageKeys(owner:string,pin:string) {
  return {full:`${owner}/${pin}/full.jpg`,thumb:`${owner}/${pin}/thumb.jpg`};
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
      const [pin]=await tx.query('SELECT id FROM public.pins WHERE id=$1 AND owner_id=$2',[action.pinId,owner]);
      if(!pin) throw new MediaError(404,'not_found','Pin not found.');
      const [photo]=await tx.query('SELECT id FROM public.pin_images WHERE pin_id=$1',[action.pinId]);
      if(photo) throw new MediaError(409,'photo_exists','This pin already has a photo.');
    });
    const full=validateJpegBase64(action.imageBase64,false);
    const thumb=validateJpegBase64(action.thumbnailBase64,true);
    const keys=imageKeys(owner,action.pinId);
    // Commit inventory separately so a process crash cannot roll back our only
    // record of an R2 PUT. No object write occurs before this transaction commits.
    await db.transaction(async tx=>{
      await lockOwner(tx,owner);
      const [pin]=await tx.query('SELECT id FROM public.pins WHERE id=$1 AND owner_id=$2',[action.pinId,owner]);
      if(!pin) throw new MediaError(404,'not_found','Pin not found.');
      await tx.query('INSERT INTO private.media_inventory(pin_id,owner_id,full_key,thumb_key) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[action.pinId,owner,keys.full,keys.thumb]);
    });
    await db.transaction(async tx=>{
      await lockOwner(tx,owner);
      const [pin]=await tx.query('SELECT id FROM public.pins WHERE id=$1 AND owner_id=$2',[action.pinId,owner]);
      if(!pin) throw new MediaError(404,'not_found','Pin not found.');
      const [inventory]=await tx.query<Inventory>('SELECT * FROM private.media_inventory WHERE pin_id=$1 AND owner_id=$2 AND deleted_at IS NULL',[action.pinId,owner]);
      if(!inventory) throw new MediaError(409,'retired_pin','This pin cannot accept a photo.');
      const [photo]=await tx.query('SELECT id FROM public.pin_images WHERE pin_id=$1',[action.pinId]);
      if(photo) throw new MediaError(409,'photo_exists','This pin already has a photo.');
      // Sequential puts keep all I/O settled before the transaction releases its
      // lock. Failures keep inventory, and retries overwrite only pending keys.
      await store.put(keys.full,full);
      await store.put(keys.thumb,thumb);
      await tx.query('INSERT INTO public.pin_images(pin_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,$3,$4,$5)',[action.pinId,owner,keys.full,keys.thumb,full.length+thumb.length]);
    });
    return {ok:true};
  }

  async function retire(tx:Session,owner:string,pinIds:string[]) {
    if(!pinIds.length)return;
    // Include pins with no photo metadata: a failed upload may have put one key.
    const keys=pinIds.flatMap(id=>{const key=imageKeys(owner,id);return[key.full,key.thumb];});
    await tx.query(`INSERT INTO private.media_inventory(pin_id,owner_id,full_key,thumb_key,deleted_at)
      SELECT id,owner_id,owner_id::text||'/'||id::text||'/full.jpg',owner_id::text||'/'||id::text||'/thumb.jpg',now()
      FROM public.pins WHERE owner_id=$1 AND id=ANY($2::uuid[])
      ON CONFLICT(pin_id) DO UPDATE SET deleted_at=coalesce(private.media_inventory.deleted_at,now())`,[owner,pinIds]);
    await store.remove(keys);
  }

  return {async handle(owner:string,action:Action):Promise<unknown> {
    if(action.action==='upload')return upload(owner,action);
    if(action.action==='read')return db.transaction(async tx=>{
      await lockOwner(tx,owner);
      const photos=await tx.query<Inventory>('SELECT pin_id,owner_id,full_key,thumb_key FROM public.pin_images WHERE owner_id=$1 AND pin_id=ANY($2::uuid[])',[owner,action.pinIds]);
      const expiresAt=new Date(Date.now()+URL_TTL_SECONDS*1000).toISOString();
      const images=await Promise.all(photos.map(async photo=>({pinId:photo.pin_id,url:await store.sign(photo.full_key),thumbnailUrl:await store.sign(photo.thumb_key),expiresAt})));
      return {images};
    });
    await db.transaction(async tx=>{
      await lockOwner(tx,owner,action.action==='delete-account');
      if(action.action==='delete-pin') {
        const pins=await tx.query<{id:string}>('SELECT id FROM public.pins WHERE id=$1 AND owner_id=$2',[action.pinId,owner]);
        await retire(tx,owner,pins.map(pin=>pin.id));
        await tx.query('DELETE FROM public.pins WHERE id=$1 AND owner_id=$2',[action.pinId,owner]);
      } else if(action.action==='delete-collection') {
        const pins=await tx.query<{id:string}>('SELECT id FROM public.pins WHERE collection_id=$1 AND owner_id=$2',[action.collectionId,owner]);
        await retire(tx,owner,pins.map(pin=>pin.id));
        await tx.query('DELETE FROM public.collections WHERE id=$1 AND owner_id=$2',[action.collectionId,owner]);
      } else {
        const pins=await tx.query<{id:string}>('SELECT id FROM public.pins WHERE owner_id=$1',[owner]);
        await retire(tx,owner,pins.map(pin=>pin.id));
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
