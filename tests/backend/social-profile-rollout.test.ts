import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const first = '00000000-0000-4000-8000-000000009701';
const second = '00000000-0000-4000-8000-000000009702';
const publisher = '00000000-0000-4000-8000-000000009703';

async function withDatabase(run: (db: PGlite) => Promise<void>) {
  const db = await createHierarchyFixture();
  try { await run(db); } finally { await db.close(); }
}

async function profile(db: PGlite, owner: string) {
  return asOwner(db, owner, async () => (
    await db.query<{ value: { username: string; publisherId: string } }>('select public.ensure_social_profile() as value')
  ).rows[0]!.value);
}

test('generated handles that match prohibited terms fall back without exposing email text', async () => {
  await withDatabase(async db => {
    await db.query("insert into auth.users(id,email) values ($1,'fuck_you@example.test'),($2,'fuck.you@another.test')", [first, second]);
    await db.query('update private.social_config set profiles_enabled=true where singleton=true');

    const firstProfile = await profile(db, first);
    const secondProfile = await profile(db, second);
    assert.equal(firstProfile.username, 'collector');
    assert.match(secondProfile.username, /^collector_\d+$/);
    assert.equal(JSON.stringify([firstProfile, secondProfile]).includes('fuck'), false);
  });
});

test('intro completion is idempotent and later handle changes obey the shared write limit', async () => {
  await withDatabase(async db => {
    await db.query("insert into auth.users(id,email) values ($1,'first@example.test')", [first]);
    await db.query('update private.social_config set profiles_enabled=true,social_writes_enabled=true,username_changes_per_day=1 where singleton=true');
    await profile(db, first);

    await asOwner(db, first, async () => {
      await db.query("select public.complete_profile_intro('firsthandle')");
      await db.query("select public.complete_profile_intro('firsthandle')");
      await db.query("select public.complete_profile_intro('secondhandle')");
      await assert.rejects(() => db.query("select public.update_username('thirdhandle')"), /limited|changes/i);
    });
    const counter = (await db.query<{ count: number }>("select count from private.social_action_counters where actor_id=$1 and action='username_rename'", [first])).rows[0]?.count;
    assert.equal(counter, 1);
  });
});

test('paused social writes permit completing the unchanged suggested handle but deny handle changes', async () => {
  await withDatabase(async db => {
    await db.query("insert into auth.users(id,email) values ($1,'first@example.test')", [first]);
    await db.query('update private.social_config set profiles_enabled=true,social_writes_enabled=true where singleton=true');
    const generated = await profile(db, first);
    await db.query('update private.social_config set social_writes_enabled=false where singleton=true');

    await asOwner(db, first, async () => {
      const completed = (await db.query<{ value: { introCompletedAt: string | null } }>('select public.complete_profile_intro($1) as value', [generated.username])).rows[0]!.value;
      assert.ok(completed.introCompletedAt);
      await assert.rejects(() => db.query("select public.complete_profile_intro('otherhandle')"), /not available|following/i);
      await assert.rejects(() => db.query("select public.update_username('otherhandle')"), /not available|following/i);
    });
  });
});

test('disabled profiles do not publish usernames through legacy or social projections', async () => {
  await withDatabase(async db => {
    await db.query("insert into auth.users(id,email) values ($1,'publisher@example.test')", [publisher]);
    await db.query('update private.social_config set profiles_enabled=true,social_writes_enabled=true where singleton=true');
    const identity = await profile(db, publisher);
    const { collectionId, itemId } = await asOwner(db, publisher, async () => {
      await db.query("select public.accept_public_rules('2026-10-04')");
      const collectionId = (await db.query<{ id: string }>("insert into public.collections(name) values ('Pins') returning id")).rows[0]!.id;
      const itemId = (await db.query<{ id: string }>("insert into public.items(collection_id,title,visibility) values ($1,'Published pin','public') returning id", [collectionId])).rows[0]!.id;
      return { collectionId, itemId };
    });
    await db.query('update private.social_config set profiles_enabled=false where singleton=true');

    await db.exec('set role anon;');
    try {
      const entries = (await db.query<{ value: { entries: Array<{ creator: { username: string | null } }> } }>('select public.list_public_entries(0) as value')).rows[0]!.value;
      const collections = (await db.query<{ value: { collections: Array<{ creator: { username: string | null } }> } }>('select public.list_public_collections(0) as value')).rows[0]!.value;
      const shared = (await db.query<{ value: { collection: { creator: { username: string | null } } } }>('select public.get_shared_collection($1,0) as value', [collectionId])).rows[0]!.value;
      const entry = (await db.query<{ value: { creator: { username: string | null } } }>('select public.get_shared_entry($1) as value', [itemId])).rows[0]!.value;
      const visible = (await db.query<{ value: { collection: { creator: { username: string | null } } } }>('select public.get_visible_collection($1,null) as value', [collectionId])).rows[0]!.value;
      assert.equal(entries.entries[0]?.creator.username, null);
      assert.equal(collections.collections[0]?.creator.username, null);
      assert.equal(shared.collection.creator.username, null);
      assert.equal(entry.creator.username, null);
      assert.equal(visible.collection.creator.username, null);
      await assert.rejects(() => db.query('select * from private.collector_profiles'), /permission denied/i);
      await assert.rejects(() => db.query('select public.ensure_social_profile()'), /sign in required|permission denied/i);
      assert.match(identity.publisherId, /^[0-9a-f-]{36}$/i);
    } finally { await db.exec('reset role;'); }
  });
});
