export type OAuthProvider = 'google' | 'apple';
export type OAuthCallback = { kind: 'code'; code: string } | { kind: 'error'; message: string };

function validWebOrigin(value: URL) {
  return value.protocol === 'https:' || (value.protocol === 'http:' && (value.hostname === 'localhost' || value.hostname === '127.0.0.1'));
}

export function webOAuthCallbackUrl(webUrl: string) {
  const configured = new URL(webUrl);
  if (!validWebOrigin(configured)) throw new Error('A secure web URL is required for social sign-in.');
  return new URL('/auth/callback', configured.origin).toString();
}

function isCode(value: string | null): value is string {
  if (!value) return false;
  return value.length <= 4096 && !/\s/.test(value);
}

/** Returns only callbacks addressed to this app. Sharing URLs intentionally return null. */
export function parseOAuthCallback(value: string, webUrl: string): OAuthCallback | null {
  let callback: URL;
  try { callback = new URL(value); } catch { return null; }
  const native = callback.protocol === 'collectibles:' && callback.hostname === 'auth' && callback.pathname === '/callback';
  let web = false;
  try {
    const configured = new URL(webOAuthCallbackUrl(webUrl));
    web = callback.origin === configured.origin && callback.pathname === configured.pathname;
  } catch { /* Native callbacks remain valid when web configuration is absent. */ }
  if (!native && !web) return null;
  const code = callback.searchParams.get('code');
  if (isCode(code)) return { kind: 'code', code };
  if (callback.searchParams.get('error')) return { kind: 'error', message: 'Sign in was cancelled or denied.' };
  return null;
}
