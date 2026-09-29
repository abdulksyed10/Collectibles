import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { createHierarchyFixture } from './hierarchy-fixture.ts';

let db: PGlite;

function event(id: string, ip: string) {
  return { metadata: { uuid: id, ip_address: ip, name: 'before-user-created' }, user: { id: '00000000-0000-4000-8000-000000000899', email: 'collector@example.test' } };
}

async function asAuthHook<T>(run: () => Promise<T>) {
  await db.exec('SET ROLE supabase_auth_admin;');
  try { return await run(); } finally { await db.exec('RESET ROLE;'); }
}

before(async () => {
  db = await createHierarchyFixture();
  await db.query("UPDATE private.signup_admission_settings SET enabled=true, hmac_key='test-only-signup-hmac-key-0123456789', per_ip_hour=2, per_ip_day=3, project_day=4");
});
after(async () => db?.close());

test('before-user-created admission records only a keyed IP digest and rejects limits before user creation', async () => {
  await asAuthHook(async () => {
    const first = (await db.query<{ before_user_created_admission: Record<string, unknown> }>('SELECT public.before_user_created_admission($1)', [event('00000000-0000-4000-8000-000000000901', '203.0.113.7')])).rows[0]!.before_user_created_admission;
    const second = (await db.query<{ before_user_created_admission: Record<string, unknown> }>('SELECT public.before_user_created_admission($1)', [event('00000000-0000-4000-8000-000000000902', '203.0.113.7')])).rows[0]!.before_user_created_admission;
    const blocked = (await db.query<{ before_user_created_admission: { error: { http_code: number } } }>('SELECT public.before_user_created_admission($1)', [event('00000000-0000-4000-8000-000000000903', '203.0.113.7')])).rows[0]!.before_user_created_admission;
    assert.deepEqual(first, {});
    assert.deepEqual(second, {});
    assert.equal(blocked.error.http_code, 429);
  });
  const stored = (await db.query<{ event_id: string; digest_length: number }>('SELECT event_id::text, char_length(ip_digest) AS digest_length FROM private.signup_admission_events ORDER BY created_at')).rows;
  assert.deepEqual(stored.map(row => row.event_id), ['00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902']);
  assert.ok(stored.every(row => row.digest_length === 32));
});

test('admission is idempotent, recognizes a pause, and is not callable by app roles', async () => {
  await asAuthHook(async () => {
    const repeated = (await db.query<{ before_user_created_admission: Record<string, unknown> }>('SELECT public.before_user_created_admission($1)', [event('00000000-0000-4000-8000-000000000901', '203.0.113.7')])).rows[0]!.before_user_created_admission;
    assert.deepEqual(repeated, {});
  });
  await db.query('UPDATE private.signup_admission_settings SET paused=true');
  await asAuthHook(async () => {
    const paused = (await db.query<{ before_user_created_admission: { error: { http_code: number } } }>('SELECT public.before_user_created_admission($1)', [event('00000000-0000-4000-8000-000000000904', '2001:db8::1')])).rows[0]!.before_user_created_admission;
    assert.equal(paused.error.http_code, 429);
  });
  await db.query('UPDATE private.signup_admission_settings SET paused=false');
  await db.exec('SET ROLE authenticated;');
  try { await assert.rejects(db.query('SELECT public.before_user_created_admission($1)', [event('00000000-0000-4000-8000-000000000905', '2001:db8::2')]), /permission denied/); }
  finally { await db.exec('RESET ROLE;'); }
});
