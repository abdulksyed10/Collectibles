export function validateReleaseConfig(env: Record<string,string|undefined>, native=false): string[] {
  const errors:string[]=[];
  const placeholder=(value:string)=>/example|placeholder|replace|your[_-]|fixture|change[_-]?me/i.test(value);
  const required=['EXPO_PUBLIC_ENABLE_BACKEND','EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY','EXPO_PUBLIC_TURNSTILE_SITE_KEY'];
  // Web sharing and OAuth use window.location when no override is configured.
  // Native clients have no browser origin and need the hosted CAPTCHA/share URL.
  if(native) required.push('EXPO_PUBLIC_WEB_URL','APP_ANDROID_PACKAGE','APP_IOS_BUNDLE_IDENTIFIER','EXPO_OWNER','EAS_PROJECT_ID');
  else if(env.EXPO_PUBLIC_WEB_URL?.trim()) required.push('EXPO_PUBLIC_WEB_URL');
  for(const name of required) if(!env[name]?.trim() || placeholder(env[name]!)) errors.push(`${name} is missing or contains a placeholder.`);
  if(env.EXPO_PUBLIC_ENABLE_BACKEND!=='true') errors.push('EXPO_PUBLIC_ENABLE_BACKEND must be true.');
  for(const name of ['EXPO_PUBLIC_WEB_URL','EXPO_PUBLIC_SUPABASE_URL']) {
    if(name==='EXPO_PUBLIC_WEB_URL' && !native && !env[name]?.trim()) continue;
    try {
      const url=new URL(env[name]??'');
      if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || url.pathname!=='/' || /^(localhost|127\.|\[::1\])/.test(url.hostname)) throw Error();
    } catch { errors.push(`${name} must be a public HTTPS origin without a path, credentials or query parameters.`); }
  }
  const key=env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY??'';
  if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) errors.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key (never a service-role or secret key).');
  const site=env.EXPO_PUBLIC_TURNSTILE_SITE_KEY??'';
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(site) || /^[123]x0{10}/.test(site)) errors.push('EXPO_PUBLIC_TURNSTILE_SITE_KEY must be a production site key, not a test key.');
  if(env.EXPO_PUBLIC_SUPPORT_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EXPO_PUBLIC_SUPPORT_EMAIL)) errors.push('EXPO_PUBLIC_SUPPORT_EMAIL is invalid.');
  if(native) {
    if(!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(env.APP_ANDROID_PACKAGE??'')) errors.push('APP_ANDROID_PACKAGE must be a permanent reverse-domain Android identifier.');
    if(!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(env.APP_IOS_BUNDLE_IDENTIFIER??'')) errors.push('APP_IOS_BUNDLE_IDENTIFIER must be a permanent reverse-domain Apple identifier.');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(env.EAS_PROJECT_ID??'')) errors.push('EAS_PROJECT_ID must be the UUID of your existing EAS project.');
  }
  return [...new Set(errors)];
}
