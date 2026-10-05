import { MediaError, readBoundedJson } from '../media/validation.ts';
export type Report = {itemId?: string; collectionId?: string; reason: string; details: string; captchaToken: string};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateReport(raw: unknown): Report {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MediaError(400,'invalid_report','Invalid report.');
  const b = raw as Record<string,unknown>;
  if (Object.keys(b).some(k=>!['itemId','collectionId','reason','details','captchaToken'].includes(k))
    || Boolean(b.itemId) === Boolean(b.collectionId)
    || !uuid.test(String(b.itemId || b.collectionId))
    || !['spam','sexual','violence','hate','harassment','scam','privacy','other'].includes(String(b.reason))
    || typeof b.details !== 'string' || b.details.length>1000
    || typeof b.captchaToken !== 'string' || b.captchaToken.length<20 || b.captchaToken.length>4096)
    throw new MediaError(400,'invalid_report','Check the report and complete verification.');
  return b as Report;
}
/**
 * Reporting moved to the authenticated `report_public_content` database RPC.
 * Keep this legacy public endpoint deployed as a bounded, explicit rejection so
 * an old client (or direct request) can never create an anonymous report.
 */
export function createSafetyHandler(options:{origins:string[]}) {
  return async (request:Request) => {
    const origin=request.headers.get('origin');
    const headers=new Headers({'content-type':'application/json','cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff'});
    if(origin && options.origins.includes(origin)) {
      headers.set('access-control-allow-origin',origin);
      headers.set('access-control-allow-headers','authorization, apikey, content-type, x-client-info');
      headers.set('access-control-allow-methods','POST, OPTIONS');
    }
    try {
      if(origin && !options.origins.includes(origin)) throw new MediaError(403,'origin_denied','Origin not allowed.');
      if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
      if(request.method!=='POST') throw new MediaError(405,'method_not_allowed','Use POST.');
      await readBoundedJson(request,8192);
      return new Response(JSON.stringify({error:'Sign in to report public content.'}),{headers,status:401});
    } catch(error) {
      const known=error instanceof MediaError;
      const limited=typeof error==='object' && error!==null && 'code' in error && error.code==='42901';
      return new Response(JSON.stringify({error:known?error.message:limited?'Report limit reached. Please try later.':'Reporting is temporarily unavailable. Contact support for help.'}),{headers,status:known?error.status:limited?429:503});
    }
  };
}
