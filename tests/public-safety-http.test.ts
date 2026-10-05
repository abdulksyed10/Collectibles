import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSafetyHandler, validateReport } from '../supabase/functions/public-safety/http.ts';
const valid={itemId:'00000000-0000-4000-8000-000000000111',reason:'spam',details:'',captchaToken:'a'.repeat(30)};
test('report input rejects identity spoofing, oversized text and ambiguous targets',()=>{
  assert.throws(()=>validateReport({...valid,reporterId:valid.itemId}));
  assert.throws(()=>validateReport({...valid,details:'x'.repeat(1001)}));
  assert.throws(()=>validateReport({...valid,collectionId:valid.itemId}));
});
test('guest reports require verified CAPTCHA and bounded streamed JSON',async()=>{
  let submissions=0;
  const handler=createSafetyHandler({origins:[],verify:async()=>false,submit:async()=>{submissions++;}});
  const request=(body:unknown)=>new Request('https://test.local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await handler(request(valid))).status,400);
  assert.equal((await handler(request({...valid,details:'x'.repeat(9000)}))).status,413);
  assert.equal(submissions,0);
  const ok=createSafetyHandler({origins:[],verify:async()=>true,submit:async()=>{submissions++;}});
  assert.equal((await ok(request(valid))).status,200);
  assert.equal(submissions,1);
});
