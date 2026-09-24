import { createClient } from '@supabase/supabase-js';
import { connectDatabase } from './database.ts';
import { createR2Store } from './r2.ts';
import { createMediaService } from './service.ts';
import { createHandler } from './http.ts';
import { MediaError } from './validation.ts';

function required(name:string) {
  const value=Deno.env.get(name);
  if(!value)throw new Error(`Missing server configuration: ${name}`);
  return value;
}

const {db}=connectDatabase(Deno.env.get('MEDIA_DATABASE_URL')||required('SUPABASE_DB_URL'),Deno.env.get('MEDIA_ALLOW_LOCAL_DATABASE')==='true');
const auth=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const store=createR2Store({accountId:required('R2_ACCOUNT_ID'),bucket:required('R2_BUCKET_NAME'),accessKeyId:required('R2_ACCESS_KEY_ID'),secretAccessKey:required('R2_SECRET_ACCESS_KEY')});
const media=createMediaService(db,store,async owner=>{
  const {error}=await auth.auth.admin.deleteUser(owner);
  if(error && error.status!==404)throw new MediaError(503,'account_delete_failed','Account deletion could not finish. Please retry deleting your account.');
});

Deno.serve(createHandler({
  origins:(Deno.env.get('MEDIA_ALLOWED_ORIGINS')||'').split(',').map(value=>value.trim()).filter(Boolean),
  authenticate:async token=>{
    const {data,error}=await auth.auth.getUser(token);
    if(error || !data.user)return null;
    return data.user.id;
  },
  handle:media.handle,
  mutationsEnabled:Deno.env.get('MEDIA_MUTATIONS_ENABLED')!=='false',
}));
