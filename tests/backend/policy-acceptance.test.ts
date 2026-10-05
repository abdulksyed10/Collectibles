import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

test('contributions need current acceptance; reads and deletion remain available', async () => {
  const db = await createHierarchyFixture();
  const owner = '00000000-0000-4000-8000-000000009101';
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
    await asOwner(db, owner, async () => {
      await assert.rejects(() => db.query("INSERT INTO collections(name) VALUES ('No agreement')"), /accept/i);
      await assert.rejects(() => db.query('SELECT public.accept_public_rules(null)'), /invalid/i);
      await db.query("SELECT public.accept_public_rules('2026-10-04')");
      const id = (await db.query<{id:string}>("INSERT INTO collections(name) VALUES ('Agreed') RETURNING id")).rows[0]!.id;
      await db.exec('RESET ROLE');
      await db.query('DELETE FROM private.owner_public_rules WHERE owner_id=$1', [owner]);
      await db.exec('SET ROLE authenticated');
      assert.equal((await db.query('SELECT id FROM collections')).rows.length, 1);
      await assert.rejects(() => db.query("UPDATE collections SET name='Bypass' WHERE id=$1", [id]), /accept/i);
      // The media service deletes after removing R2 objects; app roles cannot.
      await db.exec('RESET ROLE');
      await db.query('DELETE FROM collections WHERE id=$1 AND owner_id=$2', [id, owner]);
    });
  } finally { await db.close(); }
});
