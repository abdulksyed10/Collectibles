import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrations.ts';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000001121';
const secondOwner = '00000000-0000-4000-8000-000000001122';
let db: PGlite | undefined;

after(async () => db?.close());

test('social profile upgrade backfills existing users without changing their public identity or collections', async () => {
  db = await createHierarchyFixture('202610050001_report_threshold_review.sql');
  await db.query(
    "INSERT INTO auth.users(id,email,created_at) VALUES ($1,'casey@example.test','2026-01-01'),($2,'casey@another.test','2026-01-02')",
    [owner, secondOwner],
  );
  const beforePublisher = (await db.query<{ public_id: string }>('SELECT public_id FROM private.public_publishers WHERE owner_id=$1', [owner])).rows[0]!.public_id;
  const collectionId = await asOwner(db, owner, async () => {
    await db!.query("SELECT public.accept_public_rules('2026-10-04')");
    return (await db!.query<{ id: string }>("INSERT INTO public.collections(name,description) VALUES ('Existing collection','') RETURNING id")).rows[0]!.id;
  });

  await applyMigrations(db, '202610050001_report_threshold_review.sql');

  const profiles = (await db.query<{ owner_id: string; username: string }>('SELECT owner_id,username FROM private.collector_profiles ORDER BY owner_id')).rows;
  assert.equal(profiles.length, 2);
  assert.deepEqual(profiles.map(row => row.username).sort(), ['casey', 'casey_1']);
  assert.equal((await db.query<{ public_id: string }>('SELECT public_id FROM private.public_publishers WHERE owner_id=$1', [owner])).rows[0]!.public_id, beforePublisher);
  assert.equal((await db.query<{ id: string }>('SELECT id FROM public.collections WHERE id=$1 AND owner_id=$2', [collectionId, owner])).rows[0]!.id, collectionId);
});
