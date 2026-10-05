import { connectDatabase } from '../media/database.ts';
import { createSafetyHandler } from './http.ts';
function required(name:string) { const v=Deno.env.get(name)?.trim(); if(!v) throw new Error(`Missing ${name}`); return v; }
const {db}=connectDatabase(required('MEDIA_DATABASE_URL'));
const secret=required('TURNSTILE_SECRET_KEY');
const origins=required('MEDIA_ALLOWED_ORIGINS').split(',').map(v=>v.trim()).filter(Boolean);
const hosts=origins.map(v=>new URL(v).hostname);
Deno.serve(createSafetyHandler({origins,
  verify:async token=>{
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret,response:token}),signal:AbortSignal.timeout(10000)});
    if(!response.ok) return false;
    const result=await response.json();
    return result.success===true && typeof result.hostname==='string' && hosts.includes(result.hostname);
  },
  submit:async report=>{
    // Supabase does not provide a documented, independently verified client-IP
    // assertion here. Never trust X-Forwarded-For. All guests share a conservative
    // 5/hour and 20/day bucket, in addition to CAPTCHA and 200/day app cap.
    await db.query('SELECT private.submit_public_report(null,$1,$2,$3,$4,$5)', ['guest:shared',report.itemId??null,report.collectionId??null,report.reason,report.details]);
  },
}));
