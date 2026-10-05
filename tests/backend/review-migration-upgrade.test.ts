import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { applyMigrations } from './migrations.ts';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000951';

test('the report-threshold migration upgrades already pending public entries to immediate publication', async () => {
  const db = await createHierarchyFixture('202610040006_deletion_storage_stage.sql');
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
    let itemId = '';
    await asOwner(db, owner, async () => {
      await db.query("SELECT public.accept_public_rules('2026-10-04')");
      const collectionId = (await db.query<{ id: string }>("INSERT INTO collections(name, description) VALUES ('Existing public collection', '') RETURNING id")).rows[0]!.id;
      itemId = (await db.query<{ id: string }>("INSERT INTO items(collection_id, title, visibility) VALUES ($1, 'Existing public entry', 'public') RETURNING id", [collectionId])).rows[0]!.id;
    });
    assert.equal((await db.query<{ status: string }>('SELECT status FROM private.item_publication WHERE item_id=$1', [itemId])).rows[0]!.status, 'pending');

    await applyMigrations(db, '202610040006_deletion_storage_stage.sql', '202610050001_report_threshold_review.sql');

    assert.equal((await db.query<{ status: string }>('SELECT status FROM private.item_publication WHERE item_id=$1', [itemId])).rows[0]!.status, 'published');
  } finally {
    await db.close();
  }
});
