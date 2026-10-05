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
    collectionId = (await db.query<{ id: string }>("INSERT INTO collections(name,description) VALUES ('Review queue','') RETURNING id")).rows[0]!.id;
    await db.query("SELECT public.accept_public_rules('2026-10-04')");
    itemId = (await db.query<{ id: string }>("INSERT INTO items(collection_id,title,visibility) VALUES ($1,'Submitted pin','public') RETURNING id", [collectionId])).rows[0]!.id;
  });
});
after(async () => db?.close());

test('public intent begins pending and is absent from entries, topics, and public image resolution', async () => {
  assert.deepEqual(await publicEntries(), []);
  await db.exec('SET ROLE anon;');
  try {
    assert.deepEqual((await db.query<{ list_public_topics: { topics: unknown[] } }>('SELECT public.list_public_topics(0)')).rows[0]!.list_public_topics.topics, []);
  } finally { await db.exec('RESET ROLE;'); }
  assert.deepEqual((await db.query('SELECT * FROM private.resolve_public_image($1,$2)', [collectionId, itemId])).rows, []);
});

test('only an approved current revision becomes public and an edit returns it to pending', async () => {
  const publication = (await db.query<{ revision: number }>('SELECT revision FROM private.item_publication WHERE item_id=$1', [itemId])).rows[0]!;
  await db.query("UPDATE private.item_publication SET status='approved', approved_revision=revision, reviewed_at=now() WHERE item_id=$1", [itemId]);
  assert.deepEqual((await publicEntries()).map(entry => entry.id), [itemId]);
  await asOwner(db, owner, async () => { await db.query("UPDATE items SET title='Changed after review' WHERE id=$1", [itemId]); });
  const afterEdit = (await db.query<{ status: string; revision: number; approved_revision: number | null }>('SELECT status,revision,approved_revision FROM private.item_publication WHERE item_id=$1', [itemId])).rows[0]!;
  assert.equal(afterEdit.status, 'pending');
  assert.equal(afterEdit.revision, publication.revision + 1);
  assert.equal(afterEdit.approved_revision, null);
  assert.deepEqual(await publicEntries(), []);
});

test('app roles cannot approve or read private moderation state', async () => {
  await asOwner(db, owner, async () => {
    await assert.rejects(() => db.query("UPDATE private.item_publication SET status='approved' WHERE item_id=$1", [itemId]));
    await assert.rejects(() => db.query('SELECT * FROM private.item_publication'));
  });
});

test('operator review refuses stale revisions and private entries; owner sees private after unpublishing', async () => {
  const { revision } = (await db.query<{revision:number}>('SELECT revision FROM private.item_publication WHERE item_id=$1', [itemId])).rows[0]!;
  await assert.rejects(() => db.query("SELECT private.review_publication($1,$2,'approved')", [itemId, revision - 1]), /revision changed/);
  await db.query("SELECT private.review_publication($1,$2,'approved')", [itemId, revision]);
  await asOwner(db, owner, async () => {
    await db.query("UPDATE items SET visibility='private' WHERE id=$1", [itemId]);
    assert.equal((await db.query<{v:{status:string}}>('SELECT public.get_owned_publication($1) AS v', [itemId])).rows[0]!.v.status, 'private');
  });
  await assert.rejects(() => db.query("SELECT private.review_publication($1,$2,'approved')", [itemId, revision]), /private/);
});

test('attaching a photo and renaming a collection invalidate approval; private notes do not',async()=>{
  await asOwner(db,owner,async()=>{await db.query("UPDATE items SET visibility='public' WHERE id=$1",[itemId]);});
  await db.query("UPDATE private.item_publication SET status='approved',approved_revision=revision WHERE item_id=$1",[itemId]);
  await asOwner(db,owner,async()=>{await db.query("UPDATE items SET notes='Private notes' WHERE id=$1",[itemId]);});
  assert.equal((await publicEntries()).length,1);
  await db.query('INSERT INTO item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES($1,$2,$3,$4,100)',[itemId,owner,`${owner}/${itemId}/full.jpg`,`${owner}/${itemId}/thumb.jpg`]);
  assert.equal((await publicEntries()).length,0);
  assert.deepEqual((await db.query('SELECT * FROM private.resolve_public_image($1,$2)',[collectionId,itemId])).rows,[]);
  await db.query("UPDATE private.item_publication SET status='approved',approved_revision=revision WHERE item_id=$1",[itemId]);
  assert.equal((await db.query('SELECT * FROM private.resolve_public_image($1,$2)',[collectionId,itemId])).rows.length,1);
  await asOwner(db,owner,async()=>{await db.query("UPDATE collections SET name='Changed name' WHERE id=$1",[collectionId]);});
  assert.equal((await publicEntries()).length,0);
});
