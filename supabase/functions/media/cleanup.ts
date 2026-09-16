import type { Database,ObjectStore } from './service.ts';

export async function sweepMedia(db:Database,store:ObjectStore,limit=100):Promise<number>{
  const candidates=await db.query<{pin_id:string;owner_id:string}>(`
    SELECT i.pin_id,i.owner_id FROM private.media_inventory i
    LEFT JOIN public.pin_images p ON p.pin_id=i.pin_id
    WHERE p.pin_id IS NULL
      AND (i.last_swept_at IS NULL OR i.last_swept_at < now()-interval '1 day')
      AND ((i.deleted_at < now()-interval '15 minutes') OR (i.deleted_at IS NULL AND i.created_at < now()-interval '1 day'))
    ORDER BY coalesce(i.last_swept_at,i.created_at),i.pin_id LIMIT $1`,[Math.max(1,Math.min(limit,1000))]);
  let swept=0;
  for(const candidate of candidates) {
    const didSweep=await db.transaction(async tx=>{
      // A deleted account has no owner lock row, and cannot start another upload.
      // Live accounts use the identical row lock as uploads/deletes.
      await tx.query('SELECT owner_id FROM private.owner_state WHERE owner_id=$1 FOR UPDATE',[candidate.owner_id]);
      const [row]=await tx.query<{full_key:string;thumb_key:string;deleted_at:string|null}>(`
        SELECT i.full_key,i.thumb_key,i.deleted_at FROM private.media_inventory i
        LEFT JOIN public.pin_images p ON p.pin_id=i.pin_id
        WHERE i.pin_id=$1 AND p.pin_id IS NULL
          AND (i.last_swept_at IS NULL OR i.last_swept_at < now()-interval '1 day')
          AND ((i.deleted_at < now()-interval '15 minutes') OR (i.deleted_at IS NULL AND i.created_at < now()-interval '1 day'))`,[candidate.pin_id]);
      if(!row)return false;
      await store.remove([row.full_key,row.thumb_key]);
      await tx.query(`UPDATE private.media_inventory SET last_swept_at=now(),
        deleted_at=CASE WHEN NOT EXISTS(SELECT 1 FROM public.pins WHERE id=$1) THEN coalesce(deleted_at,now()) ELSE deleted_at END
        WHERE pin_id=$1`,[candidate.pin_id]);
      return true;
    });
    if(didSweep)swept++;
  }
  return swept;
}
