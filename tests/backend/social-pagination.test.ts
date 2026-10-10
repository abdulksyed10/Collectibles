import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000009101';
const viewer = '00000000-0000-4000-8000-000000009102';
let db: PGlite;
let publisher: string;
let collection: string;
before(async () => {
  db = await createHierarchyFixture();
  await db.query("insert into auth.users(id,email) values ($1,'pages@example.test'),($2,'reader@example.test')", [owner, viewer]);
  await db.exec('update private.social_config set profiles_enabled=true,social_writes_enabled=true,likes_enabled=true');
  publisher = (await asOwner(db, owner, () => db.query<{ value: { publisherId: string } }>('select public.ensure_social_profile() as value'))).rows[0]!.value.publisherId;
  await asOwner(db, owner, async () => {
    await db.query("select public.accept_public_rules('2026-10-04')");
    collection = (await db.query<{ id: string }>("insert into public.collections(name) values ('Pages') returning id")).rows[0]!.id;
    // Same timestamps exercise the ID tie-breaker, not just date ordering.
    for (let i = 0; i < 51; i++) await db.query("insert into public.items(collection_id,title,visibility) values ($1,$2,'public')", [collection, `Entry ${i}`]);
  });
  await db.query("update public.items set created_at='2026-01-01' where collection_id=$1", [collection]);
  await asOwner(db, viewer, () => db.query('select public.set_following($1,true)', [publisher]));
});
after(async () => db?.close());

for (const kind of ['following', 'collector', 'collection']) test(`${kind} pagination returns every entry exactly once`, async () => {
  await asOwner(db, viewer, async () => {
    const ids: string[] = [];
    let cursor: unknown = null;
    do {
      const sql = kind === 'following' ? 'select public.list_following_entries($1,false) as value' : kind === 'collector' ? 'select public.list_collector_entries($2,$1) as value' : 'select public.get_visible_collection($2,$1) as value';
      const params = kind === 'following' ? [cursor] : [cursor, kind === 'collector' ? publisher : collection];
      const result = (await db.query<{ value: any }>(sql, params)).rows[0]!.value;
      const page = kind === 'collection' ? result.entries : result;
      assert.ok(page.items.length <= 24);
      ids.push(...page.items.map((row: { id: string }) => row.id));
      cursor = page.nextCursor;
      assert.ok(ids.length <= 51, 'pagination must terminate');
    } while (cursor);
    assert.equal(ids.length, 51);
    assert.equal(new Set(ids).size, 51);
  });
});

test('people and username search pagination include every result', async () => {
  for (let index = 0; index < 51; index++) {
    const id = `00000000-0000-4000-8000-${String(9200 + index).padStart(12, '0')}`;
    await db.query('insert into auth.users(id,email) values ($1,$2)', [id, `pageuser${index}@example.test`]);
    await asOwner(db, id, () => db.query('select public.ensure_social_profile()'));
    const target = (await db.query<{ public_id: string }>('select public_id from private.public_publishers where owner_id=$1', [id])).rows[0]!.public_id;
    await asOwner(db, viewer, () => db.query('select public.set_following($1,true)', [target]));
  }
  for (const kind of ['search', 'people']) await asOwner(db, viewer, async () => {
    const ids: string[] = []; let cursor: unknown = null;
    do {
      const sql = kind === 'search' ? "select public.search_collectors('pageuser',$1) as value" : "select public.list_people('following',$1) as value";
      const page = (await db.query<{ value: { items: Array<{ publisherId: string }>; nextCursor: unknown } }>(sql, [cursor])).rows[0]!.value;
      ids.push(...page.items.map(row => row.publisherId)); cursor = page.nextCursor;
      assert.ok(ids.length <= 52, 'pagination must terminate');
    } while (cursor);
    assert.equal(ids.length, kind === 'search' ? 51 : 52);
    assert.equal(new Set(ids).size, ids.length);
  });
});

test('malformed feed and people cursors are rejected with safe validation errors', async () => {
  await asOwner(db, viewer, async () => {
    for (const cursor of ['[]', '{}', '{"createdAt":null,"id":null}', '{"createdAt":"infinity","id":"00000000-0000-4000-8000-000000009101"}']) {
      await assert.rejects(() => db.query('select public.list_following_entries($1,false)', [cursor]), /Invalid page/);
    }
    for (const cursor of ['[]', '{}', '{"username":null,"publisherId":null}']) {
      await assert.rejects(() => db.query("select public.list_people('following',$1)", [cursor]), /Invalid page/);
    }
  });
});

test('a collector blocked by the publisher can read public content but cannot like it', async () => {
  const target = (await db.query<{ id: string }>('select id from public.items where collection_id=$1 limit 1', [collection])).rows[0]!.id;
  const reader = (await asOwner(db, viewer, () => db.query<{ value: { publisherId: string } }>('select public.ensure_social_profile() as value'))).rows[0]!.value.publisherId;
  await asOwner(db, owner, () => db.query('select public.block_collector($1)', [reader]));
  await asOwner(db, viewer, async () => {
    assert.ok((await db.query<{ value: unknown }>('select public.get_shared_entry($1) as value', [target])).rows[0]!.value);
    await assert.rejects(() => db.query('select public.set_item_liked($1,true)', [target]), /unavailable/i);
  });
});
