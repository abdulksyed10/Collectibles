import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000941';
const reporters = [
  '00000000-0000-4000-8000-000000000942',
  '00000000-0000-4000-8000-000000000943',
  '00000000-0000-4000-8000-000000000944',
  '00000000-0000-4000-8000-000000000945',
  '00000000-0000-4000-8000-000000000946',
];

let db: PGlite;
let collectionId: string;
let itemId: string;
let secondItemId: string;

async function publicEntryIds() {
  await db.exec('SET ROLE anon;');
  try {
    const page = (await db.query<{ page: { entries: Array<{ id: string }> } }>('SELECT public.list_public_entries(0) AS page')).rows[0]!.page;
    return page.entries.map(entry => entry.id);
  } finally {
    await db.exec('RESET ROLE;');
  }
}

async function reportItem(reporter: string, reason = 'spam') {
  await asOwner(db, reporter, async () => {
    const result = (await db.query<{ reported: boolean }>("SELECT public.report_public_content($1, null, $2, '') AS reported", [itemId, reason])).rows[0]!;
    assert.equal(result.reported, true);
  });
}

async function reportCollection(reporter: string) {
  await asOwner(db, reporter, async () => {
    const result = (await db.query<{ reported: boolean }>("SELECT public.report_public_content(null, $1, 'spam', '') AS reported", [collectionId])).rows[0]!;
    assert.equal(result.reported, true);
  });
}

before(async () => {
  db = await createHierarchyFixture();
  await db.query(`INSERT INTO auth.users(id) VALUES ${[owner, ...reporters].map((_, index) => `($${index + 1})`).join(',')}`, [owner, ...reporters]);
  await asOwner(db, owner, async () => {
    await db.query("SELECT public.accept_public_rules('2026-10-04')");
    collectionId = (await db.query<{ id: string }>("INSERT INTO collections(name, description) VALUES ('Reported collection', '') RETURNING id")).rows[0]!.id;
    itemId = (await db.query<{ id: string }>("INSERT INTO items(collection_id, title, visibility) VALUES ($1, 'Public entry', 'public') RETURNING id", [collectionId])).rows[0]!.id;
    secondItemId = (await db.query<{ id: string }>("INSERT INTO items(collection_id, title, visibility) VALUES ($1, 'Second public entry', 'public') RETURNING id", [collectionId])).rows[0]!.id;
  });
  await db.query("INSERT INTO item_images(item_id, owner_id, full_key, thumb_key, bytes) VALUES ($1, $2, 'one/full.jpg', 'one/thumb.jpg', 100)", [itemId, owner]);
});

after(async () => db?.close());

test('public entries appear immediately and remain public after a photo is attached', async () => {
  assert.deepEqual(await publicEntryIds(), [secondItemId, itemId]);
  const publication = (await db.query<{ status: string }>('SELECT status FROM private.item_publication WHERE item_id=$1', [itemId])).rows[0]!;
  assert.equal(publication.status, 'published');
  assert.equal((await db.query('SELECT * FROM private.resolve_public_image($1, $2)', [collectionId, itemId])).rows.length, 1);
});

test('five distinct member reports hide one item while duplicate reports do not count twice', async () => {
  await reportItem(reporters[0]!);
  await reportItem(reporters[0]!, 'scam');
  const duplicateCount = (await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM private.public_content_reports WHERE item_id=$1', [itemId])).rows[0]!;
  assert.equal(duplicateCount.count, 1);

  for (const reporter of reporters.slice(1, 4)) await reportItem(reporter);
  assert.deepEqual(await publicEntryIds(), [secondItemId, itemId]);

  await reportItem(reporters[4]!);
  assert.deepEqual(await publicEntryIds(), [secondItemId]);
  const publication = (await db.query<{ status: string }>('SELECT status FROM private.item_publication WHERE item_id=$1', [itemId])).rows[0]!;
  assert.equal(publication.status, 'review');
  assert.deepEqual((await db.query('SELECT * FROM private.resolve_public_image($1, $2)', [collectionId, itemId])).rows, []);
});

test('five distinct member reports hide a reported collection and every public entry within it', async () => {
  for (const reporter of reporters) await reportCollection(reporter);
  assert.deepEqual(await publicEntryIds(), []);
  const collectionPublication = (await db.query<{ status: string }>('SELECT status FROM private.collection_publication WHERE collection_id=$1', [collectionId])).rows[0]!;
  assert.equal(collectionPublication.status, 'review');
});

test('public-facing profanity is rejected while private content remains private', async () => {
  await asOwner(db, owner, async () => {
    await assert.rejects(() => db.query("INSERT INTO items(collection_id, title, visibility) VALUES ($1, 'sh!t test', 'public')", [collectionId]), /public/i);
    await db.query("INSERT INTO items(collection_id, title, visibility) VALUES ($1, 'sh!t test', 'private')", [collectionId]);
    await assert.rejects(() => db.query("UPDATE collections SET name='sh!t collection' WHERE id=$1", [collectionId]), /public/i);
  });
});
