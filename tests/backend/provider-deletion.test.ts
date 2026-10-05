import assert from 'node:assert/strict';
import {test} from 'node:test';
import { createHierarchyFixture } from './hierarchy-fixture.ts';
import { createAccountDeletion } from '../../supabase/functions/provider-grants/deletion.ts';
import { b64,sealToken } from '../../supabase/functions/provider-grants/crypto.ts';
import type {Database,Session} from '../../supabase/functions/media/service.ts';
import {applyMigrations} from './migrations.ts';

test('deletion stage upgrade preserves pending jobs and gives new jobs a valid storage-first default',async()=>{
  const pg=await createHierarchyFixture('202610040005_provider_deletion.sql');
  const owner='00000000-0000-4000-8000-000000009903';
  const nextOwner='00000000-0000-4000-8000-000000009904';
  try {
    await pg.query('INSERT INTO private.account_deletion_jobs(owner_id) VALUES($1)',[owner]);
    await applyMigrations(pg,'202610040005_provider_deletion.sql');
    await pg.query('INSERT INTO private.account_deletion_jobs(owner_id) VALUES($1)',[nextOwner]);
    const result=await pg.query<{owner_id:string;status:string}>('SELECT owner_id,status FROM private.account_deletion_jobs ORDER BY owner_id');
    assert.deepEqual(result.rows,[{owner_id:owner,status:'storage_pending'},{owner_id:nextOwner,status:'storage_pending'}]);
  }finally{await pg.close();}
});
test('Apple provider outage preserves a retry; success purges grant before Auth deletion',async()=>{
  const pg=await createHierarchyFixture();const owner='00000000-0000-4000-8000-000000009901';
  const key=b64(crypto.getRandomValues(new Uint8Array(32)));
  try {
    await pg.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
    await pg.query('UPDATE private.owner_state SET deleting=true WHERE owner_id=$1',[owner]);
    await pg.query("INSERT INTO private.account_deletion_jobs(owner_id,status) VALUES($1,'provider_pending')",[owner]);
    await pg.query('INSERT INTO private.provider_grants(owner_id,client_id,encrypted_token) VALUES($1,$2,$3)',[owner,'client',await sealToken('revocable',key,`${owner}:client`)]);
    const adapter=(sql:{query:(q:string,p?:unknown[])=>Promise<{rows:unknown[]}>}):Session=>({query:async<T extends Record<string,unknown>>(q:string,p?:unknown[]) => (await sql.query(q,p)).rows as T[]});
    const db:Database={...adapter(pg),transaction:run=>pg.transaction(tx=>run(adapter(tx)))};
    let outage=true; let deleted=false;
    const remove=createAccountDeletion(db,{hasApple:async()=>true,encryptionKey:()=>key,revoke:async(_client,token)=>{assert.equal(token,'revocable');if(outage)throw Error();},deleteUser:async()=>{
      const grant=(await pg.query<{encrypted_token:string|null}>('SELECT encrypted_token FROM private.provider_grants WHERE owner_id=$1',[owner])).rows[0]!;
      assert.equal(grant.encrypted_token,null); deleted=true;await pg.query('DELETE FROM auth.users WHERE id=$1',[owner]);
    }});
    await assert.rejects(()=>remove(owner),/pending/);assert.equal(deleted,false);
    assert.equal((await pg.query<{status:string}>('SELECT status FROM private.account_deletion_jobs')).rows[0]!.status,'needs_attention');
    outage=false;await remove(owner);assert.equal(deleted,true);
    assert.equal((await pg.query('SELECT * FROM private.provider_grants')).rows.length,0);
    assert.equal((await pg.query<{status:string}>('SELECT status FROM private.account_deletion_jobs')).rows[0]!.status,'complete');
  }finally{await pg.close();}
});

test('a recent provider deletion lease avoids duplicate calls and a stale lease is retried',async()=>{
  const pg=await createHierarchyFixture();const owner='00000000-0000-4000-8000-000000009902';
  try {
    await pg.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
    await pg.query('UPDATE private.owner_state SET deleting=true WHERE owner_id=$1',[owner]);
    await pg.query("INSERT INTO private.account_deletion_jobs(owner_id,status) VALUES($1,'provider_processing')",[owner]);
    const adapter=(sql:{query:(q:string,p?:unknown[])=>Promise<{rows:unknown[]}>}):Session=>({query:async<T extends Record<string,unknown>>(q:string,p?:unknown[]) => (await sql.query(q,p)).rows as T[]});
    const db:Database={...adapter(pg),transaction:run=>pg.transaction(tx=>run(adapter(tx)))};
    let deleted=0;
    const remove=createAccountDeletion(db,{hasApple:async()=>false,encryptionKey:()=>'',revoke:async()=>{},deleteUser:async()=>{deleted++;}});
    await remove(owner);
    assert.equal(deleted,0);
    await pg.query("UPDATE private.account_deletion_jobs SET updated_at=now()-interval '11 minutes' WHERE owner_id=$1",[owner]);
    await remove(owner);
    assert.equal(deleted,1);
    assert.equal((await pg.query<{status:string}>('SELECT status FROM private.account_deletion_jobs WHERE owner_id=$1',[owner])).rows[0]!.status,'complete');
  }finally{await pg.close();}
});
