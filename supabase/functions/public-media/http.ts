const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPublicMediaHandler(options:{
  origins:string[];
  lookup:(collectionId:string,itemId:string,size:'full'|'thumb')=>Promise<string|null>;
  read:(key:string)=>Promise<Uint8Array>;
}) {
  return async(request:Request):Promise<Response>=>{
    const origin=request.headers.get('origin');
    const headers=new Headers({'cache-control':'private, no-store, max-age=0','vary':'Origin','x-content-type-options':'nosniff'});
    if(origin && options.origins.includes(origin)) {
      headers.set('access-control-allow-origin',origin);
      headers.set('access-control-allow-methods','GET, OPTIONS');
    }
    const error=(status:number,code:string)=>{
      const jsonHeaders=new Headers(headers);
      jsonHeaders.set('content-type','application/json');
      return new Response(JSON.stringify({error:code}),{status,headers:jsonHeaders});
    };
    if(origin && !options.origins.includes(origin))return error(403,'origin_denied');
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='GET')return error(405,'method_not_allowed');
    const url=new URL(request.url);
    const collectionId=url.searchParams.get('collectionId');
    const itemId=url.searchParams.get('itemId');
    const size=url.searchParams.get('size');
    if(!collectionId || !UUID.test(collectionId) || !itemId || !UUID.test(itemId) || (size!=='full' && size!=='thumb'))return error(400,'invalid_request');
    try {
      const key=await options.lookup(collectionId,itemId,size);
      if(!key)return error(404,'not_found');
      const bytes=await options.read(key);
      headers.set('content-type','image/jpeg');
      return new Response(new Uint8Array(bytes),{status:200,headers});
    } catch {
      return error(503,'service_unavailable');
    }
  };
}
