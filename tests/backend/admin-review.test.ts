import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000961';
const admin = '00000000-0000-4000-8000-000000000962';
const member = '00000000-0000-4000-8000-000000000963';
const reporters = [
  '00000000-0000-4000-8000-000000000964',
  '00000000-0000-4000-8000-000000000965',
  '00000000-0000-4000-8000-000000000966',
  '00000000-0000-4000-8000-000000000967',
  '00000000-0000-4000-8000-000000000968',
];

let db: PGlite;
let itemId: string;

async function publicIds() {
  await db.exec('SET ROLE anon;');
  try {
    const page = (await db.query<{ page: { entries: Array<{ id: string }> } }>('SELECT public.list_public_entries(0) AS page')).rows[0]!.page;
    return page.entries.map(entry => entry.id);
  } finally {
    await db.exec('RESET ROLE;');
  }
}

before(async () => {
  db = await createHierarchyFixture();
  await db.query(`INSERT INTO auth.users(id) VALUES ${[owner, admin, member, ...reporters].map((_, index) => `($${index + 1})`).join(',')}`, [owner, admin, member, ...reporters]);
  await asOwner(db, owner, async () => {
    await db.query("SELECT public.accept_public_rules('2026-10-04')");
    const collectionId = (await db.query<{ id: string }>("INSERT INTO collections(name, description) VALUES ('Admin review', '') RETURNING id")).rows[0]!.id;
    itemId = (await db.query<{ id: string }>("INSERT INTO items(collection_id, title, visibility) VALUES ($1, 'Reviewed entry', 'public') RETURNING id", [collectionId])).rows[0]!.id;
  });
  for (const reporter of reporters) await asOwner(db, reporter, async () => {
    await db.query("SELECT public.report_public_content($1, null, 'spam', '')", [itemId]);
  });
  await db.query('INSERT INTO private.app_admins(owner_id) VALUES ($1)', [admin]);
});

after(async () => db?.close());

test('only a database administrator can read the review queue', async () => {
  await asOwner(db, member, async () => {
    const context = (await db.query<{ value: { isAdmin: boolean } }>('SELECT public.get_admin_context() AS value')).rows[0]!.value;
    assert.equal(context.isAdmin, false);
    await assert.rejects(() => db.query('SELECT public.list_admin_review_queue(0)'));
  });
  await asOwner(db, admin, async () => {
    const context = (await db.query<{ value: { isAdmin: boolean } }>('SELECT public.get_admin_context() AS value')).rows[0]!.value;
    assert.equal(context.isAdmin, true);
    const page = (await db.query<{ value: { targets: Array<{ targetId: string; targetType: string; reportCount: number }> } }>('SELECT public.list_admin_review_queue(0) AS value')).rows[0]!.value;
    assert.deepEqual(page.targets.map(target => [target.targetType, target.targetId, target.reportCount]), [['item', itemId, 5]]);
  });
});

test('an admin restore resolves the triggering reports and begins a new review cycle', async () => {
  assert.deepEqual(await publicIds(), []);
  await asOwner(db, admin, async () => {
    const restored = (await db.query<{ value: boolean }>("SELECT public.resolve_admin_review('item', $1, 'restore') AS value", [itemId])).rows[0]!.value;
    assert.equal(restored, true);
  });
  assert.deepEqual(await publicIds(), [itemId]);
  const reports = (await db.query<{ status: string }>('SELECT status FROM private.public_content_reports WHERE item_id=$1', [itemId])).rows;
  assert.deepEqual([...new Set(reports.map(report => report.status))], ['resolved']);
  const publication = (await db.query<{ review_cycle: number; status: string }>('SELECT review_cycle, status FROM private.item_publication WHERE item_id=$1', [itemId])).rows[0]!;
  assert.equal(publication.review_cycle, 2);
  assert.equal(publication.status, 'published');
});
