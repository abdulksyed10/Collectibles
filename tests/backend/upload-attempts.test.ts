import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import jpeg from 'jpeg-js';
import { createMediaService, type Database, type Session } from '../../supabase/functions/media/service.ts';
import { sweepMedia } from '../../supabase/functions/media/cleanup.ts';
import { applyMigrations } from './migrations.ts';

const owner = '30000000-0000-4000-8000-000000000001';
const other = '30000000-0000-4000-8000-000000000002';
const collection = '30000000-0000-4000-8000-000000000011';
const legacy = '30000000-0000-4000-8000-000000000021';
const retry = '30000000-0000-4000-8000-000000000022';
const red = jpeg.encode({ width: 1, height: 1, data: Buffer.from([255, 0, 0, 255]) }, 80).data;
const blue = jpeg.encode({ width: 1, height: 1, data: Buffer.from([0, 0, 255, 255]) }, 80).data;
const objects = new Map<string, Uint8Array>();
const delayedPuts: (() => void)[] = [];
let failNextPut = false;
let pg: PGlite;
let db: Database;
let media: ReturnType<typeof createMediaService>;
const store = {
  async put(key: string, bytes: Uint8Array) {
    if (failNextPut) {
      failNextPut = false;
      // The client timed out; remote storage still owns the request and can
      // complete it later, after the failed transaction releases its lock.
      delayedPuts.push(() => objects.set(key, bytes));
      throw new Error('storage timeout');
    }
    objects.set(key, bytes);
  },
  async remove(keys: string[]) { keys.forEach(key => objects.delete(key)); },
  async sign(key: string) { return `https://private.example/${key}`; },
};
const upload = (pinId: string, bytes: Uint8Array) => ({ action: 'upload' as const, pinId, imageBase64: Buffer.from(bytes).toString('base64'), thumbnailBase64: Buffer.from(bytes).toString('base64') });

before(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');`);
  // Seed a genuinely old-schema image before applying the upgrade.
  await pg.exec(await readFile('supabase/migrations/202609150001_private_pins.sql', 'utf8'));
  await pg.query(`INSERT INTO collections(id,owner_id,name) VALUES ($1,$2,'Legacy')`, [collection, owner]);
  await pg.query(`INSERT INTO pins(id,owner_id,collection_id,title) VALUES ($1,$2,$3,'Old photo'),($4,$2,$3,'Retry')`, [legacy, owner, collection, retry]);
  const keys = [`${owner}/${legacy}/full.jpg`, `${owner}/${legacy}/thumb.jpg`];
  await pg.query('INSERT INTO private.media_inventory(pin_id,owner_id,full_key,thumb_key) VALUES ($1,$2,$3,$4)', [legacy, owner, ...keys]);
  await pg.query('INSERT INTO pin_images(pin_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,$3,$4,$5)', [legacy, owner, ...keys, blue.length * 2]);
  keys.forEach(key => objects.set(key, blue));
  await applyMigrations(pg, '202609150001_private_pins.sql');
  const session = (client: { query: Function }): Session => ({ query: async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[] });
  db = { ...session(pg), transaction: run => pg.transaction(tx => run(session(tx))) };
  media = createMediaService(db, store, async id => { await pg.query('DELETE FROM auth.users WHERE id=$1', [id]); });
});
after(async () => pg?.close());

test('upgrade preserves old image keys and private owner reads', async () => {
  const result = await media.handle(owner, { action: 'read', pinIds: [legacy] }) as { images: { url: string }[] };
  assert.equal(result.images[0].url, `https://private.example/${owner}/${legacy}/full.jpg`);
  assert.deepEqual(await media.handle(other, { action: 'read', pinIds: [legacy] }), { images: [] });
});

test('a timed-out PUT completing after retry cannot alter the winning image, and sweep removes only the abandoned attempt', async () => {
  failNextPut = true;
  await assert.rejects(media.handle(owner, upload(retry, red)), /storage timeout/);
  await media.handle(owner, upload(retry, blue));
  delayedPuts.shift()!();
  const [winner] = await db.query<{ full_key: string; thumb_key: string }>('SELECT full_key,thumb_key FROM pin_images WHERE pin_id=$1', [retry]);
  assert.deepEqual(objects.get(winner.full_key), new Uint8Array(blue), 'late first PUT must not overwrite the committed full image');
  assert.deepEqual(objects.get(winner.thumb_key), new Uint8Array(blue));
  const attempts = await db.query('SELECT * FROM private.media_inventory WHERE pin_id=$1', [retry]);
  assert.equal(attempts.length, 2, 'each attempted upload needs a durable reservation');
  await pg.query(`UPDATE private.media_inventory SET created_at=now()-interval '2 days' WHERE pin_id=$1`, [retry]);
  assert.equal(await sweepMedia(db, store), 1, 'abandoned attempt must be eligible even though this pin has an active image');
  assert.equal([...objects.keys()].filter(key => key.includes(retry)).length, 2);
  assert.deepEqual(objects.get(winner.full_key), new Uint8Array(blue));
  assert.ok(objects.has(`${owner}/${legacy}/full.jpg`), 'legacy committed image also remains protected');
});

test('pin deletion removes every attempt and sweep removes late writes after deletion without touching other pins', async () => {
  const pin = '30000000-0000-4000-8000-000000000023';
  await pg.query(`INSERT INTO pins(id,owner_id,collection_id,title) VALUES ($1,$2,$3,'Delete retry')`, [pin, owner, collection]);
  failNextPut = true;
  await assert.rejects(media.handle(owner, upload(pin, red)), /storage timeout/);
  await media.handle(owner, upload(pin, blue));
  await media.handle(owner, { action: 'delete-pin', pinId: pin });
  assert.equal([...objects.keys()].some(key => key.includes(pin)), false);
  delayedPuts.shift()!();
  await pg.query(`UPDATE private.media_inventory SET deleted_at=now()-interval '16 minutes' WHERE pin_id=$1`, [pin]);
  assert.equal(await sweepMedia(db, store), 2);
  assert.equal([...objects.keys()].some(key => key.includes(pin)), false);
  assert.equal((await db.query('SELECT * FROM pin_images WHERE pin_id=$1', [retry])).length, 1);
  await assert.rejects(pg.query(`INSERT INTO pins(id,owner_id,collection_id,title) VALUES ($1,$2,$3,'Reused')`, [pin, owner, collection]), /retired pin/);
});

test('collection and account deletion enumerate all attempts including old-schema keys', async () => {
  await media.handle(owner, { action: 'delete-collection', collectionId: collection });
  assert.equal(objects.size, 0);
  assert.equal((await db.query('SELECT * FROM private.media_inventory WHERE owner_id=$1 AND deleted_at IS NULL', [owner])).length, 0);
  // A late abandoned object can still arrive after its collection was removed.
  const [old] = await db.query<{ full_key: string }>('SELECT full_key FROM private.media_inventory WHERE pin_id=$1 LIMIT 1', [retry]);
  objects.set(old.full_key, red);
  await media.handle(owner, { action: 'delete-account' });
  assert.equal(objects.size, 0);
  assert.equal((await db.query('SELECT * FROM auth.users WHERE id=$1', [owner])).length, 0);
  assert.equal((await db.query('SELECT * FROM auth.users WHERE id=$1', [other])).length, 1);
});
