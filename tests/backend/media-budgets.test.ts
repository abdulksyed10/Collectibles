import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import jpeg from 'jpeg-js';
import { applyMigrations } from './migrations.ts';
import { createMediaService, type Database, type Session } from '../../supabase/functions/media/service.ts';
import { createPublicMediaHandler } from '../../supabase/functions/public-media/http.ts';
import { consumePublicRead } from '../../supabase/functions/public-media/lookup.ts';

const owner = '40000000-0000-4000-8000-000000000001';
const other = '40000000-0000-4000-8000-000000000002';
const collection = '40000000-0000-4000-8000-000000000011';
const otherCollection = '40000000-0000-4000-8000-000000000012';
const ownerItem = '40000000-0000-4000-8000-000000000021';
const otherItem = '40000000-0000-4000-8000-000000000022';
const jpegBytes = jpeg.encode({ width: 1, height: 1, data: Buffer.from([100, 50, 200, 255]) }, 80).data;
const validUpload = (itemId: string) => ({
  action: 'upload' as const,
  itemId,
  imageBase64: Buffer.from(jpegBytes).toString('base64'),
  thumbnailBase64: Buffer.from(jpegBytes).toString('base64'),
});
const invalidUpload = (itemId: string) => ({ action: 'upload' as const, itemId, imageBase64: 'AAAA', thumbnailBase64: 'AAAA' });

let pg: PGlite;
let db: Database;
let media: ReturnType<typeof createMediaService>;
const objects = new Map<string, Uint8Array>();

const resetAttempts = () => pg.query('DELETE FROM private.media_upload_attempts');
const setLimits = (sql: string, values: unknown[] = []) => pg.query(`UPDATE private.media_limits SET ${sql}`, values);

before(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');`);
  await applyMigrations(pg);
  const category = (await pg.query<{ id: string }>('SELECT id FROM public.categories WHERE owner_id=$1', [owner])).rows[0].id;
  const otherCategory = (await pg.query<{ id: string }>('SELECT id FROM public.categories WHERE owner_id=$1', [other])).rows[0].id;
  await pg.query('INSERT INTO public.collections(id,owner_id,category_id,name) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)', [collection, owner, category, 'Budget test', otherCollection, other, otherCategory, 'Other budget test']);
  await pg.query(`INSERT INTO public.items(id,owner_id,collection_id,title) VALUES
    ($1,$2,$3,'Owner item'),($4,$5,$6,'Other item')`, [ownerItem, owner, collection, otherItem, other, otherCollection]);
  const session = (client: { query: Function }): Session => ({
    query: async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[],
  });
  db = { ...session(pg), transaction: run => pg.transaction(tx => run(session(tx))) };
  media = createMediaService(db, {
    async put(key, bytes) { objects.set(key, bytes); },
    async remove(keys) { keys.forEach(key => objects.delete(key)); },
    async sign(key) { return `https://private.example/${key}`; },
  }, async () => {});
});
after(async () => pg?.close());

test('budget controls are private to the media service', async () => {
  await pg.exec('SET ROLE authenticated');
  try {
    await assert.rejects(pg.query('SELECT * FROM private.media_limits'), /permission denied/);
    await assert.rejects(pg.query('SELECT * FROM private.media_upload_attempts'), /permission denied/);
  } finally {
    await pg.exec('RESET ROLE');
  }
});

test('invalid uploads consume the per-owner quota and the global quota applies across accounts', async () => {
  await resetAttempts();
  await setLimits('uploads_enabled=true,attempts_per_owner_hour=2,attempts_per_owner_day=10,attempts_per_app_day=10');
  await assert.rejects(media.handle(owner, invalidUpload(ownerItem)), /Invalid JPEG/);
  await assert.rejects(media.handle(owner, invalidUpload(ownerItem)), /Invalid JPEG/);
  await assert.rejects(media.handle(owner, invalidUpload(ownerItem)), /hourly photo upload limit/);
  assert.equal((await pg.query('SELECT * FROM private.media_upload_attempts')).rows.length, 2);

  await resetAttempts();
  await setLimits('attempts_per_owner_hour=10,attempts_per_app_day=1');
  await assert.rejects(media.handle(owner, invalidUpload(ownerItem)), /Invalid JPEG/);
  await assert.rejects(media.handle(other, invalidUpload(otherItem)), /Photo uploads have reached today/);
  assert.equal((await pg.query('SELECT * FROM private.media_upload_attempts')).rows.length, 1);
});

test('disabled, storage, and active-photo limits stop writes before R2', async () => {
  await resetAttempts();
  objects.clear();
  await setLimits('uploads_enabled=false,attempts_per_owner_hour=10,attempts_per_owner_day=10,attempts_per_app_day=10,active_photos_per_owner=100,reserved_bytes_per_owner=262144000,reserved_bytes_per_app=1073741824');
  await assert.rejects(media.handle(owner, validUpload(ownerItem)), /temporarily disabled/);
  assert.equal((await pg.query('SELECT * FROM private.media_upload_attempts')).rows.length, 0);
  assert.equal(objects.size, 0);

  await setLimits('uploads_enabled=true,reserved_bytes_per_owner=1');
  await assert.rejects(media.handle(owner, validUpload(ownerItem)), /photo storage limit/);
  assert.equal((await pg.query('SELECT * FROM private.media_inventory')).rows.length, 0);
  assert.equal(objects.size, 0);

  await setLimits('reserved_bytes_per_owner=262144000,active_photos_per_owner=0');
  await assert.rejects(media.handle(owner, validUpload(ownerItem)), /photo limit/);
  assert.equal((await pg.query('SELECT * FROM private.media_inventory')).rows.length, 0);
  assert.equal(objects.size, 0);
});

test('a committed photo consumes lifetime storage even after deletion', async () => {
  await setLimits('active_photos_per_owner=1,reserved_bytes_per_owner=262144000,reserved_bytes_per_app=1073741824');
  await media.handle(owner, validUpload(ownerItem));
  const expectedBytes = jpegBytes.length * 2;
  const [inventory] = (await pg.query<{ reserved_bytes: number; budget_status: string }>('SELECT reserved_bytes,budget_status FROM private.media_inventory WHERE item_id=$1', [ownerItem])).rows;
  assert.deepEqual(inventory, { reserved_bytes: expectedBytes, budget_status: 'committed' });
  const [ownerBudget] = (await pg.query<{ reserved_bytes: number }>('SELECT reserved_bytes FROM private.media_budget_owner WHERE owner_id=$1', [owner])).rows;
  const [globalBudget] = (await pg.query<{ reserved_bytes: number }>('SELECT reserved_bytes FROM private.media_budget_global')).rows;
  assert.equal(ownerBudget.reserved_bytes, expectedBytes);
  assert.equal(globalBudget.reserved_bytes, expectedBytes);

  await media.handle(owner, { action: 'delete-item', itemId: ownerItem });
  const [retired] = (await pg.query<{ budget_status: string; reserved_bytes: number }>('SELECT budget_status,reserved_bytes FROM private.media_inventory WHERE item_id=$1', [ownerItem])).rows;
  assert.deepEqual(retired, { budget_status: 'retired', reserved_bytes: expectedBytes });
  const [afterDelete] = (await pg.query<{ reserved_bytes: number }>('SELECT reserved_bytes FROM private.media_budget_global')).rows;
  assert.equal(afterDelete.reserved_bytes, expectedBytes);
});

test('the public-photo proxy counts a view before reading R2', async () => {
  await setLimits('public_reads_enabled=true,public_reads_per_app_day=1');
  await pg.query('DELETE FROM private.public_media_reads');
  let reads = 0;
  const handler = createPublicMediaHandler({
    origins: [],
    lookup: async () => 'public/object.jpg',
    consumeRead: () => consumePublicRead(db),
    read: async () => { reads++; return new Uint8Array([255, 216, 255, 217]); },
  });
  const path = `https://example.test/public-media?collectionId=${collection}&itemId=${otherItem}&size=thumb`;
  assert.equal((await handler(new Request(path))).status, 200);
  assert.equal((await handler(new Request(path))).status, 429);
  assert.equal(reads, 1);
});
