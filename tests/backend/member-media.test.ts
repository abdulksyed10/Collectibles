import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000001411';
const friend = '00000000-0000-4000-8000-000000001412';
const oneWay = '00000000-0000-4000-8000-000000001413';
const limiter = '00000000-0000-4000-8000-000000001414';
let db: PGlite;
let ownerPublisher = '';
let friendPublisher = '';
let itemId = '';

type MemberResult = { status: string; key?: string };

async function profileFor(actor: string) {
  return asOwner(db, actor, async () => (await db.query<{ value: { publisherId: string } }>('SELECT public.ensure_social_profile() AS value')).rows[0]!.value.publisherId);
}
async function memberResult(viewer: string | null, item = itemId, size: 'full' | 'thumb' = 'thumb') {
  return (await db.query<{ result: MemberResult }>('SELECT private.resolve_member_image($1,$2,$3) AS result', [viewer, item, size])).rows[0]!.result;
}
async function memberKey(viewer: string) {
  const result = await memberResult(viewer);
  return result.status === 'ok' ? result.key ?? null : null;
}

before(async () => {
  db = await createHierarchyFixture();
  await db.query("INSERT INTO auth.users(id,email,created_at) VALUES ($1,'owner@example.test',now()),($2,'friend@example.test',now()),($3,'oneway@example.test',now()),($4,'limiter@example.test',now())", [owner, friend, oneWay, limiter]);
  await db.query('UPDATE private.social_config SET profiles_enabled=true, social_writes_enabled=true, friends_sharing_enabled=true, member_reads_per_minute=20, member_reads_per_day=100 WHERE singleton=true');
  ownerPublisher = await profileFor(owner);
  friendPublisher = await profileFor(friend);
  await profileFor(oneWay);
  await asOwner(db, owner, async () => {
    await db.query("SELECT public.accept_public_rules('2026-10-04')");
    const collection = (await db.query<{ id: string }>("INSERT INTO public.collections(name,description) VALUES ('Friends photos','') RETURNING id")).rows[0]!.id;
    itemId = (await db.query<{ id: string }>("INSERT INTO public.items(collection_id,title,visibility) VALUES ($1,'Friends photo','friends') RETURNING id", [collection])).rows[0]!.id;
    await db.query('SELECT public.set_following($1,true)', [friendPublisher]);
  });
  await db.query("INSERT INTO public.item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES($1,$2,'owner/full.jpg','owner/thumb.jpg',4)", [itemId, owner]);
  await asOwner(db, friend, async () => { await db.query('SELECT public.set_following($1,true)', [ownerPublisher]); });
  await asOwner(db, oneWay, async () => { await db.query('SELECT public.set_following($1,true)', [ownerPublisher]); });
});
after(async () => db?.close());

test('only an owner or mutual follow can resolve a Friends-only storage key', async () => {
  assert.equal(await memberKey(owner), 'owner/thumb.jpg');
  assert.equal(await memberKey(friend), 'owner/thumb.jpg');
  assert.equal(await memberKey(oneWay), null);
  assert.equal((await memberResult(null)).status, 'not_found');
  assert.equal((await db.query('SELECT * FROM private.resolve_public_image((SELECT collection_id FROM public.items WHERE id=$1),$1)', [itemId])).rows.length, 0);
});

test('member image access is revoked after unfollow, block, review, or feature pause', async () => {
  await asOwner(db, friend, async () => { await db.query('SELECT public.set_following($1,false)', [ownerPublisher]); });
  assert.equal(await memberKey(friend), null);
  await asOwner(db, friend, async () => { await db.query('SELECT public.set_following($1,true)', [ownerPublisher]); });
  assert.equal(await memberKey(friend), 'owner/thumb.jpg');
  await asOwner(db, friend, async () => { await db.query('SELECT public.block_collector($1)', [ownerPublisher]); });
  assert.equal(await memberKey(friend), null);
  await asOwner(db, friend, async () => {
    await db.query('SELECT public.unblock_public_publisher($1)', [ownerPublisher]);
    await db.query('SELECT public.set_following($1,true)', [ownerPublisher]);
  });
  await asOwner(db, owner, async () => { await db.query('SELECT public.set_following($1,true)', [friendPublisher]); });
  assert.equal(await memberKey(friend), 'owner/thumb.jpg');
  await db.query("UPDATE private.item_publication SET status='review' WHERE item_id=$1", [itemId]);
  assert.equal(await memberKey(friend), null);
  await db.query("UPDATE private.item_publication SET status='published' WHERE item_id=$1", [itemId]);
  await db.query('UPDATE private.social_config SET friends_sharing_enabled=false WHERE singleton=true');
  assert.equal(await memberKey(friend), null);
  await db.query('UPDATE private.social_config SET friends_sharing_enabled=true WHERE singleton=true');
});

test('authenticated misses are rate limited before storage lookup', async () => {
  await db.query('UPDATE private.social_config SET member_reads_per_minute=1, member_reads_per_day=1 WHERE singleton=true');
  const missing = '00000000-0000-4000-8000-000000001499';
  assert.equal((await memberResult(limiter, missing)).status, 'not_found');
  assert.equal((await memberResult(limiter, missing)).status, 'limited');
});
