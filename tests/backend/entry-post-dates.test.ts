import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000811';
let db: PGlite;
let collectionId: string;

before(async () => {
  db = await createHierarchyFixture();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
  collectionId = await asOwner(db, owner, async () => {
    await db.query("SELECT public.accept_public_rules('2026-10-04')");
    return (await db.query<{ id: string }>("INSERT INTO collections(name,description) VALUES ('Dates','') RETURNING id")).rows[0]!.id;
  });
});
after(async () => db?.close());

test('the first committed image records an immutable server-owned posting date', async () => {
  const itemId = await asOwner(db, owner, async () => (await db.query<{ id: string }>("INSERT INTO items(collection_id,title,visibility) VALUES ($1,'New entry','private') RETURNING id", [collectionId])).rows[0]!.id);
  await db.exec('SET ROLE service_role;');
  try {
    await db.query("INSERT INTO public.item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,'post-date-full','post-date-thumb',100)", [itemId, owner]);
    const [afterFirst] = (await db.query<{ posted_at: string | null }>('SELECT posted_at::text FROM public.items WHERE id=$1', [itemId])).rows;
    assert.ok(afterFirst?.posted_at);
    await db.query("UPDATE public.items SET posted_at = posted_at WHERE id=$1", [itemId]);
    const [afterUpdate] = (await db.query<{ posted_at: string | null }>('SELECT posted_at::text FROM public.items WHERE id=$1', [itemId])).rows;
    assert.equal(afterUpdate?.posted_at, afterFirst?.posted_at);
  } finally {
    await db.exec('RESET ROLE;');
  }
});

test('the shared projection exposes only a labelled display date', async () => {
  const value = (await db.query<{ value: { kind: string; value: string } }>("SELECT private.entry_post_date_json('2020-02-29'::date, null, '2026-10-14T00:00:00Z'::timestamptz) AS value")).rows[0]!.value;
  assert.deepEqual(value, { kind: 'acquired', value: '2020-02-29' });
});
