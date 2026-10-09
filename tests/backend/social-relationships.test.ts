import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const alex = '00000000-0000-4000-8000-000000001201';
const blair = '00000000-0000-4000-8000-000000001202';
const casey = '00000000-0000-4000-8000-000000001203';
let db: PGlite;
let alexPublisher = '';
let blairPublisher = '';
let caseyPublisher = '';

type Relationship = { isFollowing: boolean; isFollower: boolean; isFriend: boolean; blockedByMe: boolean; interactionAllowed: boolean };

async function profileFor(owner: string) {
  return asOwner(db, owner, async () => (await db.query<{ profile: { publisherId: string } }>('SELECT public.ensure_social_profile() AS profile')).rows[0]!.profile.publisherId);
}
async function relationshipFor(owner: string, publisherId: string) {
  return asOwner(db, owner, async () => (await db.query<{ profile: { relationship: Relationship } | null }>('SELECT public.get_collector($1) AS profile', [publisherId])).rows[0]!.profile!.relationship);
}

before(async () => {
  db = await createHierarchyFixture();
  await db.query("INSERT INTO auth.users(id,email,created_at) VALUES ($1,'alex@example.test','2026-01-01'),($2,'blair@example.test','2026-01-02'),($3,'casey@example.test','2026-01-03')", [alex, blair, casey]);
  await db.query('UPDATE private.social_config SET profiles_enabled=true, social_writes_enabled=true WHERE singleton=true');
  alexPublisher = await profileFor(alex);
  blairPublisher = await profileFor(blair);
  caseyPublisher = await profileFor(casey);
});
after(async () => db?.close());

test('follows become friendship only when reciprocal, and one caller cannot remove another relationship', async () => {
  await asOwner(db, alex, async () => {
    const result = (await db.query<{ result: Relationship }>('SELECT public.set_following($1,true) AS result', [blairPublisher])).rows[0]!.result;
    assert.deepEqual(result, { isFollowing: true, isFollower: false, isFriend: false, blockedByMe: false, interactionAllowed: true });
    const repeat = (await db.query<{ result: Relationship }>('SELECT public.set_following($1,true) AS result', [blairPublisher])).rows[0]!.result;
    assert.deepEqual(repeat, result);
    await assert.rejects(() => db.query('SELECT public.set_following($1,true)', [alexPublisher]), /follow|yourself/i);
  });
  assert.deepEqual(await relationshipFor(blair, alexPublisher), { isFollowing: false, isFollower: true, isFriend: false, blockedByMe: false, interactionAllowed: true });

  await asOwner(db, blair, async () => { await db.query('SELECT public.set_following($1,true)', [alexPublisher]); });
  assert.equal((await relationshipFor(alex, blairPublisher)).isFriend, true);
  assert.equal((await relationshipFor(blair, alexPublisher)).isFriend, true);

  await asOwner(db, casey, async () => { await db.query('SELECT public.remove_follower($1)', [blairPublisher]); });
  assert.equal((await relationshipFor(alex, blairPublisher)).isFriend, true);

  await asOwner(db, blair, async () => { await db.query('SELECT public.remove_follower($1)', [alexPublisher]); });
  assert.deepEqual(await relationshipFor(alex, blairPublisher), { isFollowing: false, isFollower: true, isFriend: false, blockedByMe: false, interactionAllowed: true });
});

test('blocking is personal, removes both follow directions, and prevents refollow until unblocked', async () => {
  await asOwner(db, alex, async () => { await db.query('SELECT public.set_following($1,true)', [blairPublisher]); });
  assert.equal((await relationshipFor(alex, blairPublisher)).isFriend, true);

  await asOwner(db, alex, async () => { await db.query('SELECT public.block_collector($1)', [blairPublisher]); });
  assert.equal((await db.query<{ count: string }>('SELECT count(*)::text AS count FROM private.collector_follows WHERE (follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1)', [alex, blair])).rows[0]!.count, '0');
  assert.deepEqual(await relationshipFor(alex, blairPublisher), { isFollowing: false, isFollower: false, isFriend: false, blockedByMe: true, interactionAllowed: false });
  assert.equal((await relationshipFor(blair, alexPublisher)).interactionAllowed, false);
  await asOwner(db, blair, async () => { await assert.rejects(() => db.query('SELECT public.set_following($1,true)', [alexPublisher]), /block|follow/i); });

  await asOwner(db, alex, async () => {
    const result = (await db.query<{ result: boolean }>('SELECT public.unblock_public_publisher($1) AS result', [blairPublisher])).rows[0]!.result;
    assert.equal(result, true);
  });
  assert.equal((await relationshipFor(alex, blairPublisher)).isFriend, false);
});

test('follow limits count successful additions only and removals work while writes are paused', async () => {
  await db.query('UPDATE private.social_config SET max_follows=1, follows_per_hour=1, follows_per_day=1 WHERE singleton=true');
  await asOwner(db, casey, async () => {
    await db.query('SELECT public.set_following($1,true)', [alexPublisher]);
    await db.query('SELECT public.set_following($1,true)', [alexPublisher]);
    await assert.rejects(() => db.query('SELECT public.set_following($1,true)', [blairPublisher]), /limit/i);
  });
  await db.query('UPDATE private.social_config SET social_writes_enabled=false WHERE singleton=true');
  await asOwner(db, casey, async () => { await db.query('SELECT public.set_following($1,false)', [alexPublisher]); });
  assert.equal((await relationshipFor(casey, alexPublisher)).isFollowing, false);
});
test('profile search and personal people lists expose public handles without emails or hidden graph rows', async () => {
  await db.query('UPDATE private.social_config SET social_writes_enabled=true, max_follows=1000, follows_per_hour=60, follows_per_day=200 WHERE singleton=true');
  await asOwner(db, alex, async () => { await db.query('SELECT public.set_following($1,true)', [blairPublisher]); });
  await asOwner(db, alex, async () => {
    const search = (await db.query<{ page: { items: Array<{ publisherId: string; username: string; relationship: Relationship }> } }>("SELECT public.search_collectors('bl') AS page")).rows[0]!.page;
    assert.deepEqual(search.items.map(item => item.publisherId), [blairPublisher]);
    assert.equal(search.items[0]!.username, 'blair');
    assert.equal(search.items[0]!.relationship.isFollowing, true);
    const following = (await db.query<{ page: { items: Array<{ publisherId: string }> } }>("SELECT public.list_people('following') AS page")).rows[0]!.page;
    assert.deepEqual(following.items.map(item => item.publisherId), [blairPublisher]);
    await assert.rejects(() => db.query("SELECT public.search_collectors('b')"), /at least two/i);
  });
  await db.exec('SET ROLE anon;');
  try {
    const publicProfile = (await db.query<{ profile: Record<string, unknown> }>('SELECT public.get_collector($1) AS profile', [blairPublisher])).rows[0]!.profile;
    assert.equal(publicProfile.username, 'blair');
    assert.equal(JSON.stringify(publicProfile).includes('@'), false);
  } finally { await db.exec('RESET ROLE;'); }
});
