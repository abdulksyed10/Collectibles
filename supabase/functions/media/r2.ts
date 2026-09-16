import { AwsClient } from 'aws4fetch';
import { createHash } from 'node:crypto';
import type { ObjectStore } from './service.ts';
import { MediaError,URL_TTL_SECONDS } from './validation.ts';

export function createR2Store(config:{accountId:string;bucket:string;accessKeyId:string;secretAccessKey:string},fetcher:typeof fetch=fetch):ObjectStore {
  if(!/^[a-f0-9]{32}$/i.test(config.accountId) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket))throw new Error('Invalid R2 configuration.');
  const base=`https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
  const aws=new AwsClient({accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey,service:'s3',region:'auto'});
  const keyUrl=(key:string)=>`${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const xml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');

  async function send(url:string,init:RequestInit):Promise<Response> {
    try {
      // Sign only, then use a single bounded fetch. Automatic PUT retries after
      // timeout could otherwise race a later delete after the DB lock releases.
      const request=await aws.sign(url,{...init,signal:AbortSignal.timeout(20000)});
      const response=await fetcher(request);
      if(!response.ok) { await response.body?.cancel(); throw new Error('HTTP failure'); }
      return response;
    } catch { throw new MediaError(503,'storage_unavailable','Private photo storage is unavailable. Please retry.'); }
  }

  return {
    async put(key,bytes) {
      const response=await send(keyUrl(key),{method:'PUT',headers:{'content-type':'image/jpeg','cache-control':'private, no-store, max-age=0'},body:new Uint8Array(bytes).buffer});
      await response.body?.cancel();
    },
    async remove(keys) {
      const unique=[...new Set(keys)];
      for(let start=0;start<unique.length;start+=1000) {
        const body=`<Delete xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Quiet>true</Quiet>${unique.slice(start,start+1000).map(key=>`<Object><Key>${xml(key)}</Key></Object>`).join('')}</Delete>`;
        const response=await send(`${base}?delete=`,{method:'POST',headers:{'content-type':'application/xml','content-md5':createHash('md5').update(body).digest('base64')},body});
        // S3 returns per-object failures inside successful HTTP responses.
        const result=await response.text();
        if(!/<DeleteResult(?:\s|\/|>)/.test(result) || /<Error(?:\s|>)/.test(result))throw new MediaError(503,'storage_unavailable','Private photo storage could not delete every object. Please retry.');
      }
    },
    async sign(key) {
      const url=new URL(keyUrl(key));
      url.searchParams.set('X-Amz-Expires',String(URL_TTL_SECONDS));
      const signed=await aws.sign(url.toString(),{method:'GET',aws:{signQuery:true}});
      return signed.url;
    },
  };
}
