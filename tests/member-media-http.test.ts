import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemberMediaHandler } from '../supabase/functions/member-media/http.ts';

const owner = '00000000-0000-4000-8000-000000001401';
const friend = '00000000-0000-4000-8000-000000001402';
const item = '00000000-0000-4000-8000-000000001403';
const handler = createMemberMediaHandler({
  origins: ['https://www.sharecollectibles.com'],
  authenticate: async token => token === 'valid' ? friend : token === 'owner' ? owner : null,
  lookup: async (viewer, itemId, size) => viewer === friend && itemId === item && size === 'thumb' ? 'private/thumb.jpg' : null,
  read: async key => key === 'private/thumb.jpg' ? new Uint8Array([255, 216, 255, 217]) : new Uint8Array(),
});

function request(path = `?itemId=${item}&size=thumb`, headers: Record<string, string> = {}) {
  return new Request(`https://function.example/member-media${path}`, { method: 'GET', headers });
}

test('member media rejects missing or invalid credentials before lookup', async () => {
  let lookedUp = false;
  const guarded = createMemberMediaHandler({ origins: [], authenticate: async () => null, lookup: async () => { lookedUp = true; return null; }, read: async () => new Uint8Array() });
  assert.equal((await guarded(request())).status, 401);
  assert.equal(lookedUp, false);
  assert.equal((await guarded(request('', { authorization: 'Bearer invalid' }))).status, 401);
  assert.equal(lookedUp, false);
});

test('member media returns authenticated JPEG bytes with no-store and bounded CORS', async () => {
  const response = await handler(request(undefined, { authorization: 'Bearer valid', origin: 'https://www.sharecollectibles.com' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('vary'), 'Origin, Authorization');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://www.sharecollectibles.com');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([255, 216, 255, 217]));
  const native = await handler(request(undefined, { authorization: 'Bearer valid' }));
  assert.equal(native.status, 200);
  assert.equal(native.headers.get('access-control-allow-origin'), null);
});

test('member media never reads storage for denied or malformed requests', async () => {
  let reads = 0;
  const guarded = createMemberMediaHandler({ origins: [], authenticate: async () => friend, lookup: async () => null, read: async () => { reads += 1; return new Uint8Array(); } });
  assert.equal((await guarded(request(undefined, { authorization: 'Bearer valid' }))).status, 404);
  assert.equal(reads, 0);
  assert.equal((await handler(request('?itemId=bad&size=thumb', { authorization: 'Bearer valid' }))).status, 400);
  assert.equal((await handler(request(`?itemId=${item}&size=full&extra=1`, { authorization: 'Bearer valid' }))).status, 400);
  assert.equal((await handler(request(undefined, { authorization: 'Bearer valid', origin: 'https://hostile.example' }))).status, 403);
});

test('member media preflight permits only supported methods and request headers', async () => {
  const response = await handler(new Request('https://function.example/member-media', { method: 'OPTIONS', headers: { origin: 'https://www.sharecollectibles.com', 'access-control-request-method': 'GET' } }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /authorization/i);
  assert.equal((await handler(new Request('https://function.example/member-media', { method: 'POST' }))).status, 405);
});
