import { connectDatabase } from '../functions/media/database.ts';
import { createR2Store } from '../functions/media/r2.ts';
import { sweepMedia } from '../functions/media/cleanup.ts';

function required(name:string) {
  const value=Deno.env.get(name);
  if(!value)throw new Error(`Missing server configuration: ${name}`);
  return value;
}

const {db,close}=connectDatabase(Deno.env.get('MEDIA_DATABASE_URL')||required('SUPABASE_DB_URL'),Deno.env.get('MEDIA_ALLOW_LOCAL_DATABASE')==='true');
try {
  const store=createR2Store({accountId:required('R2_ACCOUNT_ID'),bucket:required('R2_BUCKET_NAME'),accessKeyId:required('R2_ACCESS_KEY_ID'),secretAccessKey:required('R2_SECRET_ACCESS_KEY')});
  let total=0;
  // Bounded operator run. Run again to drain a larger backlog; no credentials,
  // object names, user IDs or signed URLs are printed.
  for(let batch=0;batch<20;batch++) {
    const count=await sweepMedia(db,store,100);
    total+=count;
    if(count<100)break;
  }
  console.log(`Media cleanup completed: ${total} inventory entries swept.`);
} catch {
  console.error('Media cleanup failed. Verify database/R2 configuration and retry.');
  Deno.exitCode=1;
} finally {await close();}
