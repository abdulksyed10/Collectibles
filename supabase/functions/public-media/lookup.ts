export async function lookupPublicImage(
  db:{query<T extends Record<string,unknown>>(sql:string,params:unknown[]):Promise<T[]>},
  collectionId:string,itemId:string,size:'full'|'thumb',
):Promise<string|null> {
  const rows=await db.query<{full_key:string;thumb_key:string}>(`
    select img.full_key, img.thumb_key
    from public.collections c
    join private.owner_state s on s.owner_id=c.owner_id and s.deleting=false
    join public.items i on i.collection_id=c.id and i.owner_id=c.owner_id and i.id=$2
    join public.item_images img on img.item_id=i.id and img.owner_id=i.owner_id
    where c.id=$1 and c.visibility='public'
    limit 1`,[collectionId,itemId]);
  if(rows.length!==1)return null;
  return size==='full'?rows[0].full_key:rows[0].thumb_key;
}
