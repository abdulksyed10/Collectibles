import { MediaError,readBoundedJson,validateAction,type Action } from './validation.ts';

export function createHandler(options:{origins:string[];authenticate:(token:string)=>Promise<string|null>;handle:(owner:string,action:Action)=>Promise<unknown>;mutationsEnabled?:boolean}) {
  return async(request:Request):Promise<Response>=>{
    const origin=request.headers.get('origin');
    const headers=new Headers({'content-type':'application/json','cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff'});
    if(origin && options.origins.includes(origin)) {
      headers.set('access-control-allow-origin',origin);
      headers.set('access-control-allow-headers','authorization, apikey, content-type, x-client-info');
      headers.set('access-control-allow-methods','POST, OPTIONS');
    }
    try {
      if(origin && !options.origins.includes(origin))throw new MediaError(403,'origin_denied','This browser origin is not allowed.');
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(request.method!=='POST')throw new MediaError(405,'method_not_allowed','Use POST.');
      const auth=request.headers.get('authorization');
      const match=auth?.match(/^Bearer ([^\s]+)$/i);
      if(!match || match[1].length>8192)throw new MediaError(401,'invalid_session','Sign in to continue.');
      const owner=await options.authenticate(match[1]);
      if(!owner)throw new MediaError(401,'invalid_session','Your session has expired. Sign in again.');
      const action=validateAction(await readBoundedJson(request));
      if(options.mutationsEnabled===false && action.action!=='read')throw new MediaError(503,'maintenance','Changes are temporarily paused. Please try again.');
      return new Response(JSON.stringify(await options.handle(owner,action)),{status:200,headers});
    } catch(error) {
      const known=error instanceof MediaError;
      // Provider errors can contain SQL, credentials or signed URLs. Never echo
      // or log their messages; keep client errors safe and retryable.
      const body=known?{error:error.message,code:error.code}:{error:'The media service is temporarily unavailable. Please retry.',code:'service_unavailable'};
      return new Response(JSON.stringify(body),{status:known?error.status:503,headers});
    }
  };
}
