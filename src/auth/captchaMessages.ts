export type CaptchaBridgeMessage =
  | { type: 'ready' }
  | { type: 'token'; token: string }
  | { type: 'expired' | 'error' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 20 && value.length <= 4096;
}

/** Parses only messages from the standalone CAPTCHA page for this challenge instance. */
export function parseCaptchaMessage(value: string, expectedNonce: string): CaptchaBridgeMessage | null {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (!isRecord(parsed) || parsed.nonce !== expectedNonce || typeof parsed.type !== 'string') return null;
  if (parsed.type === 'ready' && hasOnlyKeys(parsed, ['type', 'nonce'])) return { type: 'ready' };
  if (parsed.type === 'token' && hasOnlyKeys(parsed, ['type', 'nonce', 'token']) && isToken(parsed.token)) return { type: 'token', token: parsed.token };
  if ((parsed.type === 'expired' || parsed.type === 'error') && hasOnlyKeys(parsed, ['type', 'nonce'])) return { type: parsed.type };
  return null;
}

export function isExpectedCaptchaPage(value: string, pageUrl: string) {
  try {
    const candidate = new URL(value);
    const expected = new URL(pageUrl);
    return candidate.origin === expected.origin && candidate.pathname === expected.pathname;
  } catch { return false; }
}

/** Allows only the first-party page, Cloudflare's frame flow, and WebView blank documents. */
export function isAllowedCaptchaNavigation(value: string, pageUrl: string) {
  if (value === 'about:blank' || value === 'about:srcdoc') return true;
  try {
    const candidate = new URL(value);
    if (candidate.origin === 'https://challenges.cloudflare.com') return true;
    return isExpectedCaptchaPage(value, pageUrl);
  } catch { return false; }
}

export function buildCaptchaPageUrl(webUrl: string, siteKey: string, nonce: string, theme: 'light' | 'dark' | 'auto') {
  const configured = new URL(webUrl);
  const isLocal = configured.protocol === 'http:' && (configured.hostname === 'localhost' || configured.hostname === '127.0.0.1');
  if (configured.protocol !== 'https:' && !isLocal) throw new Error('CAPTCHA page requires a secure hosted URL.');
  const page = new URL('/auth/captcha.html', configured.origin);
  page.searchParams.set('siteKey', siteKey);
  page.searchParams.set('nonce', nonce);
  page.searchParams.set('theme', theme);
  return page.toString();
}
