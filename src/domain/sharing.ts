export const isCollectionId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function sharedIdFromUrl(value: string | null): string | null {
  try { const id = value ? new URL(value).searchParams.get('collection') : null; return id && isCollectionId(id) ? id : null; }
  catch { return null; }
}

export function buildShareUrl(base: string, collectionId: string): string {
  if (!isCollectionId(collectionId)) throw new Error('This collection cannot be shared.');
  const url = new URL(base);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error('Share links are unavailable right now.');
  // Never include session/recovery fragments or other account-specific URL data.
  url.search = ''; url.hash = '';
  url.searchParams.set('collection', collectionId);
  return url.toString();
}

export function validateSharedPage(page: number) {
  if (!Number.isInteger(page) || page < 0 || page > 20) throw new Error('Invalid page.');
}
