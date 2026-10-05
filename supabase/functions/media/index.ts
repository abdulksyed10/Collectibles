import { createClient } from '@supabase/supabase-js';
import { connectDatabase } from './database.ts';
import { createR2Store } from './r2.ts';
import { createMediaService } from './service.ts';
import { createHandler } from './http.ts';
import { MediaError } from './validation.ts';
import { createAccountDeletion } from '../provider-grants/deletion.ts';
import { appleSubject,recentAuthentication } from '../provider-grants/crypto.ts';
import { appleProvider } from '../provider-grants/config.ts';

function required(name:string) {
  const value=Deno.env.get(name);
  if(!value)throw new Error(`Missing server configuration: ${name}`);
  return value;
}

const {db}=connectDatabase(Deno.env.get('MEDIA_DATABASE_URL')||required('SUPABASE_DB_URL'),Deno.env.get('MEDIA_ALLOW_LOCAL_DATABASE')==='true');
const auth=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const store=createR2Store({accountId:required('R2_ACCOUNT_ID'),bucket:required('R2_BUCKET_NAME'),accessKeyId:required('R2_ACCESS_KEY_ID'),secretAccessKey:required('R2_SECRET_ACCESS_KEY')});
const deleteAccount=createAccountDeletion(db,{
  hasApple:async owner=>{ const {data,error}=await auth.auth.admin.getUserById(owner); if(error && error.status!==404) throw error; return Boolean(data.user && appleSubject(data.user)); },
  encryptionKey:()=>required('PROVIDER_TOKEN_ENCRYPTION_KEY'),
  revoke:(clientId,token)=>appleProvider().revoke(clientId,token),
  deleteUser:async owner=>{ const {error}=await auth.auth.admin.deleteUser(owner); if(error && error.status!==404) throw error; },
});
const media=createMediaService(db,store,deleteAccount);

Deno.serve(createHandler({
  origins:(Deno.env.get('MEDIA_ALLOWED_ORIGINS')||'').split(',').map(value=>value.trim()).filter(Boolean),
  authenticate:async token=>{
    const {data,error}=await auth.auth.getUser(token);
    if(error || !data.user)return null;
    return data.user.id;
  },
  handle:async (owner,action)=>{
    if(action.action==='upload') {
      const accepted=await db.query("SELECT 1 FROM private.owner_public_rules WHERE owner_id=$1 AND version='2026-10-04'",[owner]);
      if(!accepted.length) throw new MediaError(403,'policy_required','Accept the Terms and Community rules before uploading.');
    }
    return media.handle(owner,action);
  },
  mutationsEnabled:Deno.env.get('MEDIA_MUTATIONS_ENABLED')!=='false',
  authorizeDeletion:async token=>{const {data,error}=await auth.auth.getClaims(token);return !error && Boolean(data && recentAuthentication(data.claims));},
}));
