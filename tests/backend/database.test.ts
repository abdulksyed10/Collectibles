import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrations.ts';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const ca = '00000000-0000-4000-8000-000000000011';
const cb = '00000000-0000-4000-8000-000000000012';
const pa = '00000000-0000-4000-8000-000000000021';
let db: PGlite;
let categoryA: string;
let categoryB: string;

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
  await applyMigrations(db, '', '202609240001_public_image_lookup_bridge.sql');
  categoryA = (await db.query<{id:string}>('SELECT id FROM categories WHERE owner_id=$1', [a])).rows[0].id;
  categoryB = (await db.query<{id:string}>('SELECT id FROM categories WHERE owner_id=$1', [b])).rows[0].id;
});
after(async () => db?.close());

test('category deletion respects the account freeze while Auth can finish its cascade', async () => {
  const owner = '00000000-0000-4000-8000-000000000044';
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [owner]);
  const category = (await db.query<{ id: string }>('SELECT id FROM categories WHERE owner_id=$1', [owner])).rows[0].id;
  await db.query('UPDATE private.owner_state SET deleting=true WHERE owner_id=$1', [owner]);
  await asUser(owner, () => assert.rejects(db.query('DELETE FROM categories WHERE id=$1', [category]), /account deletion/));
  assert.equal((await db.query('SELECT id FROM categories WHERE id=$1', [category])).rows.length, 1);
  // Auth's server-side cascade must remain possible after writes are frozen.
  await db.query('DELETE FROM auth.users WHERE id=$1', [owner]);
  assert.equal((await db.query('SELECT id FROM categories WHERE id=$1', [category])).rows.length, 0);
});

async function asUser<T>(user: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${user}';`);
  try { return await run(); } finally { await db.exec('RESET ROLE; RESET request.jwt.claim.sub;'); }
}

test('owners can create metadata; each user and anonymous callers cannot read another owner', async () => {
  await asUser(a, () => db.query(`INSERT INTO collections(id,category_id,name) VALUES ($1,$2,'A')`, [ca,categoryA]));
  await asUser(b, () => db.query(`INSERT INTO collections(id,category_id,name) VALUES ($1,$2,'B')`, [cb,categoryB]));
  await asUser(a, async () => {
    const { rows } = await db.query('SELECT id,owner_id FROM collections');
    assert.deepEqual(rows, [{ id: ca, owner_id: a }]);
    await db.query(`INSERT INTO items(id,collection_id,title) VALUES ($1,$2,'Item A')`, [pa, ca]);
  });
  await asUser(b, async () => assert.equal((await db.query('SELECT * FROM items')).rows.length, 0));
  await db.exec('SET ROLE anon;');
  try { await assert.rejects(db.query('SELECT * FROM collections'), /permission denied/); }
  finally { await db.exec('RESET ROLE;'); }
});

test('forged owner, foreign parent and cross-user reassignment are rejected', async () => {
  await asUser(a, async () => {
    await assert.rejects(db.query(`INSERT INTO collections(owner_id,category_id,name) VALUES ($1,$2,'Forged')`, [b,categoryB]), /row-level security/);
    await assert.rejects(db.query(`INSERT INTO collections(category_id,name) VALUES ($1,'Foreign category')`, [categoryB]), /foreign key/);
    await assert.rejects(db.query('UPDATE collections SET category_id=$1 WHERE id=$2', [categoryB,ca]), /foreign key/);
    await assert.rejects(db.query(`INSERT INTO items(collection_id,title) VALUES ($1,'Foreign')`, [cb]), /foreign key/);
    await assert.rejects(db.query('UPDATE items SET collection_id=$1 WHERE id=$2', [cb, pa]), /foreign key/);
    await assert.rejects(db.query('UPDATE items SET owner_id=$1 WHERE id=$2', [b, pa]), /permission denied/);
    await assert.rejects(db.query('UPDATE collections SET owner_id=$1 WHERE id=$2', [b, ca]), /permission denied/);
  });
  await asUser(b, async () => {
    assert.equal((await db.query(`UPDATE items SET title='stolen' WHERE id=$1 RETURNING id`, [pa])).rows.length, 0);
  });
});

test('starter categories, category ownership, moves and empty-only deletion', async () => {
  const future='00000000-0000-4000-8000-000000000003';
  await db.query('INSERT INTO auth.users(id) VALUES ($1)',[future]);
  assert.deepEqual((await db.query<{name:string}>('SELECT name FROM categories WHERE owner_id=$1',[future])).rows,[{name:'Pins'}]);
  await asUser(a, async () => {
    assert.deepEqual((await db.query<{id:string;name:string}>('SELECT id,name FROM categories')).rows,[{id:categoryA,name:'Pins'}]);
    await assert.rejects(db.query(`INSERT INTO categories(name) VALUES ('  ')`),/check constraint/);
    await assert.rejects(db.query(`INSERT INTO categories(name) VALUES (' Space ')`),/check constraint/);
    await assert.rejects(db.query(`INSERT INTO categories(name) VALUES ($1)`,['x'.repeat(81)]),/check constraint/);
    await assert.rejects(db.query(`INSERT INTO categories(owner_id,name) VALUES ($1,'Forged')`,[b]),/row-level security/);
    await assert.rejects(db.query('UPDATE categories SET owner_id=$1 WHERE id=$2',[b,categoryA]),/permission denied/);
    const category=(await db.query<{id:string}>(`INSERT INTO categories(name) VALUES ('Figures') RETURNING id`)).rows[0].id;
    await db.query(`UPDATE categories SET name='Miniatures' WHERE id=$1`,[category]);
    assert.equal((await db.query<{name:string}>('SELECT name FROM categories WHERE id=$1',[category])).rows[0].name,'Miniatures');
    await db.query('UPDATE collections SET category_id=$1 WHERE id=$2',[category,ca]);
    await assert.rejects(db.query('DELETE FROM categories WHERE id=$1',[category]),/foreign key/);
    await db.query('UPDATE collections SET category_id=$1 WHERE id=$2',[categoryA,ca]);
    await db.query('DELETE FROM categories WHERE id=$1',[category]);
    assert.equal((await db.query('SELECT id FROM categories WHERE id=$1',[category])).rows.length,0);
    assert.equal((await db.query('DELETE FROM categories WHERE id=$1 RETURNING id',[categoryB])).rows.length,0);
  });
  await asUser(b, async () => assert.equal((await db.query('SELECT id FROM categories WHERE id=$1',[categoryA])).rows.length,0));
});

test('20 category quota includes starter and releases capacity on deletion', async () => {
  await asUser(a, async () => {
    await db.query(`INSERT INTO categories(name) SELECT 'Category '||n FROM generate_series(1,19) n`);
    assert.equal((await db.query('SELECT id FROM categories')).rows.length,20);
    await assert.rejects(db.query(`INSERT INTO categories(name) VALUES ('Over limit')`),/category limit/);
    const id=(await db.query<{id:string}>(`SELECT id FROM categories WHERE name='Category 19'`)).rows[0].id;
    await db.query('DELETE FROM categories WHERE id=$1',[id]);
    await db.query(`INSERT INTO categories(name) VALUES ('Capacity restored')`);
    assert.equal((await db.query('SELECT id FROM categories')).rows.length,20);
  });
});

test('only the media server can delete metadata or write image keys', async () => {
  await asUser(a, async () => {
    await assert.rejects(db.query('DELETE FROM items WHERE id=$1', [pa]), /permission denied/);
    await assert.rejects(db.query('DELETE FROM collections WHERE id=$1', [ca]), /permission denied/);
    await assert.rejects(db.query(`INSERT INTO item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,'foreign/key','foreign/thumb',5)`, [pa, a]), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM private.media_inventory'), /permission denied/);
  });
  await db.query(`INSERT INTO item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,'a/full','a/thumb',100)`, [pa, a]);
  await asUser(a, async () => assert.equal((await db.query('SELECT * FROM item_images')).rows.length, 1));
  await asUser(b, async () => assert.equal((await db.query('SELECT * FROM item_images')).rows.length, 0));
  await assert.rejects(db.query(`INSERT INTO item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES ($1,$2,'b/full','b/thumb',100)`, [pa, b]), /foreign key|unique constraint/);
});

test('collection and item quotas reject the next insert and release capacity after server deletion', async () => {
  await asUser(a, async () => {
    await db.query(`INSERT INTO collections(category_id,name) SELECT $1,'Collection '||n FROM generate_series(1,49) n`,[categoryA]);
    await assert.rejects(db.query(`INSERT INTO collections(category_id,name) VALUES ($1,'Over limit')`,[categoryA]), /collection limit/);
    await db.query(`INSERT INTO items(collection_id,title) SELECT $1,'Item '||n FROM generate_series(1,499) n`, [ca]);
    await assert.rejects(db.query(`INSERT INTO items(collection_id,title) VALUES ($1,'Over limit')`, [ca]), /item limit/);
  });
  await db.query('DELETE FROM items WHERE id=$1', [pa]);
  await asUser(a, async () => {
    await db.query(`INSERT INTO items(collection_id,title) VALUES ($1,'Capacity restored')`, [ca]);
    assert.equal((await db.query('SELECT * FROM items')).rows.length, 500);
  });
});

test('account deletion state blocks new inserts and edits; removed item IDs cannot be reused', async () => {
  await db.query('UPDATE private.owner_state SET deleting=true WHERE owner_id=$1', [b]);
  await asUser(b, async () => {
    await assert.rejects(db.query(`INSERT INTO categories(name) VALUES ('Too late')`),/account deletion/);
    await assert.rejects(db.query(`UPDATE categories SET name='Too late' WHERE id=$1`,[categoryB]),/account deletion/);
    await assert.rejects(db.query(`INSERT INTO collections(category_id,name) VALUES ($1,'Too late')`,[categoryB]), /account deletion/);
    await assert.rejects(db.query(`UPDATE collections SET name='Too late' WHERE id=$1`, [cb]), /account deletion/);
    await assert.rejects(db.query(`UPDATE items SET title='Too late' WHERE id=$1`, [pa]), /account deletion/);
  });
  await db.query(`INSERT INTO private.media_inventory(item_id,owner_id,full_key,thumb_key,deleted_at) VALUES ($1,$2,'old/full','old/thumb',now())`, [pa,a]);
  await db.query(`DELETE FROM items WHERE id=(SELECT id FROM items WHERE owner_id=$1 LIMIT 1)`, [a]);
  await asUser(a, async () => {
    await assert.rejects(db.query(`INSERT INTO items(id,collection_id,title) VALUES ($1,$2,'Reused')`, [pa,ca]), /retired item/);
  });
});
