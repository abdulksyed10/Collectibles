import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const ca = '00000000-0000-4000-8000-000000000011';
const cb = '00000000-0000-4000-8000-000000000012';
const pa = '00000000-0000-4000-8000-000000000021';
let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    INSERT INTO auth.users VALUES ('${a}'), ('${b}');
  `);
  const migration = await readFile('supabase/migrations/202609150001_private_pins.sql', 'utf8').catch(() => '');
  await db.exec(migration);
});
after(async () => db?.close());

async function asUser<T>(user: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${user}';`);
  try { return await run(); } finally { await db.exec('RESET ROLE; RESET request.jwt.claim.sub;'); }
}

test('owners can create metadata; each user and anonymous callers cannot read another owner', async () => {
  await asUser(a, () => db.query(`INSERT INTO collections(id,name) VALUES ($1,'A')`, [ca]));
  await asUser(b, () => db.query(`INSERT INTO collections(id,name) VALUES ($1,'B')`, [cb]));
  await asUser(a, async () => {
    const { rows } = await db.query('SELECT id,owner_id FROM collections');
    assert.deepEqual(rows, [{ id: ca, owner_id: a }]);
    await db.query(`INSERT INTO pins(id,collection_id,title) VALUES ($1,$2,'Pin A')`, [pa, ca]);
  });
  await asUser(b, async () => assert.equal((await db.query('SELECT * FROM pins')).rows.length, 0));
  await db.exec('SET ROLE anon;');
  try { await assert.rejects(db.query('SELECT * FROM collections'), /permission denied/); }
  finally { await db.exec('RESET ROLE;'); }
});

test('forged owner, foreign parent and cross-user reassignment are rejected', async () => {
  await asUser(a, async () => {
    await assert.rejects(db.query(`INSERT INTO collections(owner_id,name) VALUES ($1,'Forged')`, [b]), /row-level security/);
    await assert.rejects(db.query(`INSERT INTO pins(collection_id,title) VALUES ($1,'Foreign')`, [cb]), /foreign key/);
    await assert.rejects(db.query('UPDATE pins SET collection_id=$1 WHERE id=$2', [cb, pa]), /foreign key/);
    await assert.rejects(db.query('UPDATE pins SET owner_id=$1 WHERE id=$2', [b, pa]), /permission denied/);
    await assert.rejects(db.query('UPDATE collections SET owner_id=$1 WHERE id=$2', [b, ca]), /permission denied/);
  });
  await asUser(b, async () => {
    assert.equal((await db.query(`UPDATE pins SET title='stolen' WHERE id=$1 RETURNING id`, [pa])).rows.length, 0);
  });
});

test('only the media server can delete metadata or write image keys', async () => {
  await asUser(a, async () => {
    await assert.rejects(db.query('DELETE FROM pins WHERE id=$1', [pa]), /permission denied/);
    await assert.rejects(db.query('DELETE FROM collections WHERE id=$1', [ca]), /permission denied/);
    await assert.rejects(db.query(`INSERT INTO pin_images(pin_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,'foreign/key','foreign/thumb',5)`, [pa, a]), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM private.media_inventory'), /permission denied/);
  });
  await db.query(`INSERT INTO pin_images(pin_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,'a/full','a/thumb',100)`, [pa, a]);
  await asUser(a, async () => assert.equal((await db.query('SELECT * FROM pin_images')).rows.length, 1));
  await asUser(b, async () => assert.equal((await db.query('SELECT * FROM pin_images')).rows.length, 0));
  await assert.rejects(db.query(`INSERT INTO pin_images(pin_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,'b/full','b/thumb',100)`, [pa, b]), /foreign key|unique constraint/);
});

test('collection and pin quotas reject the next insert and release capacity after server deletion', async () => {
  await asUser(a, async () => {
    await db.exec(`INSERT INTO collections(name) SELECT 'Collection '||n FROM generate_series(1,49) n;`);
    await assert.rejects(db.query(`INSERT INTO collections(name) VALUES ('Over limit')`), /collection limit/);
    await db.query(`INSERT INTO pins(collection_id,title) SELECT $1,'Pin '||n FROM generate_series(1,499) n`, [ca]);
    await assert.rejects(db.query(`INSERT INTO pins(collection_id,title) VALUES ($1,'Over limit')`, [ca]), /pin limit/);
  });
  await db.query('DELETE FROM pins WHERE id=$1', [pa]);
  await asUser(a, async () => {
    await db.query(`INSERT INTO pins(collection_id,title) VALUES ($1,'Capacity restored')`, [ca]);
    assert.equal((await db.query('SELECT * FROM pins')).rows.length, 500);
  });
});

test('account deletion state blocks new inserts and edits; removed pin IDs cannot be reused', async () => {
  await db.query('UPDATE private.owner_state SET deleting=true WHERE owner_id=$1', [b]);
  await asUser(b, async () => {
    await assert.rejects(db.query(`INSERT INTO collections(name) VALUES ('Too late')`), /account deletion/);
    await assert.rejects(db.query(`UPDATE collections SET name='Too late' WHERE id=$1`, [cb]), /account deletion/);
    await assert.rejects(db.query(`UPDATE pins SET title='Too late' WHERE id=$1`, [pa]), /account deletion/);
  });
  await db.query(`INSERT INTO private.media_inventory(pin_id,owner_id,full_key,thumb_key,deleted_at) VALUES ($1,$2,'old/full','old/thumb',now())`, [pa,a]);
  await db.query(`DELETE FROM pins WHERE id=(SELECT id FROM pins WHERE owner_id=$1 LIMIT 1)`, [a]);
  await asUser(a, async () => {
    await assert.rejects(db.query(`INSERT INTO pins(id,collection_id,title) VALUES ($1,$2,'Reused')`, [pa,ca]), /retired pin/);
  });
});
