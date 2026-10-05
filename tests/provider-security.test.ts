import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appleSubject,b64,b64url,openToken,recentAuthentication,sealToken,verifyAppleIdentity } from '../supabase/functions/provider-grants/crypto.ts';
test('provider encryption is randomized, tamper evident and bound to owner/client',async()=>{
  const key=b64(crypto.getRandomValues(new Uint8Array(32)));
  const first=await sealToken('private-refresh-token',key,'owner:client');
  assert.notEqual(first,await sealToken('private-refresh-token',key,'owner:client'));
  assert.ok(!first.includes('private-refresh-token'));
  assert.equal(await openToken(first,key,'owner:client'),'private-refresh-token');
  await assert.rejects(()=>openToken(first,key,'other:client'));
});
test('recent-auth check uses verified authentication method time, never refreshed JWT iat',()=>{
  assert.equal(recentAuthentication({iat:1000,amr:[{method:'password',timestamp:100}]},1000),false);
  assert.equal(recentAuthentication({amr:[{method:'oauth',timestamp:990}]},1000),true);
  assert.equal(appleSubject({identities:[{provider:'apple',identity_data:{sub:'subject'}}]}),'subject');
});
test('Apple JWT verification rejects foreign subject, audience, expiry and forged signature',async()=>{
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'};
  const encode=(value:unknown)=>b64url(new TextEncoder().encode(JSON.stringify(value)));
  const input=encode({alg:'RS256',kid:'test-key'})+'.'+encode({iss:'https://appleid.apple.com',aud:'client',sub:'subject',iat:900,exp:1100});
  const token=input+'.'+b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))));
  await verifyAppleIdentity(token,'client','subject',[jwk],1000);
  await assert.rejects(()=>verifyAppleIdentity(token,'client','other',[jwk],1000));
  await assert.rejects(()=>verifyAppleIdentity(token,'other','subject',[jwk],1000));
  await assert.rejects(()=>verifyAppleIdentity(token,'client','subject',[jwk],1200));
  await assert.rejects(()=>verifyAppleIdentity(token.slice(0,-5)+'AAAAA','client','subject',[jwk],1000));
});
