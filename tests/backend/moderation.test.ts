import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000901';
let db: PGlite;
let collectionId: string;
let itemId: string;

async function publicEntries() {
  await db.exec('SET ROLE anon;');
  try { return (await db.query<{ list_public_entries: { entries: Array<{ id: string }> } }>('SELECT public.list_public_entries(0)')).rows[0]!.list_public_entries.entries; }
  finally { await db.exec('RESET ROLE;'); }
}

before(async () => {
  db = await createHierarchyFixture();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
  await asOwner(db, owner, async () => {
    await db.query("SELECT public.accept_public_rules('2026-10-04')");
    collectionId = (await db.query<{ id: string }>("INSERT INTO collections(name,description) VALUES ('Published items','') RETURNING id")).rows[0]!.id;
    itemId = (await db.query<{ id: string }>("INSERT INTO items(collection_id,title,visibility) VALUES ($1,'Published pin','public') RETURNING id", [collectionId])).rows[0]!.id;
  });
});
after(async () => db?.close());

test('owners cannot directly read or alter private publication state', async () => {
  await asOwner(db, owner, async () => {
    await assert.rejects(() => db.query("UPDATE private.item_publication SET status='removed' WHERE item_id=$1", [itemId]));
    await assert.rejects(() => db.query('SELECT * FROM private.item_publication'));
  });
});

test('public edits, collection names, and photo changes retain immediate publication', async () => {
  assert.deepEqual((await publicEntries()).map(entry => entry.id), [itemId]);
  await asOwner(db, owner, async () => {
    await db.query("UPDATE items SET title='Changed public pin', notes='Private note' WHERE id=$1", [itemId]);
    await db.query("UPDATE collections SET name='Changed collection name' WHERE id=$1", [collectionId]);
  });
  await db.query('INSERT INTO item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES($1,$2,$3,$4,100)', [itemId, owner, `${owner}/${itemId}/full.jpg`, `${owner}/${itemId}/thumb.jpg`]);
  assert.deepEqual((await publicEntries()).map(entry => entry.id), [itemId]);
  assert.equal((await db.query('SELECT * FROM private.resolve_public_image($1,$2)', [collectionId, itemId])).rows.length, 1);
  const publication = (await db.query<{ status: string }>('SELECT status FROM private.item_publication WHERE item_id=$1', [itemId])).rows[0]!;
  assert.equal(publication.status, 'published');
});

test('owners can make a public item private and see the private status', async () => {
  await asOwner(db, owner, async () => {
    await db.query("UPDATE items SET visibility='private' WHERE id=$1", [itemId]);
    const publication = (await db.query<{ value: { status: string } }>('SELECT public.get_owned_publication($1) AS value', [itemId])).rows[0]!.value;
    assert.equal(publication.status, 'private');
  });
  assert.deepEqual(await publicEntries(), []);
});
