import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { applyMigrations } from './migrations.ts';
import { lookupPublicImage } from '../../supabase/functions/public-media/lookup.ts';
import { createPublicMediaHandler } from '../../supabase/functions/public-media/http.ts';

const owner='30000000-0000-4000-8000-000000000001';
const other='30000000-0000-4000-8000-000000000002';
const publicId='30000000-0000-4000-8000-000000000011';
const foreignId='30000000-0000-4000-8000-000000000012';
const itemId='30000000-0000-4000-8000-000000000021';
const foreignItem='30000000-0000-4000-8000-000000000022';
let pg:PGlite;
let handler:ReturnType<typeof createPublicMediaHandler>;
const reads:string[]=[];
const query=(sql:string,params:unknown[])=>pg.query(sql,params).then(result=>result.rows as Record<string,unknown>[]);
const request=(collectionId=publicId,item=itemId,size='thumb')=>new Request(`https://example.test/public-media?collectionId=${collectionId}&itemId=${item}&size=${size}`,{headers:{origin:'https://app.example'}});
async function asRole<T>(role:'anon'|'authenticated',user:string|null,run:()=>Promise<T>):Promise<T> {
  await pg.exec(`SET ROLE ${role}; SET request.jwt.claim.sub = '${user??''}';`);
  try{return await run();}finally{await pg.exec('RESET ROLE; RESET request.jwt.claim.sub;');}
}

before(async()=>{
  pg=new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');`);
  await applyMigrations(pg);
  const category=(await pg.query<{id:string}>('SELECT id FROM categories WHERE owner_id=$1',[owner])).rows[0].id;
  const otherCategory=(await pg.query<{id:string}>('SELECT id FROM categories WHERE owner_id=$1',[other])).rows[0].id;
  await pg.query(`INSERT INTO collections(id,owner_id,category_id,name,description,created_at)
    VALUES ($1,$2,$3,'Shared','Safe description','2020-03-04T12:00:00Z'),
           ($4,$5,$6,'Foreign','Private notes','2020-03-05T12:00:00Z')`,
    [publicId,owner,category,foreignId,other,otherCategory]);
  await pg.query(`INSERT INTO items(id,owner_id,collection_id,title,notes) VALUES
    ($1,$2,$3,'Visible item','Secret item notes'),
    ($4,$5,$6,'Other item','Other secret')`,
    [itemId,owner,publicId,foreignItem,other,foreignId]);
  await pg.query(`INSERT INTO item_images(item_id,owner_id,full_key,thumb_key,bytes) VALUES
    ($1,$2,'owner/private/full.jpg','owner/private/thumb.jpg',100),
    ($3,$4,'other/private/full.jpg','other/private/thumb.jpg',100)`,
    [itemId,owner,foreignItem,other]);
  handler=createPublicMediaHandler({origins:['https://app.example'],
    lookup:(c,i,size)=>lookupPublicImage({query},c,i,size),
    consumeRead:async()=>{},
    read:async key=>{reads.push(key);return new Uint8Array([255,216,255,217]);}});
});
after(async()=>pg?.close());

test('migration backfills existing collection dates from creation day',async()=>{
  const legacy=new PGlite();
  try {
    await legacy.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT null::uuid $$;
      INSERT INTO auth.users VALUES ('${owner}');`);
    for(const file of ['202609150001_private_pins.sql','202609160001_media_attempts.sql','202609160002_collectibles_hierarchy.sql'])
      await legacy.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
    const category=(await legacy.query<{id:string}>('SELECT id FROM categories WHERE owner_id=$1',[owner])).rows[0].id;
    await legacy.query(`INSERT INTO collections(id,owner_id,category_id,name,created_at)
      VALUES ($1,$2,$3,'Legacy','2020-03-04T12:00:00Z')`,[publicId,owner,category]);
    await legacy.exec(await readFile('supabase/migrations/202609160003_collection_sharing.sql','utf8'));
    const row=(await legacy.query<{visibility:string;acquired_on:string}>('SELECT visibility,acquired_on FROM collections WHERE id=$1',[publicId])).rows[0];
    assert.equal(row.visibility,'private');
    assert.equal(new Date(row.acquired_on).toISOString().slice(0,10),'2020-03-04');
  } finally {await legacy.close();}
});

test('migration defaults and owner-only date/visibility writes',async()=>{
  const row=(await pg.query<{visibility:string;acquired_on:string}>('SELECT visibility,acquired_on FROM collections WHERE id=$1',[publicId])).rows[0];
  assert.equal(row.visibility,'private');
  assert.equal(new Date(row.acquired_on).toISOString().slice(0,10),new Date().toISOString().slice(0,10));
  await asRole('authenticated',other,async()=>{
    assert.equal((await pg.query('UPDATE collections SET visibility=$1 WHERE id=$2 RETURNING id',['public',publicId])).rows.length,0);
  });
  await asRole('authenticated',owner,async()=>{
    await assert.rejects(pg.query('UPDATE collections SET acquired_on=$1 WHERE id=$2',['bad date',publicId]),/invalid input syntax/);
    await assert.rejects(pg.query('UPDATE collections SET acquired_on=$1 WHERE id=$2',['infinity',publicId]),/check constraint/);
    await assert.rejects(pg.query('UPDATE collections SET acquired_on=$1 WHERE id=$2',['2025-02-30',publicId]),/out of range|invalid input/);
    await assert.rejects(pg.query('UPDATE collections SET visibility=$1 WHERE id=$2',['unlisted',publicId]),/check constraint/);
    await pg.query('UPDATE collections SET visibility=$1,acquired_on=$2 WHERE id=$3',['public','2024-06-07',publicId]);
  });
});

test('anonymous visitors can list safe public collection cards',async()=>{
  await asRole('anon',null,async()=>{
    const page=(await pg.query<{list_public_collections:any}>('SELECT list_public_collections($1)',[0])).rows[0].list_public_collections;
    assert.deepEqual(Object.keys(page).sort(),['collections','hasMore','total']);
    assert.equal(page.total,1);
    assert.equal(page.hasMore,false);
    assert.deepEqual(page.collections,[{
      id:publicId,
      name:'Shared',
      description:'Safe description',
      categoryName:'Pins',
      itemCount:1,
      coverItemId:itemId,
      isOwner:false,
    }]);
    assert.deepEqual(Object.keys(page.collections[0]).sort(),['categoryName','coverItemId','description','id','isOwner','itemCount','name']);
    assert.equal((await pg.query<{list_public_collections:any}>('SELECT list_public_collections($1)',[21])).rows[0].list_public_collections,null);
  });
  await asRole('authenticated',owner,async()=>{
    const page=(await pg.query<{list_public_collections:any}>('SELECT list_public_collections($1)',[0])).rows[0].list_public_collections;
    assert.equal(page.collections[0].isOwner,true);
  });
});

test('anonymous metadata is bounded and excludes owner, notes, date, and keys',async()=>{
  await asRole('anon',null,async()=>{
    await assert.rejects(pg.query('SELECT * FROM collections'),/permission denied/);
    await assert.rejects(pg.query('UPDATE collections SET visibility=$1 WHERE id=$2',['public',publicId]),/permission denied/);
    await assert.rejects(pg.query('SELECT * FROM item_images'),/permission denied/);
    const result=(await pg.query<{get_shared_collection:any}>('SELECT get_shared_collection($1,$2)',[publicId,0])).rows[0].get_shared_collection;
    assert.deepEqual(Object.keys(result).sort(),['collection','hasMore','items','total']);
    assert.deepEqual(result.collection,{id:publicId,name:'Shared',description:'Safe description',categoryName:'Pins'});
    assert.deepEqual(result.items,[{id:itemId,title:'Visible item',hasPhoto:true}]);
    assert.equal(result.total,1);
    assert.equal(result.hasMore,false);
    assert.equal((await pg.query<{get_shared_collection:any}>('SELECT get_shared_collection($1,$2)',[foreignId,0])).rows[0].get_shared_collection,null);
    assert.equal((await pg.query<{get_shared_collection:any}>('SELECT get_shared_collection($1,$2)',[publicId,21])).rows[0].get_shared_collection,null);
    assert.deepEqual((await pg.query<{get_shared_collection:any}>('SELECT get_shared_collection($1,$2)',[publicId,1])).rows[0].get_shared_collection.items,[]);
  });
  await pg.query(`INSERT INTO items(owner_id,collection_id,title)
    SELECT $1,$2,'Extra ' || n FROM generate_series(1,24) n`,[owner,publicId]);
  await asRole('anon',null,async()=>{
    const first=(await pg.query<{get_shared_collection:any}>('SELECT get_shared_collection($1,$2)',[publicId,0])).rows[0].get_shared_collection;
    const second=(await pg.query<{get_shared_collection:any}>('SELECT get_shared_collection($1,$2)',[publicId,1])).rows[0].get_shared_collection;
    assert.equal(first.items.length,24);
    assert.equal(second.items.length,1);
    assert.equal(first.total,25);
    assert.equal(first.hasMore,true);
    assert.equal(second.hasMore,false);
  });
});

test('public photo lookup checks collection membership and revocation on every GET',async()=>{
  let response=await handler(request());
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'image/jpeg');
  assert.match(response.headers.get('cache-control')||'',/no-store/);
  assert.deepEqual(reads,['owner/private/thumb.jpg']);
  response=await handler(request(publicId,foreignItem));
  assert.equal(response.status,404);
  assert.equal(reads.length,1);
  await pg.query('UPDATE collections SET visibility=$1 WHERE id=$2',['private',publicId]);
  assert.equal((await handler(request())).status,404);
  assert.equal(reads.length,1);
  await pg.query('UPDATE collections SET visibility=$1 WHERE id=$2',['public',publicId]);
  await pg.query('UPDATE private.owner_state SET deleting=true WHERE owner_id=$1',[owner]);
  assert.equal((await handler(request())).status,404);
  assert.equal(reads.length,1);
  await asRole('anon',null,async()=>{
    assert.equal((await pg.query<{get_shared_collection:any}>('SELECT get_shared_collection($1)',[publicId])).rows[0].get_shared_collection,null);
  });
});

test('public handler hides provider errors and limits CORS to read methods',async()=>{
  const preflight=await handler(new Request('https://example.test/public-media',{method:'OPTIONS',headers:{origin:'https://app.example'}}));
  assert.equal(preflight.headers.get('access-control-allow-methods'),'GET, OPTIONS');
  assert.equal((await handler(new Request('https://example.test/public-media',{method:'POST'}))).status,405);
  const failed=createPublicMediaHandler({origins:[],lookup:async()=>{throw Error('secret SQL key');},consumeRead:async()=>{},read:async()=>new Uint8Array()});
  assert.equal((await (await failed(request())).text()).includes('secret'),false);
});
