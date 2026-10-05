import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { createMediaService, type Database, type Session } from '../../supabase/functions/media/service.ts';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000971';
const admin = '00000000-0000-4000-8000-000000000972';
const member = '00000000-0000-4000-8000-000000000973';
const reporters = [
  '00000000-0000-4000-8000-000000000974',
  '00000000-0000-4000-8000-000000000975',
  '00000000-0000-4000-8000-000000000976',
  '00000000-0000-4000-8000-000000000977',
  '00000000-0000-4000-8000-000000000978',
];

let pg: PGlite;
let db: Database;
let media: ReturnType<typeof createMediaService>;
let itemId: string;
const thumbnail = new Uint8Array([255, 216, 255, 217]);

before(async () => {
  pg = await createHierarchyFixture();
  const session = (client: PGlite): Session => ({ query: async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[] });
  db = { ...session(pg), transaction: run => pg.transaction(tx => run(session(tx))) };
  media = createMediaService(db, {
    async put() {},
    async remove() {},
    async sign() { return 'https://private.example/image'; },
    async get(key) { assert.equal(key, 'review/thumb.jpg'); return thumbnail; },
  }, async () => {});

  await pg.query(`INSERT INTO auth.users(id) VALUES ${[owner, admin, member, ...reporters].map((_, index) => `($${index + 1})`).join(',')}`, [owner, admin, member, ...reporters]);
  await pg.query('INSERT INTO private.app_admins(owner_id) VALUES ($1)', [admin]);
  await asOwner(pg, owner, async () => {
    await pg.query("SELECT public.accept_public_rules('2026-10-04')");
    const collectionId = (await pg.query<{ id: string }>("INSERT INTO collections(name, description) VALUES ('Reviewed media', '') RETURNING id")).rows[0]!.id;
    itemId = (await pg.query<{ id: string }>("INSERT INTO items(collection_id, title, visibility) VALUES ($1, 'Reviewed image', 'public') RETURNING id", [collectionId])).rows[0]!.id;
  });
  await pg.query("INSERT INTO item_images(item_id, owner_id, full_key, thumb_key, bytes) VALUES ($1, $2, 'review/full.jpg', 'review/thumb.jpg', 4)", [itemId, owner]);
  for (const reporter of reporters) await asOwner(pg, reporter, async () => {
    await pg.query("SELECT public.report_public_content($1, null, 'spam', '')", [itemId]);
  });
});

after(async () => pg?.close());

test('review thumbnails are unavailable to normal users and available only to a database admin', async () => {
  await assert.rejects(media.handle(member, { action: 'read-review-thumbnail', itemId }), /administrator/i);
  const result = await media.handle(admin, { action: 'read-review-thumbnail', itemId }) as { itemId: string; thumbnailDataUrl: string };
  assert.equal(result.itemId, itemId);
  assert.equal(result.thumbnailDataUrl, 'data:image/jpeg;base64,/9j/2Q==');
});
