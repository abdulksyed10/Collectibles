import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';
import { applyMigrations } from './migrations.ts';

const owner = '41000000-0000-4000-8000-000000000001';
const viewer = '41000000-0000-4000-8000-000000000002';
const publicCollection = '41000000-0000-4000-8000-000000000011';
const privateCollection = '41000000-0000-4000-8000-000000000012';
const publicItem = '41000000-0000-4000-8000-000000000021';
const privateItem = '41000000-0000-4000-8000-000000000022';

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

test('collection-first migration preserves item and image identities while moving visibility onto entries', async () => {
  const db = await createHierarchyFixture('202609240001_public_image_lookup_bridge.sql');
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [owner, viewer]);
    const category = (await db.query<{ id: string }>('SELECT id FROM public.categories WHERE owner_id=$1', [owner])).rows[0].id;
    await db.query(`
      INSERT INTO public.collections(id,owner_id,category_id,name,description,visibility,acquired_on,created_at)
      VALUES
        ($1,$2,$3,'Travel','Trips and finds','public','2024-02-03','2024-02-04T05:06:07Z'),
        ($4,$2,$3,'Gifts','Kept private','private','2024-04-05','2024-04-06T07:08:09Z')
    `, [publicCollection, owner, category, privateCollection]);
    await db.query(`
      INSERT INTO public.items(id,owner_id,collection_id,title,notes,created_at,updated_at)
      VALUES
        ($1,$2,$3,'Park pin','Private note','2024-05-06T07:08:09Z','2024-05-06T07:08:09Z'),
        ($4,$2,$5,'Gift pin','Another private note','2024-05-07T08:09:10Z','2024-05-07T08:09:10Z')
    `, [publicItem, owner, publicCollection, privateItem, privateCollection]);
    await db.query(`
      INSERT INTO public.item_images(item_id,owner_id,full_key,thumb_key,bytes)
      VALUES ($1,$2,'owner/original/full.jpg','owner/original/thumb.jpg',100)
    `, [publicItem, owner]);
    const imagesBefore = (await db.query('SELECT item_id,owner_id,full_key,thumb_key,bytes,created_at FROM public.item_images ORDER BY item_id')).rows;
    const publicBefore = (await db.query<{ id: string }>(`
      SELECT i.id FROM public.items i
      JOIN public.collections c ON c.id=i.collection_id AND c.owner_id=i.owner_id
      WHERE c.visibility='public' ORDER BY i.id
    `)).rows;

    await applyMigrations(db, '202609240001_public_image_lookup_bridge.sql', '202609240002_collection_first.sql');

    const items = (await db.query<{ id: string; collection_id: string; category_id: string | null; visibility: string; created_at: string; updated_at: string }>(
      'SELECT id,collection_id,category_id,visibility,created_at,updated_at FROM public.items ORDER BY id',
    )).rows;
    assert.deepEqual(items.map(item => ({ id: item.id, collection_id: item.collection_id, category_id: item.category_id, visibility: item.visibility })), [
      { id: publicItem, collection_id: category, category_id: publicCollection, visibility: 'public' },
      { id: privateItem, collection_id: category, category_id: privateCollection, visibility: 'private' },
    ]);
    assert.deepEqual(
      (await db.query<{ id: string }>("SELECT id FROM public.items WHERE visibility='public' ORDER BY id")).rows,
      publicBefore,
    );
    assert.deepEqual(
      (await db.query('SELECT item_id,owner_id,full_key,thumb_key,bytes,created_at FROM public.item_images ORDER BY item_id')).rows,
      imagesBefore,
    );
    assert.deepEqual((await db.query(`
      SELECT id,name,description,acquired_on::text AS acquired_on
      FROM public.categories WHERE id=$1
    `, [publicCollection])).rows, [{
      id: publicCollection,
      name: 'Travel',
      description: 'Trips and finds',
      acquired_on: '2024-02-03',
    }]);
    assert.deepEqual((await db.query(`
      SELECT legacy_collection_id,collection_id,category_id
      FROM private.legacy_collection_shares WHERE legacy_collection_id=$1
    `, [publicCollection])).rows, [{
      legacy_collection_id: publicCollection,
      collection_id: category,
      category_id: publicCollection,
    }]);
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', ['41000000-0000-4000-8000-000000000003']);
    assert.equal((await db.query('SELECT id FROM public.collections WHERE owner_id=$1', ['41000000-0000-4000-8000-000000000003'])).rows.length, 0);
    assert.equal((await db.query('SELECT id FROM public.categories WHERE owner_id=$1', ['41000000-0000-4000-8000-000000000003'])).rows.length, 0);
    await asOwner(db, owner, async () => {
      await db.query('SELECT public.delete_category($1)', [publicCollection]);
    });
    assert.deepEqual((await db.query<{ id: string; category_id: string | null; visibility: string }>(
      'SELECT id,category_id,visibility FROM public.items WHERE id=$1', [publicItem],
    )).rows, [{ id: publicItem, category_id: null, visibility: 'public' }]);
  } finally {
    await db.close();
  }
});

test('collection-first migration turns an old public collection link into a category-scoped public view', async () => {
  const db = await createHierarchyFixture('202609240001_public_image_lookup_bridge.sql');
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
    const category = (await db.query<{ id: string }>('SELECT id FROM public.categories WHERE owner_id=$1', [owner])).rows[0].id;
    await db.query(`
      INSERT INTO public.collections(id,owner_id,category_id,name,description,visibility,acquired_on)
      VALUES ($1,$2,$3,'Travel','Owner-only description','public','2024-02-03')
    `, [publicCollection, owner, category]);
    await db.query(`
      INSERT INTO public.items(id,owner_id,collection_id,title,notes)
      VALUES ($1,$2,$3,'Park pin','Owner-only note')
    `, [publicItem, owner, publicCollection]);
    await db.query(`
      INSERT INTO public.item_images(item_id,owner_id,full_key,thumb_key,bytes)
      VALUES ($1,$2,'owner/public/full.jpg','owner/public/thumb.jpg',100)
    `, [publicItem, owner]);

    await applyMigrations(db, '202609240001_public_image_lookup_bridge.sql', '202609240002_collection_first.sql');

    const shared = (await db.query<{ page: unknown }>(
      'SELECT public.get_shared_collection($1,$2) AS page', [publicCollection, 0],
    )).rows[0].page;
    assert.deepEqual(shared, {
      collection: { id: category, name: 'Pins' },
      scope: { collectionId: category, categoryId: publicCollection },
      categories: [{ id: publicCollection, name: 'Travel' }],
      items: [{ id: publicItem, title: 'Park pin', hasPhoto: true, categoryId: publicCollection, categoryName: 'Travel' }],
      total: 1,
      hasMore: false,
    });
  } finally {
    await db.close();
  }
});

test('collection-first schema starts empty and enforces parent-scoped categories with private entry defaults', async () => {
  const db = await createHierarchyFixture('202609240002_collection_first.sql');
  const ownerId = '41000000-0000-4000-8000-000000000101';
  const otherId = '41000000-0000-4000-8000-000000000102';
  try {
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [ownerId, otherId]);
    assert.equal((await db.query('SELECT id FROM public.collections WHERE owner_id=$1', [ownerId])).rows.length, 0);
    assert.equal((await db.query('SELECT id FROM public.categories WHERE owner_id=$1', [ownerId])).rows.length, 0);
    let ownerCollection = '';
    let ownerCategory = '';
    let otherCategory = '';
    await asOwner(db, ownerId, async () => {
      ownerCollection = (await db.query<{ id: string }>("INSERT INTO public.collections(name) VALUES ('Pins') RETURNING id")).rows[0].id;
      ownerCategory = (await db.query<{ id: string }>("INSERT INTO public.categories(collection_id,name) VALUES ($1,'Parks') RETURNING id", [ownerCollection])).rows[0].id;
    });
    await asOwner(db, otherId, async () => {
      const otherCollection = (await db.query<{ id: string }>("INSERT INTO public.collections(name) VALUES ('Cards') RETURNING id")).rows[0].id;
      otherCategory = (await db.query<{ id: string }>("INSERT INTO public.categories(collection_id,name) VALUES ($1,'Rare') RETURNING id", [otherCollection])).rows[0].id;
    });
    await asOwner(db, ownerId, async () => {
      const item = (await db.query<{ visibility: string; category_id: string | null; acquired_on: string }>(`
        WITH inserted AS (
          INSERT INTO public.items(collection_id,title) VALUES ($1,'Gift') RETURNING visibility,category_id
        )
        SELECT inserted.visibility,inserted.category_id,c.acquired_on::text AS acquired_on
        FROM inserted CROSS JOIN public.collections c WHERE c.id=$1
      `, [ownerCollection])).rows[0];
      assert.equal(item.visibility, 'private');
      assert.equal(item.category_id, null);
      const databaseToday = (await db.query<{ today: string }>('SELECT current_date::text AS today')).rows[0].today;
      assert.equal(item.acquired_on, databaseToday);
      await assert.rejects(
        db.query("INSERT INTO public.items(collection_id,category_id,title) VALUES ($1,$2,'Foreign')", [ownerCollection, otherCategory]),
        /foreign key/,
      );
      await assert.rejects(db.query('DELETE FROM public.categories WHERE id=$1', [ownerCategory]), /permission denied/);
      await db.query('SELECT public.delete_category($1)', [ownerCategory]);
    });
    assert.equal((await db.query('SELECT id FROM public.categories WHERE id=$1', [ownerCategory])).rows.length, 0);
  } finally {
    await db.close();
  }
});
