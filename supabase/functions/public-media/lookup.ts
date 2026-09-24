import { MediaError } from '../media/validation.ts';
import type { Database } from '../media/service.ts';

export async function lookupPublicImage(
  db:{query<T extends Record<string,unknown>>(sql:string,params:unknown[]):Promise<T[]>},
  collectionId:string,itemId:string,size:'full'|'thumb',
):Promise<string|null> {
  const rows=await db.query<{full_key:string;thumb_key:string}>(
    'select full_key, thumb_key from private.resolve_public_image($1, $2)',
    [collectionId,itemId],
  );
  if(rows.length!==1)return null;
  return size==='full'?rows[0].full_key:rows[0].thumb_key;
}

export async function consumePublicRead(
  db:Database,
) {
  await db.transaction(async tx=>{
    const [limits]=await tx.query<{public_reads_enabled:boolean;public_reads_per_app_day:number}>('SELECT public_reads_enabled,public_reads_per_app_day FROM private.media_limits WHERE singleton=true FOR UPDATE');
    if(!limits)throw new MediaError(503,'service_unavailable','Public photos are temporarily unavailable.');
    if(!limits.public_reads_enabled)throw new MediaError(403,'public_reads_disabled','Public photos are temporarily disabled.');
    await tx.query('INSERT INTO private.public_media_reads(day) VALUES (current_date) ON CONFLICT DO NOTHING');
    const [count]=await tx.query<{reads:number}>('SELECT reads FROM private.public_media_reads WHERE day=current_date FOR UPDATE');
    if(!count)throw new MediaError(503,'service_unavailable','Public photos are temporarily unavailable.');
    if(count.reads>=limits.public_reads_per_app_day)throw new MediaError(429,'public_read_limit','Public photo views have reached today’s limit. Try again tomorrow.');
    await tx.query('UPDATE private.public_media_reads SET reads=reads+1 WHERE day=current_date');
  });
}
