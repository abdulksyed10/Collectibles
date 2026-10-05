import { lockOwner, type Database } from '../media/service.ts';
import { MediaError } from '../media/validation.ts';
import { openToken } from './crypto.ts';
export function createAccountDeletion(db:Database,options:{hasApple:(owner:string)=>Promise<boolean>;encryptionKey:()=>string;revoke:(clientId:string,token:string)=>Promise<void>;deleteUser:(owner:string)=>Promise<void>}) {
  return async(owner:string)=>{
    let shouldRun=true;
    await db.transaction(async tx=>{
      // Registration also takes this lock and rejects pending deletion jobs.
      // Never hold it while deleting Auth, whose cascade needs the same rows.
      await lockOwner(tx,owner,true);
      const [job]=await tx.query<{status:string;updated_at:string}>('SELECT status,updated_at FROM private.account_deletion_jobs WHERE owner_id=$1 FOR UPDATE',[owner]);
      if(!job || job.status==='storage_pending') throw new MediaError(409,'storage_pending','Account deletion is preparing stored photos. Please retry later.');
      if(job.status==='complete') { shouldRun=false; return; }
      if(job.status==='provider_processing') {
        // A second request while an external revocation is running must not send
        // duplicate provider calls. Maintenance may reclaim a stale lease after
        // a function timeout or process crash, so deletion cannot stay stuck.
        const [{retryable}]=await tx.query<{retryable:boolean}>("SELECT updated_at < now()-interval '10 minutes' AS retryable FROM private.account_deletion_jobs WHERE owner_id=$1",[owner]);
        if(!retryable) { shouldRun=false; return; }
      }
      await tx.query("UPDATE private.account_deletion_jobs SET status='provider_processing',attempts=attempts+1,failure_code=null,updated_at=now() WHERE owner_id=$1",[owner]);
    });
    if(!shouldRun)return;
    let code='provider_unavailable';
    try {
      if(await options.hasApple(owner)) {
        const grants=await db.query<{client_id:string;encrypted_token:string|null;status:string}>('SELECT client_id,encrypted_token,status FROM private.provider_grants WHERE owner_id=$1',[owner]);
        if(!grants.length) { code='apple_reauthentication_required'; throw new Error(); }
        for(const grant of grants) {
          if(grant.status==='revoked') continue;
          const token=await openToken(grant.encrypted_token!,options.encryptionKey(),`${owner}:${grant.client_id}`);
          await options.revoke(grant.client_id,token);
          await db.query("UPDATE private.provider_grants SET encrypted_token=null,status='revoked' WHERE owner_id=$1 AND client_id=$2",[owner,grant.client_id]);
        }
      }
      code='auth_delete_failed';
      await options.deleteUser(owner);
      await db.query("UPDATE private.account_deletion_jobs SET status='complete',failure_code=null,updated_at=now() WHERE owner_id=$1",[owner]);
    } catch {
      await db.query("UPDATE private.account_deletion_jobs SET status='needs_attention',failure_code=$2,updated_at=now() WHERE owner_id=$1",[owner,code]);
      throw new MediaError(503,code,code==='apple_reauthentication_required'?'Sign in with Apple again, then retry deleting your account. Contact support if you cannot sign in.':'Account deletion is pending. Please retry later or contact support. Your account is unavailable for new uploads or public sharing.');
    }
  };
}
