import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../../supabase/functions/media/http.ts';

const owner='20000000-0000-4000-8000-000000000001';
const handler=createHandler({origins:['https://pins.example'],authenticate:async token=>token==='valid-session'?owner:null,handle:async(account,action)=>({account,action})});
const req=(headers:Record<string,string>={},body='{"action":"delete-account"}')=>new Request('https://function.example/media',{method:'POST',headers:{'content-type':'application/json',...headers},body});

test('missing and invalid sessions are rejected before request body parsing',async()=>{
  assert.equal((await handler(req({},'{'))).status,401);
  assert.equal((await handler(req({authorization:'Bearer invalid'},'{'))).status,401);
});

test('only the authenticated account is passed to operations; responses prevent caching',async()=>{
  const response=await handler(req({authorization:'Bearer valid-session',origin:'https://pins.example'}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{account:owner,action:{action:'delete-account'}});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),'https://pins.example');
});

test('unapproved browser origins fail; approved preflight is bounded to POST',async()=>{
  assert.equal((await handler(req({authorization:'Bearer valid-session',origin:'https://hostile.example'}))).status,403);
  const preflight=await handler(new Request('https://function.example/media',{method:'OPTIONS',headers:{origin:'https://pins.example'}}));
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-methods'),'POST, OPTIONS');
  assert.equal((await handler(new Request('https://function.example/media'))).status,405);
});

test('internal provider details are not returned to callers',async()=>{
  const failed=createHandler({origins:[],authenticate:async()=>owner,handle:async()=>{throw Error('secret database connection details');}});
  const response=await failed(req({authorization:'Bearer valid-session'}));
  assert.equal(response.status,503);
  assert.equal((await response.text()).includes('secret'),false);
});
