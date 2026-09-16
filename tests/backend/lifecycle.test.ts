import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import jpeg from 'jpeg-js';
import { createMediaService,type Database,type Session } from '../../supabase/functions/media/service.ts';
import { sweepMedia } from '../../supabase/functions/media/cleanup.ts';

const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002';
const ca='10000000-0000-4000-8000-000000000011',cb='10000000-0000-4000-8000-000000000012';
const pin='10000000-0000-4000-8000-000000000021';
let pg:PGlite;
let db:Database;
const objects=new Map<string,Uint8Array>();
let failPut=false,failRemove=false,failAuth=false;
const deletedUsers:string[]=[];
const image=jpeg.encode({width:1,height:1,data:Buffer.from([200,50,0,255])},80).data.toString('base64');
const upload={action:'upload' as const,pinId:pin,imageBase64:image,thumbnailBase64:image};
let media:ReturnType<typeof createMediaService>;
const store={
  async put(key:string,bytes:Uint8Array){if(failPut && key.endsWith('thumb.jpg'))throw Error('storage unavailable'); objects.set(key,bytes);},
  async remove(keys:string[]){if(failRemove)throw Error('storage unavailable'); keys.forEach(key=>objects.delete(key));},
  async sign(key:string){return `https://private.example/${key}?expires=300`;},
};
before(async()=>{
  pg=new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    INSERT INTO auth.users VALUES ('${a}'),('${b}');`);
  await pg.exec(await readFile('supabase/migrations/202609150001_private_pins.sql','utf8'));
  const session=(client:{query:Function}):Session=>({query:async<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) => (await client.query(sql,params)).rows as T[]});
  db={...session(pg),transaction:run=>pg.transaction(tx=>run(session(tx)))};
  await pg.query(`INSERT INTO collections(id,owner_id,name) VALUES ($1,$2,'A'),($3,$4,'B')`,[ca,a,cb,b]);
  await pg.query(`INSERT INTO pins(id,owner_id,collection_id,title) VALUES ($1,$2,$3,'A pin')`,[pin,a,ca]);
  media=createMediaService(db,store,async owner=>{if(failAuth)throw Error('auth unavailable'); await pg.query('DELETE FROM auth.users WHERE id=$1',[owner]);deletedUsers.push(owner);});
});
after(async()=>pg?.close());

test('foreign upload/read/delete cannot affect another owner and create no foreign objects',async()=>{
  await assert.rejects(media.handle(b,upload),/not found/i);
  assert.deepEqual(await media.handle(b,{action:'read',pinIds:[pin]}),{images:[]});
  assert.deepEqual(await media.handle(b,{action:'delete-pin',pinId:pin}),{ok:true});
  assert.equal((await pg.query('SELECT * FROM pins')).rows.length,1);
  assert.equal(objects.size,0);
});

test('partial upload keeps durable inventory, retry succeeds, and duplicate cannot overwrite committed photo',async()=>{
  failPut=true;
  await assert.rejects(media.handle(a,upload),/storage/);
  assert.equal((await pg.query('SELECT * FROM pin_images')).rows.length,0);
  assert.equal((await pg.query('SELECT * FROM private.media_inventory')).rows.length,1);
  assert.equal(objects.size,1);
  failPut=false;
  assert.deepEqual(await media.handle(a,upload),{ok:true});
  assert.equal(objects.size,2);
  await assert.rejects(media.handle(a,upload),/already/);
  const result=await media.handle(a,{action:'read',pinIds:[pin]}) as {images:{pinId:string;url:string;expiresAt:string}[]};
  assert.equal(result.images.length,1);
  assert.equal(result.images[0].pinId,pin);
  assert.match(result.images[0].url,new RegExp(a));
  assert.ok(Date.parse(result.images[0].expiresAt)>Date.now()+290000);
});

test('storage failure preserves deletable database metadata and retries retire both keys',async()=>{
  failRemove=true;
  await assert.rejects(media.handle(a,{action:'delete-collection',collectionId:ca}),/storage/);
  assert.equal((await pg.query('SELECT * FROM pin_images')).rows.length,1);
  assert.equal((await pg.query('SELECT * FROM pins')).rows.length,1);
  failRemove=false;
  assert.deepEqual(await media.handle(a,{action:'delete-collection',collectionId:ca}),{ok:true});
  assert.equal(objects.size,0);
  assert.equal((await pg.query('SELECT * FROM pins')).rows.length,0);
  assert.ok((await pg.query('SELECT deleted_at FROM private.media_inventory')).rows[0].deleted_at);
  assert.deepEqual(await media.handle(a,{action:'delete-collection',collectionId:ca}),{ok:true});
});

test('account deletion freezes writes before Auth; Auth failure allows an authenticated retry',async()=>{
  failAuth=true;
  await assert.rejects(media.handle(b,{action:'delete-account'}),/auth/);
  assert.equal((await pg.query('SELECT deleting FROM private.owner_state WHERE owner_id=$1',[b])).rows[0].deleting,true);
  await assert.rejects(pg.query(`INSERT INTO collections(owner_id,name) VALUES ($1,'Late')`,[b]),/account deletion/);
  await assert.rejects(media.handle(b,{action:'read',pinIds:[]}),/deletion/);
  failAuth=false;
  assert.deepEqual(await media.handle(b,{action:'delete-account'}),{ok:true});
  assert.deepEqual(deletedUsers,[b]);
  assert.equal((await pg.query('SELECT * FROM collections WHERE owner_id=$1',[b])).rows.length,0);
});

test('cleanup removes late orphan writes after settling, preserves active media and keeps retirement inventory',async()=>{
  objects.set(`${a}/${pin}/full.jpg`,new Uint8Array([99]));
  assert.equal(await sweepMedia(db,store),0);
  assert.equal(objects.size,1);
  await pg.query(`UPDATE private.media_inventory SET deleted_at=now()-interval '16 minutes' WHERE pin_id=$1`,[pin]);
  assert.equal(await sweepMedia(db,store),1);
  assert.equal(objects.size,0);
  assert.equal((await pg.query('SELECT * FROM private.media_inventory')).rows.length,1);

  const active='10000000-0000-4000-8000-000000000031';
  await pg.query(`INSERT INTO collections(id,owner_id,name) VALUES ($1,$2,'New')`,[ca,a]);
  await pg.query(`INSERT INTO pins(id,owner_id,collection_id,title) VALUES ($1,$2,$3,'Active')`,[active,a,ca]);
  await media.handle(a,{...upload,pinId:active});
  await pg.query(`UPDATE private.media_inventory SET created_at=now()-interval '2 days' WHERE pin_id=$1`,[active]);
  assert.equal(await sweepMedia(db,store),0);
  assert.equal(objects.size,2);
});

test('concurrent duplicate requests commit one photo; a simultaneous delete leaves no reachable or untracked image',async()=>{
  const duplicate='10000000-0000-4000-8000-000000000041';
  const racing='10000000-0000-4000-8000-000000000042';
  await pg.query(`INSERT INTO pins(id,owner_id,collection_id,title) VALUES ($1,$2,$3,'Duplicate'),($4,$2,$3,'Racing')`,[duplicate,a,ca,racing]);
  const duplicateResults=await Promise.allSettled([media.handle(a,{...upload,pinId:duplicate}),media.handle(a,{...upload,pinId:duplicate})]);
  assert.equal(duplicateResults.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await pg.query('SELECT * FROM pin_images WHERE pin_id=$1',[duplicate])).rows.length,1);
  const raceResults=await Promise.allSettled([media.handle(a,{...upload,pinId:racing}),media.handle(a,{action:'delete-pin',pinId:racing})]);
  assert.equal(raceResults[1].status,'fulfilled');
  assert.equal((await pg.query('SELECT * FROM pins WHERE id=$1',[racing])).rows.length,0);
  assert.equal([...objects.keys()].some(key=>key.includes(racing)),false);
  assert.ok((await pg.query('SELECT deleted_at FROM private.media_inventory WHERE pin_id=$1',[racing])).rows[0].deleted_at);
});
