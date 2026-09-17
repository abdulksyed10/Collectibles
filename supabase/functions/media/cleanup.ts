import type { Database,ObjectStore } from './service.ts';

export async function sweepMedia(db:Database,store:ObjectStore,limit=100):Promise<number>{
  const candidates=await db.query<{attempt_id:string;owner_id:string}>(`
    SELECT i.attempt_id,i.owner_id FROM private.media_inventory i
    WHERE NOT EXISTS(SELECT 1 FROM public.item_images p WHERE p.full_key=i.full_key OR p.thumb_key=i.thumb_key)
      AND (i.last_swept_at IS NULL OR i.last_swept_at < now()-interval '1 day')
      AND ((i.deleted_at < now()-interval '15 minutes') OR (i.deleted_at IS NULL AND i.created_at < now()-interval '1 day'))
    ORDER BY coalesce(i.last_swept_at,i.created_at),i.attempt_id LIMIT $1`,[Math.max(1,Math.min(limit,1000))]);
  let swept=0;
  for(const candidate of candidates) {
    const didSweep=await db.transaction(async tx=>{
      // A deleted account has no owner lock row, and cannot start another upload.
      // Live accounts use the identical row lock as uploads/deletes.
      await tx.query('SELECT owner_id FROM private.owner_state WHERE owner_id=$1 FOR UPDATE',[candidate.owner_id]);
      const [row]=await tx.query<{full_key:string;thumb_key:string;deleted_at:string|null}>(`
        SELECT i.full_key,i.thumb_key,i.deleted_at FROM private.media_inventory i
        WHERE i.attempt_id=$1
          AND NOT EXISTS(SELECT 1 FROM public.item_images p WHERE p.full_key=i.full_key OR p.thumb_key=i.thumb_key)
          AND (i.last_swept_at IS NULL OR i.last_swept_at < now()-interval '1 day')
          AND ((i.deleted_at < now()-interval '15 minutes') OR (i.deleted_at IS NULL AND i.created_at < now()-interval '1 day'))`,[candidate.attempt_id]);
      if(!row)return false;
      await store.remove([row.full_key,row.thumb_key]);
      // Retire this exact attempt even when its item has a different active
      // image. A stalled request may not resume a swept reservation.
      await tx.query(`UPDATE private.media_inventory SET last_swept_at=now(),deleted_at=coalesce(deleted_at,now()),budget_status='retired'
        WHERE attempt_id=$1`,[candidate.attempt_id]);
      return true;
    });
    if(didSweep)swept++;
  }
  return swept;
}
