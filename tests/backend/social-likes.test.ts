import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000001511';
const friend = '00000000-0000-4000-8000-000000001512';
const stranger = '00000000-0000-4000-8000-000000001513';
let db: PGlite;
let ownerPublisher = '';
let friendPublisher = '';
let publicItem = '';
let friendsItem = '';

async function profile(actor: string) { return asOwner(db, actor, async () => (await db.query<{ value: { publisherId: string } }>('select public.ensure_social_profile() as value')).rows[0]!.value.publisherId); }
async function state(actor: string, ids: string[]) { return asOwner(db, actor, async () => (await db.query<{ value: Record<string, { count: number; likedByMe: boolean }> }>('select public.get_entry_social_state($1) as value', [ids])).rows[0]!.value); }

before(async () => {
  db = await createHierarchyFixture();
  await db.query("insert into auth.users(id,email,created_at) values($1,'owner@test.local',now()),($2,'friend@test.local',now()),($3,'stranger@test.local',now())", [owner, friend, stranger]);
  await db.query('update private.social_config set profiles_enabled=true,social_writes_enabled=true,friends_sharing_enabled=true,likes_enabled=true where singleton=true');
  ownerPublisher = await profile(owner); friendPublisher = await profile(friend); await profile(stranger);
  await asOwner(db, owner, async () => {
    await db.query("select public.accept_public_rules('2026-10-04')");
    const collection = (await db.query<{ id: string }>("insert into public.collections(name,description) values ('Likes','') returning id")).rows[0]!.id;
    publicItem = (await db.query<{ id: string }>("insert into public.items(collection_id,title,visibility) values($1,'Public','public') returning id", [collection])).rows[0]!.id;
    friendsItem = (await db.query<{ id: string }>("insert into public.items(collection_id,title,visibility) values($1,'Friends','friends') returning id", [collection])).rows[0]!.id;
    await db.query('select public.set_following($1,true)', [friendPublisher]);
  });
  await asOwner(db, friend, async () => { await db.query('select public.set_following($1,true)', [ownerPublisher]); });
});
after(async () => db?.close());

test('likes are desired-state, hidden from unauthorized viewers, and support mutual Friends-only entries', async () => {
  await asOwner(db, friend, async () => { await db.query('select public.set_item_liked($1,true)', [friendsItem]); });
  assert.deepEqual(await state(friend, [friendsItem]), { [friendsItem]: { count: 1, likedByMe: true } });
  assert.deepEqual(await state(stranger, [friendsItem]), {});
  await asOwner(db, friend, async () => { await db.query('select public.set_item_liked($1,true)', [friendsItem]); });
  assert.equal((await state(friend, [friendsItem]))[friendsItem]!.count, 1);
  await asOwner(db, friend, async () => { await db.query('select public.set_item_liked($1,false)', [friendsItem]); });
  assert.deepEqual(await state(friend, [friendsItem]), { [friendsItem]: { count: 0, likedByMe: false } });
  await asOwner(db, stranger, async () => { await assert.rejects(() => db.query('select public.set_item_liked($1,true)', [friendsItem]), /unavailable/i); });
  await asOwner(db, owner, async () => { await assert.rejects(() => db.query('select public.set_item_liked($1,true)', [publicItem]), /unavailable/i); });
});

test('likes fail closed when visibility is revoked but a member may remove their own old like', async () => {
  await asOwner(db, friend, async () => { await db.query('select public.set_item_liked($1,true)', [friendsItem]); });
  await asOwner(db, friend, async () => { await db.query('select public.set_following($1,false)', [ownerPublisher]); });
  await asOwner(db, friend, async () => { await assert.rejects(() => db.query('select public.set_item_liked($1,true)', [friendsItem]), /unavailable/i); await db.query('select public.set_item_liked($1,false)', [friendsItem]); });
  assert.deepEqual(await state(friend, [friendsItem]), {});
});
