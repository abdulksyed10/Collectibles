const encoder=new TextEncoder();
export function b64(bytes:Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
export function unb64(value:string) { return Uint8Array.from(atob(value),c=>c.charCodeAt(0)); }
export function b64url(bytes:Uint8Array) { return b64(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
function decodePart(value:string) { return unb64(value.replaceAll('-','+').replaceAll('_','/')); }
export function appleSubject(user:{identities?:Array<{provider:string;identity_data?:Record<string,unknown>}>}) {
  const sub=user.identities?.find(row=>row.provider==='apple')?.identity_data?.sub;
  return typeof sub==='string' && sub.length>0 ? sub : null;
}
export async function verifyAppleIdentity(token:string,audience:string,subject:string,keys:JsonWebKey[],now=Math.floor(Date.now()/1000)) {
  if(token.length>16384) throw new Error('Invalid Apple identity');
  const parts=token.split('.');
  if(parts.length!==3) throw new Error('Invalid Apple identity');
  const header=JSON.parse(new TextDecoder().decode(decodePart(parts[0])));
  const claims=JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
  const jwk=keys.find(key=>(key as JsonWebKey & {kid?:string}).kid===header.kid && key.kty==='RSA' && (!key.alg || key.alg==='RS256'));
  if(header.alg!=='RS256' || typeof header.kid!=='string' || !jwk) throw new Error('Invalid Apple signature');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodePart(parts[2]),encoder.encode(`${parts[0]}.${parts[1]}`))) throw new Error('Invalid Apple signature');
  if(claims.iss!=='https://appleid.apple.com' || claims.aud!==audience || claims.sub!==subject || typeof claims.exp!=='number' || claims.exp<=now || typeof claims.iat!=='number' || claims.iat>now+60) throw new Error('Apple identity does not match this account');
}
async function encryptionKey(value:string) {
  const bytes=unb64(value); if(bytes.length!==32) throw new Error('Invalid provider encryption configuration');
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function sealToken(value:string,secret:string,context:string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},await encryptionKey(secret),encoder.encode(value));
  return JSON.stringify({version:1,iv:b64(iv),body:b64(new Uint8Array(encrypted))});
}
export async function openToken(value:string,secret:string,context:string) {
  const box=JSON.parse(value); if(box.version!==1) throw new Error('Unknown encryption version');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(box.iv),additionalData:encoder.encode(context)},await encryptionKey(secret),unb64(box.body)));
}
export function recentAuthentication(claims:Record<string,unknown>,now=Math.floor(Date.now()/1000)) {
  if(!Array.isArray(claims.amr)) return false;
  return claims.amr.some(row=>row && ['password','oauth','otp','totp','sso/saml','id_token'].includes(row.method) && typeof row.timestamp==='number' && row.timestamp<=now+60 && now-row.timestamp<=600);
}
