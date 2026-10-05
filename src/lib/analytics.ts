/** Analytics intentionally treats app views as one route. No item, account or auth IDs. */
export function safeAnalyticsEvent<T extends {type:string;url:string}>(event:T) {
  if(event.type!=='pageview') return null;
  try {
    const url=new URL(event.url);
    if(url.pathname.startsWith('/auth')) return null;
    const publicPages=new Set(['/privacy','/terms','/community','/support','/delete-account']);
    return {type:'pageview' as const,url:`${url.origin}${publicPages.has(url.pathname)?url.pathname:'/'}`};
  }catch{return null;}
}
