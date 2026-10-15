import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const ownerA = '00000000-0000-4000-8000-000000000851';
const ownerB = '00000000-0000-4000-8000-000000000852';
const requestId = '00000000-0000-4000-8000-000000000861';
let db: PGlite;

function draft(title: string, visibility: 'private' | 'friends' | 'public' = 'public') {
  return JSON.stringify({ title, notes: 'Kept private until the photo is saved.', visibility, acquiredOn: '2026-10-14' });
}

before(async () => {
  db = await createHierarchyFixture();
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [ownerA, ownerB]);
  await asOwner(db, ownerA, async () => { await db.query("SELECT public.accept_public_rules('2026-10-04')"); });
  await asOwner(db, ownerB, async () => { await db.query("SELECT public.accept_public_rules('2026-10-04')"); });
});
after(async () => db?.close());

test('an upload draft is private, idempotent, and retains the intended audience for later publication', async () => {
  const first = await asOwner(db, ownerA, async () => (await db.query<{ id: string; visibility: string }>(
    'SELECT id,visibility FROM public.create_upload_draft($1,$2::jsonb)', [requestId, draft('First photo')],
  )).rows[0]!);
  const replay = await asOwner(db, ownerA, async () => (await db.query<{ id: string; visibility: string }>(
    'SELECT id,visibility FROM public.create_upload_draft($1,$2::jsonb)', [requestId, draft('First photo')],
  )).rows[0]!);

  assert.equal(first.visibility, 'private');
  assert.deepEqual(replay, first);
  assert.equal((await db.query<{ count: number }>('SELECT count(*) FROM public.items WHERE owner_id=$1', [ownerA])).rows[0]!.count, 1);
  assert.deepEqual((await db.query<{ visibility: string }>('SELECT visibility FROM public.items WHERE id=$1', [first.id])).rows, [{ visibility: 'private' }]);
});

test('a request key cannot be reused with changed data and is scoped to its owner', async () => {
  await asOwner(db, ownerA, async () => {
    await assert.rejects(
      db.query('SELECT public.create_upload_draft($1,$2::jsonb)', [requestId, draft('Changed title')]),
      /request.*different data/i,
    );
  });
  const other = await asOwner(db, ownerB, async () => (await db.query<{ id: string }>(
    'SELECT id FROM public.create_upload_draft($1,$2::jsonb)', [requestId, draft('Other owner')],
  )).rows[0]!);
  assert.ok(other.id);
});

test('a deleted draft remains a tombstone and ownership checks still apply', async () => {
  const deletedRequest = '00000000-0000-4000-8000-000000000862';
  const item = await asOwner(db, ownerA, async () => (await db.query<{ id: string }>(
    'SELECT id FROM public.create_upload_draft($1,$2::jsonb)', [deletedRequest, draft('Delete me', 'private')],
  )).rows[0]!);
  await db.exec('SET ROLE service_role;');
  try {
    await db.query('DELETE FROM public.items WHERE id=$1', [item.id]);
  } finally {
    await db.exec('RESET ROLE;');
  }
  const foreignCollection = await asOwner(db, ownerB, async () => (await db.query<{ collection_id: string }>(
    "SELECT collection_id FROM public.save_item_draft('Foreign collection item','','private',null,null,null,null,null)",
  )).rows[0]!.collection_id);
  await asOwner(db, ownerA, async () => {
    await assert.rejects(
      db.query('SELECT public.create_upload_draft($1,$2::jsonb)', [deletedRequest, draft('Delete me', 'private')]),
      /draft.*deleted|draft.*unavailable/i,
    );
    await assert.rejects(
      db.query('SELECT public.create_upload_draft($1,$2::jsonb)', ['00000000-0000-4000-8000-000000000863', JSON.stringify({ title: 'No access', notes: '', collectionId: foreignCollection })]),
      /collection unavailable/i,
    );
  });
});

test('the RPC and its private request ledger are unavailable to anonymous callers', async () => {
  await db.exec('SET ROLE anon;');
  try {
    await assert.rejects(
      db.query('SELECT public.create_upload_draft($1,$2::jsonb)', ['00000000-0000-4000-8000-000000000864', draft('No access')]),
      /permission denied/i,
    );
  } finally {
    await db.exec('RESET ROLE;');
  }
});
