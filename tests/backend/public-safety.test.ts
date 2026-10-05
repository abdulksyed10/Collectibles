import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000911';
const viewer = '00000000-0000-4000-8000-000000000912';
let db: PGlite;
let collectionId: string;
let itemId: string;

async function entriesFor(userId?: string) {
  if (!userId) {
    await db.exec('SET ROLE anon;');
    try { return (await db.query<{ list_public_entries: { entries: Array<{ id: string }> } }>('SELECT public.list_public_entries(0)')).rows[0]!.list_public_entries.entries; }
    finally { await db.exec('RESET ROLE;'); }
  }
  return asOwner(db, userId, async () => (await db.query<{ list_public_entries: { entries: Array<{ id: string }> } }>('SELECT public.list_public_entries(0)')).rows[0]!.list_public_entries.entries);
}

before(async () => {
  db = await createHierarchyFixture();
  await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [owner, viewer]);
  await asOwner(db, owner, async () => {
    await assert.rejects(() => db.query("INSERT INTO collections(name) VALUES ('Unaccepted')"), /accept/i);
    await db.query("SELECT public.accept_public_rules('2026-10-04')");
    collectionId = (await db.query<{ id: string }>("INSERT INTO collections(name,description) VALUES ('Safety pins','') RETURNING id")).rows[0]!.id;
    await db.query("SELECT public.accept_public_rules('2026-10-04')");
    itemId = (await db.query<{ id: string }>("INSERT INTO items(collection_id,title,visibility) VALUES ($1,'Public safety pin','public') RETURNING id", [collectionId])).rows[0]!.id;
  });
  await db.query("UPDATE private.item_publication SET status='approved', approved_revision=revision, reviewed_at=now() WHERE item_id=$1", [itemId]);
});

test('public submission requires a recorded rules acceptance', async () => {
  const accepted = (await db.query<{ version: string }>('SELECT version FROM private.owner_public_rules WHERE owner_id=$1', [owner])).rows[0]!;
  assert.equal(accepted.version, '2026-10-04');
});
after(async () => db?.close());

test('a signed-in viewer can report public content without receiving private moderation data', async () => {
  await asOwner(db, viewer, async () => {
    const result = (await db.query<{ report_public_content: boolean }>("SELECT public.report_public_content($1, null, 'spam', 'Misleading item')", [itemId])).rows[0]!;
    assert.equal(result.report_public_content, true);
    await assert.rejects(() => db.query('SELECT * FROM private.public_content_reports'));
  });
  const row = (await db.query<{ reporter_id: string; publisher_id: string; details: string }>('SELECT reporter_id,publisher_id,details FROM private.public_content_reports WHERE item_id=$1', [itemId])).rows[0]!;
  assert.equal(row.reporter_id, viewer);
  assert.equal(row.publisher_id, owner);
  assert.equal(row.details, 'Misleading item');
});

test('blocking a public collection hides its publisher from that viewer but not guests', async () => {
  assert.deepEqual((await entriesFor()).map(entry => entry.id), [itemId]);
  await asOwner(db, viewer, async () => {
    const blocked = (await db.query<{ block_public_collection: boolean }>('SELECT public.block_public_collection($1)', [collectionId])).rows[0]!;
    assert.equal(blocked.block_public_collection, true);
  });
  assert.deepEqual(await entriesFor(viewer), []);
  assert.deepEqual((await entriesFor()).map(entry => entry.id), [itemId]);
  await asOwner(db, viewer, async () => {
    const list = (await db.query<{ list_blocked_publishers: Array<{ publisherId: string }> }>('SELECT public.list_blocked_publishers()')).rows[0]!;
    assert.equal(list.list_blocked_publishers.length, 1);
    assert.notEqual(list.list_blocked_publishers[0]!.publisherId, owner);
    const unblocked = (await db.query<{ unblock_public_publisher: boolean }>('SELECT public.unblock_public_publisher($1)', [list.list_blocked_publishers[0]!.publisherId])).rows[0]!;
    assert.equal(unblocked.unblock_public_publisher, true);
  });
  assert.deepEqual((await entriesFor(viewer)).map(entry => entry.id), [itemId]);
});

test('guest block header hides publisher across shared pages, topics, counts and entries', async()=>{
  const publisher=(await db.query<{id:string}>('SELECT public_id AS id FROM private.public_publishers WHERE owner_id=$1',[owner])).rows[0]!.id;
  await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({'x-collectibles-blocks':publisher})]);
  try {
    assert.deepEqual(await entriesFor(),[]);
    await db.exec('SET ROLE anon');
    assert.equal((await db.query<{v:unknown}>('SELECT public.get_shared_collection($1) v',[collectionId])).rows[0]!.v,null);
    assert.equal((await db.query<{v:{total:number}}>('SELECT public.list_public_topics() v')).rows[0]!.v.total,0);
    assert.equal((await db.query<{v:{total:number}}>('SELECT public.list_public_collections() v')).rows[0]!.v.total,0);
  }finally{await db.exec('RESET ROLE; RESET request.headers');}
});

test('reports deduplicate, unavailable/private targets receive same acknowledgement, and budgets cannot be bypassed',async()=>{
  const beforeCount=(await db.query<{n:number}>('SELECT count(*)::integer n FROM private.public_content_reports')).rows[0]!.n;
  await asOwner(db,viewer,async()=>{
    await db.query("SELECT public.report_public_content($1,null,'spam','Duplicate')",[itemId]);
    assert.equal((await db.query<{v:boolean}>("SELECT public.report_public_content('00000000-0000-4000-8000-000000006001',null,'other','') v")).rows[0]!.v,true);
    for(let i=2;i<=4;i++) await db.query("SELECT public.report_public_content($1,null,'other','')",[`00000000-0000-4000-8000-00000000600${i}`]);
    await assert.rejects(()=>db.query("SELECT public.report_public_content('00000000-0000-4000-8000-000000006005',null,'other','')"),/limit/i);
  });
  assert.equal((await db.query<{n:number}>('SELECT count(*)::integer n FROM private.public_content_reports')).rows[0]!.n,beforeCount);
});
