import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000801';
let db: PGlite;
let collectionId: string;

before(async () => {
  db = await createHierarchyFixture();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
  collectionId = await asOwner(db, owner, async () => (await db.query<{ id: string }>("INSERT INTO collections(name,description) VALUES ('Pins','') RETURNING id")).rows[0]!.id);
});
after(async () => db?.close());

test('owners can set or clear an acquired date on an item without putting dates in public data', async () => {
  const itemId = await asOwner(db, owner, async () => (await db.query<{ id: string }>("INSERT INTO items(collection_id,title,acquired_on,visibility) VALUES ($1,'Park pin','2026-09-28','public') RETURNING id", [collectionId])).rows[0]!.id);
  await asOwner(db, owner, async () => {
    assert.deepEqual((await db.query<{ acquired_on: string | null }>('SELECT acquired_on::text FROM items WHERE id=$1', [itemId])).rows, [{ acquired_on: '2026-09-28' }]);
    await db.query('UPDATE items SET acquired_on=null WHERE id=$1', [itemId]);
    assert.deepEqual((await db.query<{ acquired_on: string | null }>('SELECT acquired_on::text FROM items WHERE id=$1', [itemId])).rows, [{ acquired_on: null }]);
  });
  await db.exec('SET ROLE anon;');
  try {
    const result = await db.query<{ list_public_entries: { entries: Array<Record<string, unknown>> } }>('SELECT public.list_public_entries(0)');
    assert.ok(result.rows[0]!.list_public_entries.entries.some(entry => entry.id === itemId));
    assert.equal(result.rows[0]!.list_public_entries.entries.some(entry => 'acquiredOn' in entry || 'acquired_on' in entry), false);
  } finally {
    await db.exec('RESET ROLE;');
  }
});
