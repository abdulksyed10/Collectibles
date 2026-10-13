export type RecoveryIntent = 'request-link';
export type RecoveryLink =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string };
export type RecoveryMarker = { userId: string; startedAt: number };
export const recoveryMarkerMaxAgeMs = 60 * 60_000;

function trustedWebUrl(value: string) {
  const url = new URL(value);
  const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !local) throw new Error('A secure web URL is required for password recovery.');
  return url;
}

export function recoveryPageUrl(webUrl: string) {
  return new URL('/auth/recovery', trustedWebUrl(webUrl).origin).toString();
}

function hasRecoveryType(url: URL) {
  if (url.searchParams.get('type') === 'recovery') return true;
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  return new URLSearchParams(fragment).get('type') === 'recovery';
}

function validCredential(value: string | null): value is string {
  return Boolean(value && value.length <= 8_192 && !/\s/.test(value));
}

/** Parses credentials only from a reset link addressed to this app. */
export function recoveryLinkFromUrl(value: string, webUrl: string): RecoveryLink | null {
  let url: URL;
  let configured: URL;
  try { url = new URL(value); configured = trustedWebUrl(webUrl); } catch { return null; }
  if (url.origin !== configured.origin) return null;

  const onRecoveryPage = url.pathname === '/auth/recovery';
  const code = url.searchParams.get('code');
  if (onRecoveryPage && validCredential(code)) return { kind: 'code', code };

  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (hasRecoveryType(url) && validCredential(accessToken) && validCredential(refreshToken)) {
    return { kind: 'tokens', accessToken, refreshToken };
  }
  return null;
}

/** Recognizes the password-reset request page without accepting credentials. */
export function recoveryIntentFromUrl(value: string, webUrl: string): RecoveryIntent | null {
  let url: URL;
  let configured: URL;
  try { url = new URL(value); configured = trustedWebUrl(webUrl); } catch { return null; }
  if (url.origin !== configured.origin) return null;
  return url.pathname === '/auth/recovery' ? 'request-link' : null;
}

export function isCurrentRecoveryMarker(marker: RecoveryMarker | null, userId: string | undefined, now = Date.now()) {
  return Boolean(marker && userId && marker.userId === userId && marker.startedAt <= now && marker.startedAt + recoveryMarkerMaxAgeMs >= now);
}

export function recoveryMarkerFromStorage(value: string | null): RecoveryMarker | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RecoveryMarker>;
    if (typeof parsed.userId !== 'string' || !parsed.userId || typeof parsed.startedAt !== 'number' || !Number.isFinite(parsed.startedAt)) return null;
    return { userId: parsed.userId, startedAt: parsed.startedAt };
  } catch { return null; }
}
