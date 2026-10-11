export type RecoveryIntent = 'request-code' | 'legacy-link';
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

/** Recognizes trusted recovery navigation without reading URL credentials. */
export function recoveryIntentFromUrl(value: string, webUrl: string): RecoveryIntent | null {
  let url: URL;
  let configured: URL;
  try { url = new URL(value); configured = trustedWebUrl(webUrl); } catch { return null; }
  if (url.origin !== configured.origin) return null;
  if (url.pathname === '/auth/recovery') return 'request-code';
  return hasRecoveryType(url) ? 'legacy-link' : null;
}

export function normalizeRecoveryCode(value: string) {
  const code = value.trim();
  return /^\d{6,10}$/.test(code) ? code : null;
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
