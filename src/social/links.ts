const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SocialDestination = { type: 'collector' | 'item'; id: string };

function allowedWebOrigins() {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  const origins = new Set(['https://www.sharecollectibles.com', 'https://collectibles-three.vercel.app', 'http://127.0.0.1:4173', 'http://localhost:4173']);
  if (configured) {
    try { origins.add(new URL(configured).origin); } catch { /* Release validation reports an invalid configured URL. */ }
  }
  return origins;
}

function buildSocialUrl(base: string, key: 'collector' | 'item', id: string) {
  if (!UUID.test(id)) throw new Error('This link is unavailable.');
  const url = new URL(base);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error('This link is unavailable.');
  url.search = ''; url.hash = '';
  url.searchParams.set(key, id);
  return url.toString();
}

export function buildCollectorUrl(base: string, publisherId: string) { return buildSocialUrl(base, 'collector', publisherId); }
export function buildItemUrl(base: string, itemId: string) { return buildSocialUrl(base, 'item', itemId); }

export function socialDestinationFromUrl(value: string): SocialDestination | null {
  try {
    const url = new URL(value);
    const native = url.protocol === 'collectibles:' && !url.hostname && (url.pathname === '' || url.pathname === '/');
    const web = url.protocol === 'https:' && allowedWebOrigins().has(url.origin) && (url.pathname === '' || url.pathname === '/');
    if ((!native && !web) || url.hash || url.searchParams.size !== 1) return null;
    const collector = url.searchParams.get('collector');
    const item = url.searchParams.get('item');
    if (collector && !item && UUID.test(collector)) return { type: 'collector', id: collector };
    if (item && !collector && UUID.test(item)) return { type: 'item', id: item };
    return null;
  } catch { return null; }
}