import { MediaError } from '../media/validation.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createMemberMediaHandler(options: {
  origins: string[];
  authenticate: (token: string) => Promise<string | null>;
  lookup: (viewer: string, itemId: string, size: 'full' | 'thumb') => Promise<string | null>;
  read: (key: string) => Promise<Uint8Array>;
}) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = new Headers({
      'cache-control': 'private, no-store, max-age=0',
      vary: 'Origin, Authorization',
      'x-content-type-options': 'nosniff',
    });
    if (origin && options.origins.includes(origin)) {
      headers.set('access-control-allow-origin', origin);
      headers.set('access-control-allow-methods', 'GET, OPTIONS');
      headers.set('access-control-allow-headers', 'authorization, apikey, x-client-info');
      headers.set('access-control-max-age', '600');
    }
    const error = (status: number, code: string) => {
      const responseHeaders = new Headers(headers);
      responseHeaders.set('content-type', 'application/json');
      return new Response(JSON.stringify({ error: code }), { status, headers: responseHeaders });
    };
    if (origin && !options.origins.includes(origin)) return error(403, 'origin_denied');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return error(405, 'method_not_allowed');

    const authorization = request.headers.get('authorization');
    const match = authorization?.match(/^Bearer ([^\s]{1,8192})$/i);
    if (!match) return error(401, 'authentication_required');
    let viewer: string | null;
    try {
      viewer = await options.authenticate(match[1]);
    } catch {
      return error(401, 'invalid_token');
    }
    if (!viewer) return error(401, 'invalid_token');

    const url = new URL(request.url);
    const itemId = url.searchParams.get('itemId');
    const size = url.searchParams.get('size');
    if (url.searchParams.size !== 2 || !itemId || !UUID.test(itemId) || (size !== 'full' && size !== 'thumb')) {
      return error(400, 'invalid_request');
    }
    try {
      const key = await options.lookup(viewer, itemId, size);
      if (!key) return error(404, 'not_found');
      const bytes = await options.read(key);
      headers.set('content-type', 'image/jpeg');
      return new Response(new Uint8Array(bytes), { status: 200, headers });
    } catch (cause) {
      if (cause instanceof MediaError) return error(cause.status, cause.code);
      return error(503, 'service_unavailable');
    }
  };
}
