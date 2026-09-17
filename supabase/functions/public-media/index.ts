import { connectDatabase } from '../media/database.ts';
import { createR2Store } from '../media/r2.ts';
import { createPublicMediaHandler } from './http.ts';
import { consumePublicRead, lookupPublicImage } from './lookup.ts';

function required(name:string) {
  const value=Deno.env.get(name);
  if(!value)throw new Error(`Missing server configuration: ${name}`);
  return value;
}

const {db}=connectDatabase(Deno.env.get('MEDIA_DATABASE_URL')||required('SUPABASE_DB_URL'),Deno.env.get('MEDIA_ALLOW_LOCAL_DATABASE')==='true');
const store=createR2Store({accountId:required('R2_ACCOUNT_ID'),bucket:required('R2_BUCKET_NAME'),accessKeyId:required('R2_ACCESS_KEY_ID'),secretAccessKey:required('R2_SECRET_ACCESS_KEY')});

Deno.serve(createPublicMediaHandler({
  origins:(Deno.env.get('MEDIA_ALLOWED_ORIGINS')||'').split(',').map(value=>value.trim()).filter(Boolean),
  lookup:(collectionId,itemId,size)=>lookupPublicImage(db,collectionId,itemId,size),
  consumeRead:()=>consumePublicRead(db),
  read:key=>store.get(key),
}));
