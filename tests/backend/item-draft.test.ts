import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const owner = '00000000-0000-4000-8000-000000000802';
let db: PGlite;

before(async () => {
  db = await createHierarchyFixture();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
});
after(async () => db?.close());

test('an item draft lazily creates one General collection and can create a child category inline', async () => {
  await asOwner(db, owner, async () => {
    const first = (await db.query<{ collection_id: string; category_id: string | null; acquired_on: string | null }>(
      "SELECT collection_id,category_id,acquired_on::text FROM public.save_item_draft('First find','','private',null,null,null,null,'2026-09-28')",
    )).rows[0]!;
    const second = (await db.query<{ collection_id: string }>(
      "SELECT collection_id FROM public.save_item_draft('Second find','','private',null,null,null,null,'2026-09-27')",
    )).rows[0]!;
    assert.equal(first.collection_id, second.collection_id);
    assert.equal(first.category_id, null);
    assert.equal(first.acquired_on, '2026-09-28');
    assert.deepEqual((await db.query<{ name: string }>('SELECT name FROM collections WHERE id=$1', [first.collection_id])).rows, [{ name: 'General' }]);

    const custom = (await db.query<{ collection_id: string; category_id: string | null; visibility: string }>(
      "SELECT collection_id,category_id,visibility FROM public.save_item_draft('Park pin','gift','public',null,'Pins',null,'National parks','2026-09-26')",
    )).rows[0]!;
    assert.equal(custom.visibility, 'public');
    assert.ok(custom.category_id);
    assert.deepEqual((await db.query<{ collection_name: string; category_name: string }>(
      'SELECT c.name AS collection_name, k.name AS category_name FROM categories k JOIN collections c ON c.id=k.collection_id WHERE k.id=$1', [custom.category_id],
    )).rows, [{ collection_name: 'Pins', category_name: 'National parks' }]);
  });
});

test('item draft placement is owner-only and rejects incompatible collection choices', async () => {
  await db.exec('SET ROLE anon;');
  try {
    await assert.rejects(db.query("SELECT public.save_item_draft('Nope','','private',null,null,null,null,null)"), /permission denied/);
  } finally {
    await db.exec('RESET ROLE;');
  }
  await asOwner(db, owner, async () => {
    const existing = (await db.query<{ id: string }>("SELECT id FROM collections WHERE name='General' LIMIT 1")).rows[0]!.id;
    await assert.rejects(
      db.query("SELECT public.save_item_draft('Bad','','private',$1,'New collection',null,null,null)", [existing]),
      /collection choice/i,
    );
  });
});
