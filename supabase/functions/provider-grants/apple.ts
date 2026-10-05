import { b64url, unb64, verifyAppleIdentity } from './crypto.ts';
type AppleConfig={teamId:string;keyId:string;privateKey:string;clientIds:string[]};
export function createAppleProvider(config:AppleConfig) {
  let keys:JsonWebKey[]=[]; let keysUntil=0;
  async function clientSecret(clientId:string) {
    if(!config.clientIds.includes(clientId)) throw new Error('Unknown Apple client');
    const now=Math.floor(Date.now()/1000);
    const encoded=(v:unknown)=>b64url(new TextEncoder().encode(JSON.stringify(v)));
    const input=`${encoded({alg:'ES256',kid:config.keyId})}.${encoded({iss:config.teamId,iat:now,exp:now+300,aud:'https://appleid.apple.com',sub:clientId})}`;
    const pkcs8=unb64(config.privateKey.replace(/-----[^-]+-----|\s/g,''));
    const key=await crypto.subtle.importKey('pkcs8',pkcs8,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    return `${input}.${b64url(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(input))))}`;
  }
  async function post(path:string,clientId:string,params:Record<string,string>) {
    const response=await fetch(`https://appleid.apple.com/auth/${path}`,{method:'POST',body:new URLSearchParams({...params,client_id:clientId,client_secret:await clientSecret(clientId)}),signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Apple provider request failed');
    return response;
  }
  return {
    async exchange(clientId:string,input:{code?:string;refreshToken?:string},subject:string) {
      const data=await (await post('token',clientId,input.code?{grant_type:'authorization_code',code:input.code}:{grant_type:'refresh_token',refresh_token:input.refreshToken!})).json();
      if(typeof data.id_token!=='string') throw new Error('Missing Apple identity');
      if(Date.now()>keysUntil) {
        const response=await fetch('https://appleid.apple.com/auth/keys',{signal:AbortSignal.timeout(10000)});
        if(!response.ok) throw new Error('Apple keys unavailable');
        const jwks=await response.json(); if(!Array.isArray(jwks.keys)) throw new Error('Apple keys unavailable');
        keys=jwks.keys; keysUntil=Date.now()+60*60_000;
      }
      await verifyAppleIdentity(data.id_token,clientId,subject,keys);
      const token=data.refresh_token ?? input.refreshToken;
      if(typeof token!=='string' || !token || token.length>8192) throw new Error('Missing revocable Apple grant');
      return token;
    },
    async revoke(clientId:string,token:string) { await post('revoke',clientId,{token,token_type_hint:'refresh_token'}); },
  };
}
