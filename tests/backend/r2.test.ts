import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createR2Store } from '../../supabase/functions/media/r2.ts';

const config={accountId:'00000000000000000000000000000000',bucket:'private-pins-test',accessKeyId:'test-access-id',secretAccessKey:'test-secret'};

test('R2 signs private GET URLs for exactly five minutes and never exposes secret credentials',async()=>{
  const store=createR2Store(config);
  const url=new URL(await store.sign('owner/pin/full.jpg'));
  assert.equal(url.origin,'https://00000000000000000000000000000000.r2.cloudflarestorage.com');
  assert.equal(url.pathname,'/private-pins-test/owner/pin/full.jpg');
  assert.equal(url.searchParams.get('X-Amz-Expires'),'300');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'),'host');
  assert.ok(url.searchParams.get('X-Amz-Signature'));
  assert.equal(url.toString().includes('test-secret'),false);
});

test('uploaded JPEGs have private no-store headers, exact bytes and signed authentication',async()=>{
  let captured:Request|undefined;
  const store=createR2Store(config,async input=>{captured=input as Request;return new Response(null,{status:200});});
  await store.put('owner/pin/full.jpg',new Uint8Array([1,2,3]));
  assert.ok(captured);
  assert.equal(captured.method,'PUT');
  assert.equal(captured.headers.get('content-type'),'image/jpeg');
  assert.equal(captured.headers.get('cache-control'),'private, no-store, max-age=0');
  assert.match(captured.headers.get('authorization')||'',/^AWS4-HMAC-SHA256 /);
  assert.deepEqual(new Uint8Array(await captured.arrayBuffer()),new Uint8Array([1,2,3]));
});

test('R2 bulk deletion checks per-object errors even with HTTP 200 and rejects HTTP failures',async()=>{
  const partial=createR2Store(config,async()=>new Response('<DeleteResult><Error><Key>x</Key><Code>AccessDenied</Code></Error></DeleteResult>'));
  await assert.rejects(partial.remove(['owner/pin/full.jpg']),/storage/i);
  const failed=createR2Store(config,async()=>new Response('upstream internal detail',{status:503}));
  await assert.rejects(failed.put('owner/pin/full.jpg',new Uint8Array([1])),/storage/i);
});

test('bulk deletion splits at 1000 keys and sends signed, checksummed XML',async()=>{
  const bodies:string[]=[];
  const store=createR2Store(config,async input=>{
    const request=input as Request;
    assert.equal(request.method,'POST');
    assert.equal(new URL(request.url).search,'?delete=');
    assert.ok(request.headers.get('content-md5'));
    assert.ok(request.headers.get('authorization'));
    bodies.push(await request.text());
    return new Response('<DeleteResult/>');
  });
  await store.remove(Array.from({length:1001},(_,i)=>`owner/pin-${i}/full.jpg`));
  assert.equal(bodies.length,2);
  assert.equal((bodies[0].match(/<Object>/g)||[]).length,1000);
  assert.equal((bodies[1].match(/<Object>/g)||[]).length,1);
});
