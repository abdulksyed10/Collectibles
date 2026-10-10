import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000001301';
const mutual = '00000000-0000-4000-8000-000000001302';
const oneWay = '00000000-0000-4000-8000-000000001303';
const unrelated = '00000000-0000-4000-8000-000000001304';
const blocked = '00000000-0000-4000-8000-000000001305';
let db: PGlite;
let collectionId = '';
let ownerPublisher = '';
let mutualPublisher = '';
let oneWayPublisher = '';
let blockedPublisher = '';
let privateItem = '';
let friendsItem = '';
let publicItem = '';

type SharedEntry = { id: string; audience: string; creator: { username: string | null }; collectionId: string; collectionName: string; relationship: { isFriend: boolean } };

async function profileFor(actor: string) {
  return asOwner(db, actor, async () => (
    await db.query<{ value: { publisherId: string } }>('SELECT public.ensure_social_profile() AS value')
  ).rows[0]!.value.publisherId);
}

// The permission helper is intentionally private. The test operator calls it
// with a supplied viewer ID, mirroring the later JWT-verified media function.
async function visibleTo(actor: string | null, itemId: string) {
  return (await db.query<{ value: boolean }>('SELECT private.can_view_shared_item($1, $2) AS value', [actor, itemId])).rows[0]!.value;
}

async function entryFor(actor: string | null, itemId: string) {
  if (actor === null) {
    await db.exec('SET ROLE anon;');
    try { return (await db.query<{ value: SharedEntry | null }>('SELECT public.get_shared_entry($1) AS value', [itemId])).rows[0]!.value; }
    finally { await db.exec('RESET ROLE;'); }
  }
  return asOwner(db, actor, async () => (
    await db.query<{ value: SharedEntry | null }>('SELECT public.get_shared_entry($1) AS value', [itemId])
  ).rows[0]!.value);
}

before(async () => {
  db = await createHierarchyFixture();
  await db.query(`INSERT INTO auth.users(id,email,created_at) VALUES
    ($1,'owner@example.test','2026-01-01'),($2,'mutual@example.test','2026-01-02'),
    ($3,'oneway@example.test','2026-01-03'),($4,'unrelated@example.test','2026-01-04'),
    ($5,'blocked@example.test','2026-01-05')`, [owner, mutual, oneWay, unrelated, blocked]);
  await db.query('UPDATE private.social_config SET profiles_enabled=true, social_writes_enabled=true, friends_sharing_enabled=true WHERE singleton=true');
  ownerPublisher = await profileFor(owner);
  mutualPublisher = await profileFor(mutual);
  oneWayPublisher = await profileFor(oneWay);
  await profileFor(unrelated);
  blockedPublisher = await profileFor(blocked);

  await asOwner(db, owner, async () => {
    await db.query("SELECT public.accept_public_rules('2026-10-04')");
    collectionId = (await db.query<{ id: string }>("INSERT INTO public.collections(name,description) VALUES ('Mixed collection','') RETURNING id")).rows[0]!.id;
    privateItem = (await db.query<{ id: string }>("INSERT INTO public.items(collection_id,title,visibility) VALUES ($1,'Private item','private') RETURNING id", [collectionId])).rows[0]!.id;
    friendsItem = (await db.query<{ id: string }>("INSERT INTO public.items(collection_id,title,visibility) VALUES ($1,'Friends item','friends') RETURNING id", [collectionId])).rows[0]!.id;
    publicItem = (await db.query<{ id: string }>("INSERT INTO public.items(collection_id,title,visibility) VALUES ($1,'Public item','public') RETURNING id", [collectionId])).rows[0]!.id;
  });
  await asOwner(db, mutual, async () => { await db.query('SELECT public.set_following($1,true)', [ownerPublisher]); });
  await asOwner(db, owner, async () => { await db.query('SELECT public.set_following($1,true)', [mutualPublisher]); });
  await asOwner(db, oneWay, async () => { await db.query('SELECT public.set_following($1,true)', [ownerPublisher]); });
  await asOwner(db, owner, async () => { await db.query('SELECT public.block_collector($1)', [blockedPublisher]); });
});
after(async () => db?.close());

test('shared visibility access matrix only allows public for guests and Friends-only for mutual follows', async () => {
  for (const actor of [mutual, oneWay, unrelated, blocked]) assert.equal(await visibleTo(actor, privateItem), false);
  assert.equal(await visibleTo(null, privateItem), false);

  assert.equal(await visibleTo(mutual, friendsItem), true);
  for (const actor of [oneWay, unrelated, blocked]) assert.equal(await visibleTo(actor, friendsItem), false);
  assert.equal(await visibleTo(null, friendsItem), false);

  for (const actor of [mutual, oneWay, unrelated]) assert.equal(await visibleTo(actor, publicItem), true);
  // Blocking is personal to the blocker; the blocked collector does not lose public Explore access.
  assert.equal(await visibleTo(blocked, publicItem), true);
  assert.equal(await visibleTo(null, publicItem), true);
});

test('entry and collection views only project the authorized subset and never expose notes or acquired dates', async () => {
  const friendEntry = await entryFor(mutual, friendsItem);
  assert.equal(friendEntry?.id, friendsItem);
  assert.equal(friendEntry?.audience, 'friends');
  assert.equal(friendEntry?.creator.username, 'owner');
  assert.equal(JSON.stringify(friendEntry).includes('notes'), false);
  assert.equal(JSON.stringify(friendEntry).includes('acquired'), false);
  assert.equal(await entryFor(oneWay, friendsItem), null);
  assert.equal(await entryFor(null, friendsItem), null);

  await asOwner(db, mutual, async () => {
    const result = (await db.query<{ value: { visibleItemCount: number; entries: { items: SharedEntry[] } } | null }>('SELECT public.get_visible_collection($1, null) AS value', [collectionId])).rows[0]!.value;
    assert.equal(result?.visibleItemCount, 2);
    assert.deepEqual(result?.entries.items.map(item => item.id).sort(), [friendsItem, publicItem].sort());
  });
  await asOwner(db, unrelated, async () => {
    const result = (await db.query<{ value: { visibleItemCount: number; entries: { items: SharedEntry[] } } | null }>('SELECT public.get_visible_collection($1, null) AS value', [collectionId])).rows[0]!.value;
    assert.equal(result?.visibleItemCount, 1);
    assert.deepEqual(result?.entries.items.map(item => item.id), [publicItem]);
  });
  const guestPublic = await entryFor(null, publicItem);
  assert.equal(guestPublic?.id, publicItem);
});

test('Following contains outgoing public items and mutual Friends-only items without public-feed leakage', async () => {
  await asOwner(db, mutual, async () => {
    const page = (await db.query<{ value: { items: SharedEntry[] } }>('SELECT public.list_following_entries(null, false) AS value')).rows[0]!.value;
    assert.deepEqual(page.items.map(item => item.id).sort(), [friendsItem, publicItem].sort());
    const friendsOnly = (await db.query<{ value: { items: SharedEntry[] } }>('SELECT public.list_following_entries(null, true) AS value')).rows[0]!.value;
    assert.deepEqual(friendsOnly.items.map(item => item.id), [friendsItem]);
  });
  await asOwner(db, oneWay, async () => {
    const page = (await db.query<{ value: { items: SharedEntry[] } }>('SELECT public.list_following_entries(null, false) AS value')).rows[0]!.value;
    assert.deepEqual(page.items.map(item => item.id), [publicItem]);
  });
  await db.exec('SET ROLE anon;');
  try {
    const publicFeed = (await db.query<{ value: { entries: Array<{ id: string }> } }>('SELECT public.list_public_entries(0) AS value')).rows[0]!.value;
    assert.deepEqual(publicFeed.entries.map(item => item.id), [publicItem]);
    await assert.rejects(() => db.query('SELECT public.list_following_entries(null, false)'), /(sign in|permission denied)/i);
  } finally { await db.exec('RESET ROLE;'); }
  const hiddenMedia = await db.query('SELECT * FROM private.resolve_public_image($1,$2)', [collectionId, friendsItem]);
  assert.equal(hiddenMedia.rows.length, 0);
});

test('friends sharing pause fails closed for reads and writes while public items continue to work', async () => {
  await db.query('UPDATE private.social_config SET friends_sharing_enabled=false WHERE singleton=true');
  assert.equal(await visibleTo(mutual, friendsItem), false);
  assert.equal((await entryFor(mutual, friendsItem)), null);
  assert.equal((await entryFor(mutual, publicItem))?.id, publicItem);
  await asOwner(db, owner, async () => {
    await assert.rejects(() => db.query("INSERT INTO public.items(collection_id,title,visibility) VALUES ($1,'Paused friends item','friends')", [collectionId]), /friends-only|available/i);
  });
  await db.query('UPDATE private.social_config SET friends_sharing_enabled=true WHERE singleton=true');
});

test('only authorized members can report Friends-only entries, and five distinct reports send them to review', async () => {
  const reporters = [
    '00000000-0000-4000-8000-000000001306',
    '00000000-0000-4000-8000-000000001307',
    '00000000-0000-4000-8000-000000001308',
    '00000000-0000-4000-8000-000000001309',
    '00000000-0000-4000-8000-000000001310',
  ];
  for (const [index, reporter] of reporters.entries()) {
    await db.query('INSERT INTO auth.users(id,email,created_at) VALUES ($1,$2,now())', [reporter, `reporter${index}@example.test`]);
    const publisher = await profileFor(reporter);
    await asOwner(db, reporter, async () => { await db.query('SELECT public.set_following($1,true)', [ownerPublisher]); });
    await asOwner(db, owner, async () => { await db.query('SELECT public.set_following($1,true)', [publisher]); });
  }

  const before = (await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM private.public_content_reports WHERE item_id=$1', [friendsItem])).rows[0]!.count;
  await asOwner(db, oneWay, async () => {
    const acknowledged = (await db.query<{ value: boolean }>("SELECT public.report_public_content($1,null,'spam','') AS value", [friendsItem])).rows[0]!.value;
    assert.equal(acknowledged, true);
  });
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM private.public_content_reports WHERE item_id=$1', [friendsItem])).rows[0]!.count, before);

  for (const reporter of reporters) {
    await asOwner(db, reporter, async () => { await db.query("SELECT public.report_public_content($1,null,'spam','')", [friendsItem]); });
  }
  const publication = (await db.query<{ status: string }>('SELECT status FROM private.item_publication WHERE item_id=$1', [friendsItem])).rows[0]!;
  assert.equal(publication.status, 'review');
  assert.equal(await entryFor(mutual, friendsItem), null);
});

test('public catalog aggregation, direct tables, suspension, and deletion state cannot leak Friends-only entries', async () => {
  await asOwner(db, mutual, async () => {
    const direct = await db.query('SELECT id FROM public.items WHERE id=$1', [friendsItem]);
    assert.equal(direct.rows.length, 0);
  });
  await db.exec('SET ROLE anon;');
  try {
    const collections = (await db.query<{ value: { collections: Array<{ id: string; itemCount: number; coverItemId: string | null }> } }>('SELECT public.list_public_collections(0) AS value')).rows[0]!.value;
    const collection = collections.collections.find(value => value.id === collectionId)!;
    assert.equal(collection.itemCount, 1);
    assert.notEqual(collection.coverItemId, friendsItem);
  } finally { await db.exec('RESET ROLE;'); }

  await db.query('INSERT INTO private.publisher_restrictions(owner_id,publishing_suspended) VALUES ($1,true) ON CONFLICT (owner_id) DO UPDATE SET publishing_suspended=excluded.publishing_suspended', [owner]);
  const restriction = (await db.query<{ publishing_suspended: boolean }>('SELECT publishing_suspended FROM private.publisher_restrictions WHERE owner_id=$1', [owner])).rows[0];
  assert.equal(restriction?.publishing_suspended, true);
  assert.equal(await visibleTo(mutual, publicItem), false);
  await db.query('UPDATE private.publisher_restrictions SET publishing_suspended=false WHERE owner_id=$1', [owner]);

  await db.query('UPDATE private.owner_state SET deleting=true WHERE owner_id=$1', [owner]);
  assert.equal(await visibleTo(mutual, publicItem), false);
  await db.query('UPDATE private.owner_state SET deleting=false WHERE owner_id=$1', [owner]);
});

test('five authorized reports can also send a Friends-only collection to review without exposing it publicly', async () => {
  const reporters = [
    '00000000-0000-4000-8000-000000001306',
    '00000000-0000-4000-8000-000000001307',
    '00000000-0000-4000-8000-000000001308',
    '00000000-0000-4000-8000-000000001309',
    '00000000-0000-4000-8000-000000001310',
  ];
  const friendCollection = await asOwner(db, owner, async () => {
    const id = (await db.query<{ id: string }>("INSERT INTO public.collections(name,description) VALUES ('Friends report target','') RETURNING id")).rows[0]!.id;
    await db.query("INSERT INTO public.items(collection_id,title,visibility) VALUES ($1,'Friends report item','friends')", [id]);
    return id;
  });
  for (const reporter of reporters) {
    await asOwner(db, reporter, async () => { await db.query("SELECT public.report_public_content(null,$1,'spam','')", [friendCollection]); });
  }
  assert.equal((await db.query<{ status: string }>('SELECT status FROM private.collection_publication WHERE collection_id=$1', [friendCollection])).rows[0]!.status, 'review');
  await asOwner(db, mutual, async () => {
    const collection = (await db.query<{ value: unknown }>('SELECT public.get_visible_collection($1, null) AS value', [friendCollection])).rows[0]!.value;
    assert.equal(collection, null);
  });
  await db.exec('SET ROLE anon;');
  try {
    const catalog = (await db.query<{ value: { collections: Array<{ id: string }> } }>('SELECT public.list_public_collections(0) AS value')).rows[0]!.value;
    assert.equal(catalog.collections.some(collection => collection.id === friendCollection), false);
  } finally { await db.exec('RESET ROLE;'); }
});
