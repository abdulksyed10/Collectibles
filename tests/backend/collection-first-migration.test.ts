import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHierarchyFixture } from './hierarchy-fixture.ts';

test('migration loader can stop before a later hierarchy migration', async () => {
  const db = await createHierarchyFixture('202609170005_public_catalog.sql');
  try {
    const result = await db.query<{ procedure: string | null }>(
      "SELECT to_regprocedure('private.resolve_public_image(uuid,uuid)')::text AS procedure",
    );
    assert.equal(result.rows[0].procedure, null);
  } finally {
    await db.close();
  }
});
