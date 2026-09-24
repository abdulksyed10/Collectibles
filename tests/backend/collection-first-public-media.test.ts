import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHierarchyFixture } from './hierarchy-fixture.ts';
import { lookupPublicImage } from '../../supabase/functions/public-media/lookup.ts';
import { createPublicMediaHandler } from '../../supabase/functions/public-media/http.ts';

const owner = '42000000-0000-4000-8000-000000000001';
const collection = '42000000-0000-4000-8000-000000000011';
const parks = '42000000-0000-4000-8000-000000000012';
const travel = '42000000-0000-4000-8000-000000000013';
const legacyParksLink = '42000000-0000-4000-8000-000000000014';
const publicPark = '42000000-0000-4000-8000-000000000021';
const privatePark = '42000000-0000-4000-8000-000000000022';
const publicTravel = '42000000-0000-4000-8000-000000000023';
let db: Awaited<ReturnType<typeof createHierarchyFixture>>;
let handler: ReturnType<typeof createPublicMediaHandler>;
const reads: string[] = [];

const request = (collectionId: string, itemId: string) => new Request(
  `https://example.test/public-media?collectionId=${collectionId}&itemId=${itemId}&size=thumb`,
  { headers: { origin: 'https://app.example' } },
);

before(async () => {
  db = await createHierarchyFixture('202609240002_collection_first.sql');
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
  await db.query(`INSERT INTO public.collections(id,owner_id,name) VALUES ($1,$2,'Pins')`, [collection, owner]);
  await db.query(`INSERT INTO public.categories(id,owner_id,collection_id,name) VALUES
    ($1,$2,$3,'Parks'),($4,$2,$3,'Travel')`, [parks, owner, collection, travel]);
  await db.query(`INSERT INTO public.items(id,owner_id,collection_id,category_id,title,visibility,created_at) VALUES
    ($1,$2,$3,$4,'Public park','public','2024-01-02T03:04:05Z'),
    ($5,$2,$3,$4,'Private park','private','2024-03-02T03:04:05Z'),
    ($6,$2,$3,$7,'Public travel','public','2024-02-02T03:04:05Z')`,
    [publicPark, owner, collection, parks, privatePark, publicTravel, travel]);
  await db.query(`INSERT INTO public.item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES
    ($1,$2,'public-park/full.jpg','public-park/thumb.jpg',100),
    ($3,$2,'private-park/full.jpg','private-park/thumb.jpg',100),
    ($4,$2,'public-travel/full.jpg','public-travel/thumb.jpg',100)`,
    [publicPark, owner, privatePark, publicTravel]);
  await db.query(`INSERT INTO private.legacy_collection_shares(legacy_collection_id,owner_id,collection_id,category_id)
    VALUES ($1,$2,$3,$4)`, [legacyParksLink, owner, collection, parks]);
  handler = createPublicMediaHandler({
    origins: ['https://app.example'],
    lookup: (collectionId, itemId, size) => lookupPublicImage({ query: (sql, params) => db.query(sql, params).then(result => result.rows as Record<string, unknown>[]) }, collectionId, itemId, size),
    consumeRead: async () => {},
    read: async key => { reads.push(key); return new Uint8Array([255, 216, 255, 217]); },
  });
});
after(async () => db?.close());

test('public handler and catalog exclude private entries and keep legacy links category-scoped', async () => {
  const catalog = (await db.query<{ page: any }>('SELECT public.list_public_collections($1) AS page', [0])).rows[0].page;
  assert.deepEqual(catalog.collections, [{
    id: collection,
    name: 'Pins',
    itemCount: 2,
    coverItemId: publicTravel,
    isOwner: false,
  }]);
  assert.equal(catalog.total, 1);

  assert.equal((await handler(request(collection, publicPark))).status, 200);
  assert.equal((await handler(request(legacyParksLink, publicPark))).status, 200);
  assert.equal((await handler(request(legacyParksLink, publicTravel))).status, 404);
  assert.equal((await handler(request(collection, privatePark))).status, 404);
  assert.deepEqual(reads, ['public-park/thumb.jpg', 'public-park/thumb.jpg']);

  await db.query("UPDATE public.items SET visibility='private' WHERE id=$1", [publicPark]);
  assert.equal((await handler(request(legacyParksLink, publicPark))).status, 404);
  assert.equal(reads.length, 2);
});
