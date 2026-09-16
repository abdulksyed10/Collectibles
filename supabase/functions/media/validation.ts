import jpeg from 'jpeg-js';

export class MediaError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const MAX_BODY_BYTES = 3_100_000;
export const URL_TTL_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Action =
  | { action:'upload'; itemId:string; imageBase64:string; thumbnailBase64:string }
  | { action:'read'; itemIds:string[] }
  | { action:'delete-item'; itemId:string }
  | { action:'delete-collection'; collectionId:string }
  | { action:'delete-account' };

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new MediaError(400,'invalid_id','Expected a UUID.');
  return value.toLowerCase();
}

export function validateAction(value: unknown): Action {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MediaError(400,'invalid_request','Expected an object.');
  const body = value as Record<string,unknown>;
  const allowed: Record<string,string[]> = {
    upload:['action','itemId','imageBase64','thumbnailBase64'], read:['action','itemIds'],
    'delete-item':['action','itemId'], 'delete-collection':['action','collectionId'], 'delete-account':['action'],
  };
  if (typeof body.action !== 'string' || !Object.hasOwn(allowed,body.action)) throw new MediaError(400,'invalid_action','Unknown media action.');
  if (Object.keys(body).some(key => !allowed[body.action as string].includes(key))) throw new MediaError(400,'invalid_request','Unexpected request field.');
  switch(body.action) {
    case 'upload':
      if (typeof body.imageBase64 !== 'string' || !body.imageBase64 || typeof body.thumbnailBase64 !== 'string' || !body.thumbnailBase64) throw new MediaError(400,'invalid_image','Both image and thumbnail are required.');
      return {action:'upload',itemId:uuid(body.itemId),imageBase64:body.imageBase64,thumbnailBase64:body.thumbnailBase64};
    case 'read':
      if (!Array.isArray(body.itemIds) || body.itemIds.length > 100) throw new MediaError(400,'invalid_ids','Read accepts at most 100 item IDs.');
      return {action:'read',itemIds:[...new Set(body.itemIds.map(uuid))]};
    case 'delete-item': return {action:'delete-item',itemId:uuid(body.itemId)};
    case 'delete-collection': return {action:'delete-collection',collectionId:uuid(body.collectionId)};
    default: return {action:'delete-account'};
  }
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new MediaError(415,'invalid_content_type','Unsupported content type; use application/json.');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length)>MAX_BODY_BYTES)) throw new MediaError(413,'body_too_large','Request body is too large.');
  if (!request.body) throw new MediaError(400,'invalid_json','JSON body required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while(true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size>MAX_BODY_BYTES) {
        await reader.cancel();
        throw new MediaError(413,'body_too_large','Request body is too large.');
      }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { throw new MediaError(400,'invalid_json','Malformed JSON body.'); }
}

export function validateJpegBase64(value: unknown, thumbnail: boolean): Uint8Array {
  const limit = thumbnail ? 200*1024 : 2*1024*1024;
  if (typeof value !== 'string' || !value.length) throw new MediaError(400,'invalid_image','JPEG base64 required.');
  if (value.length>4*Math.ceil(limit/3)) throw new MediaError(413,'image_too_large','Image is too large.');
  if (value.length%4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new MediaError(400,'invalid_image','Invalid image base64.');
  const binary = atob(value);
  if (binary.length>limit) throw new MediaError(413,'image_too_large','Image is too large.');
  const bytes = Uint8Array.from(binary,char=>char.charCodeAt(0));
  if (bytes[0]!==255 || bytes[1]!==216 || bytes[bytes.length-2]!==255 || bytes[bytes.length-1]!==217) throw new MediaError(400,'invalid_image','Invalid JPEG image.');
  try {
    // Bound decoder memory before accepting a potentially malicious JPEG header.
    const decoded = jpeg.decode(bytes,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false,maxResolutionInMP:thumbnail?0.3:6,maxMemoryUsageInMB:64});
    const maxSide = thumbnail ? 512 : 4096;
    if (!decoded.width || !decoded.height || decoded.width>maxSide || decoded.height>maxSide) throw new Error('dimensions');
  } catch { throw new MediaError(400,'invalid_image','Invalid JPEG or excessive image dimensions.'); }
  return bytes;
}
