import { createClient } from '@supabase/supabase-js';
import { connectDatabase } from '../media/database.ts';
import { lockOwner } from '../media/service.ts';
import { MediaError,readBoundedJson } from '../media/validation.ts';
import { appleSubject,sealToken } from './crypto.ts';
import { appleProvider,required } from './config.ts';
const auth=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const {db}=connectDatabase(required('MEDIA_DATABASE_URL'));
// Explicit CORS, verified session, bounded payload. Never echo provider responses.
Deno.serve(async request=>{
  const origin=request.headers.get('origin');
  const allowed=required('MEDIA_ALLOWED_ORIGINS').split(',').map(s=>s.trim());
  const headers=new Headers({'content-type':'application/json','cache-control':'no-store','vary':'Origin'});
  if(origin && allowed.includes(origin)) { headers.set('access-control-allow-origin',origin); headers.set('access-control-allow-methods','POST, OPTIONS'); headers.set('access-control-allow-headers','authorization, apikey, content-type, x-client-info'); }
  try {
    if(origin && !allowed.includes(origin)) throw new MediaError(403,'origin_denied','Origin not allowed.');
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
    if(request.method!=='POST') throw new MediaError(405,'method_not_allowed','Use POST.');
    const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if(!token || token.length>8192) throw new MediaError(401,'invalid_session','Sign in to continue.');
    const {data,error}=await auth.auth.getUser(token);
    const subject=data.user && appleSubject(data.user);
    if(error || !data.user || !subject) throw new MediaError(403,'apple_identity_required','Sign in with Apple to continue.');
    const raw=await readBoundedJson(request,16384);
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new MediaError(400,'invalid_request','Invalid request.');
    const b=raw as Record<string,unknown>;
    if(Object.keys(b).some(k=>!['clientId','code','refreshToken'].includes(k)) || typeof b.clientId!=='string'
      || !required('APPLE_CLIENT_IDS').split(',').map(s=>s.trim()).includes(b.clientId)
      || Boolean(b.code)===Boolean(b.refreshToken) || typeof(b.code??b.refreshToken)!=='string' || String(b.code??b.refreshToken).length>8192)
      throw new MediaError(400,'invalid_grant','Invalid Apple authorization.');
    const owner=data.user.id; const clientId=b.clientId;
    await db.transaction(async tx=>{
      await lockOwner(tx,owner,true);
      const [state]=await tx.query<{deleting:boolean}>('SELECT deleting FROM private.owner_state WHERE owner_id=$1',[owner]);
      const [job]=await tx.query<{status:string;failure_code:string}>('SELECT status,failure_code FROM private.account_deletion_jobs WHERE owner_id=$1',[owner]);
      if(state?.deleting && (job?.status!=='needs_attention' || job.failure_code!=='apple_reauthentication_required')) throw new MediaError(409,'account_deleting','Account deletion is already in progress.');
      // Avoid unlimited external exchanges from a compromised session.
      const [{n}]=await tx.query<{n:string}>('SELECT count(*)::text n FROM private.provider_registration_attempts WHERE owner_id=$1 AND created_at>now()-interval \'1 hour\'',[owner]);
      if(Number(n)>=10) throw new MediaError(429,'provider_limit','Please try Apple sign-in later.');
      await tx.query('INSERT INTO private.provider_registration_attempts(owner_id) VALUES($1)',[owner]);
    });
    // Provider exchange is an external network call. Do it outside a database
    // transaction; the final transaction rechecks deletion state before saving.
    const refresh=await appleProvider().exchange(clientId,{code:b.code as string|undefined,refreshToken:b.refreshToken as string|undefined},subject);
    const encrypted=await sealToken(refresh,required('PROVIDER_TOKEN_ENCRYPTION_KEY'),`${owner}:${clientId}`);
    await db.transaction(async tx=>{
      await lockOwner(tx,owner,true);
      const [state]=await tx.query<{deleting:boolean}>('SELECT deleting FROM private.owner_state WHERE owner_id=$1',[owner]);
      const [job]=await tx.query<{status:string;failure_code:string}>('SELECT status,failure_code FROM private.account_deletion_jobs WHERE owner_id=$1',[owner]);
      if((state?.deleting || job) && !(job?.status==='needs_attention' && job.failure_code==='apple_reauthentication_required')) throw new MediaError(409,'account_deleting','Account deletion is in progress.');
      await tx.query("INSERT INTO private.provider_grants(owner_id,client_id,encrypted_token) VALUES($1,$2,$3) ON CONFLICT(owner_id,client_id) DO UPDATE SET encrypted_token=excluded.encrypted_token,status='active',registered_at=now()",[owner,clientId,encrypted]);
    });
    return new Response(JSON.stringify({ok:true}),{headers});
  } catch(error) {
    return new Response(JSON.stringify({error:error instanceof MediaError?error.message:'Apple authorization could not be saved. Please sign in again.'}),{headers,status:error instanceof MediaError?error.status:503});
  }
});
