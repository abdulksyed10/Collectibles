import {createClient} from '@supabase/supabase-js';
import {connectDatabase} from '../functions/media/database.ts';
import {createR2Store} from '../functions/media/r2.ts';
import {createMediaService} from '../functions/media/service.ts';
import {createAccountDeletion} from '../functions/provider-grants/deletion.ts';
import {appleProvider,required} from '../functions/provider-grants/config.ts';
import {appleSubject} from '../functions/provider-grants/crypto.ts';
const {db,close}=connectDatabase(required('MEDIA_DATABASE_URL'));
const auth=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const remove=createAccountDeletion(db,{
  hasApple:async owner=>{const {data,error}=await auth.auth.admin.getUserById(owner);if(error && error.status!==404)throw error;return Boolean(data.user && appleSubject(data.user));},
  encryptionKey:()=>required('PROVIDER_TOKEN_ENCRYPTION_KEY'),
  revoke:(clientId,token)=>appleProvider().revoke(clientId,token),
  deleteUser:async owner=>{const {error}=await auth.auth.admin.deleteUser(owner);if(error && error.status!==404)throw error;},
});
const media=createMediaService(db,createR2Store({accountId:required('R2_ACCOUNT_ID'),bucket:required('R2_BUCKET_NAME'),accessKeyId:required('R2_ACCESS_KEY_ID'),secretAccessKey:required('R2_SECRET_ACCESS_KEY')}),remove);
try {
  await db.query('SELECT private.purge_safety_records()');
  await db.query("DELETE FROM private.signup_admission_events WHERE created_at<now()-interval '2 days'");
  await db.query("DELETE FROM private.provider_registration_attempts WHERE created_at<now()-interval '2 days'");
  await db.query("DELETE FROM private.account_deletion_jobs WHERE status='complete' AND updated_at<now()-interval '30 days'");
  const jobs=await db.query<{owner_id:string}>("SELECT owner_id FROM private.account_deletion_jobs WHERE status<>'complete' AND coalesce(failure_code,'')<>'apple_reauthentication_required' AND updated_at<now()-interval '1 hour' ORDER BY updated_at LIMIT 20");
  let failures=0;
  for(const job of jobs) {
    try {
      const exists=await db.query('SELECT id FROM auth.users WHERE id=$1',[job.owner_id]);
      if(exists.length) await media.handle(job.owner_id,{action:'delete-account'});
      else await db.query("UPDATE private.account_deletion_jobs SET status='complete',failure_code=null,updated_at=now() WHERE owner_id=$1",[job.owner_id]);
    }catch{failures++;}
  }
  console.log(`Maintenance: ${jobs.length} deletion retries, ${failures} still need attention. Retention sweep complete.`);
  if(failures) Deno.exitCode=1;
}catch{console.error('Maintenance failed. Review configuration and retry; no private provider output logged.');Deno.exitCode=1;}
finally{await close();}
