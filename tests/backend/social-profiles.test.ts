import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, createHierarchyFixture } from './hierarchy-fixture.ts';

const alex = '00000000-0000-4000-8000-000000001101';
const otherAlex = '00000000-0000-4000-8000-000000001102';
const stranger = '00000000-0000-4000-8000-000000001103';
let db: PGlite;

before(async () => {
  db = await createHierarchyFixture();
  await db.query(
    "INSERT INTO auth.users(id,email,created_at) VALUES ($1,'Alex@example.test','2026-01-01'),($2,'alex@another.test','2026-01-02'),($3,'stranger@example.test','2026-01-03')",
    [alex, otherAlex, stranger],
  );
  await db.query('UPDATE private.social_config SET profiles_enabled=true WHERE singleton=true');
});

after(async () => db?.close());

test('profile initialization allocates unique public usernames from email local parts', async () => {
  const first = await asOwner(db, alex, async () => (await db.query<{ profile: { username: string; publisherId: string } }>('SELECT public.ensure_social_profile() AS profile')).rows[0]!.profile);
  const second = await asOwner(db, otherAlex, async () => (await db.query<{ profile: { username: string; publisherId: string } }>('SELECT public.ensure_social_profile() AS profile')).rows[0]!.profile);

  assert.equal(first.username, 'alex');
  assert.match(second.username, /^alex_\d+$/);
  assert.match(first.publisherId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(first.publisherId, second.publisherId);
  assert.equal((await db.query<{ count: string }>('SELECT count(*)::text AS count FROM private.collector_profiles')).rows[0]!.count, '2');
});

test('only the owner can complete their introduction or rename their profile', async () => {
  await asOwner(db, alex, async () => {
    const completed = (await db.query<{ profile: { username: string; introCompletedAt: string | null } }>("SELECT public.complete_profile_intro('AlexPins') AS profile")).rows[0]!.profile;
    assert.equal(completed.username, 'alexpins');
    assert.ok(completed.introCompletedAt);
  });

  await asOwner(db, stranger, async () => {
    await assert.rejects(() => db.query("SELECT public.update_username('ALEXPINS')"), /unique|username|different/i);
  });

  assert.equal((await db.query<{ username: string }>('SELECT username FROM private.collector_profiles WHERE owner_id=$1', [alex])).rows[0]!.username, 'alexpins');
});

test('the database rejects prohibited names and limits username changes', async () => {
  await asOwner(db, otherAlex, async () => {
    await assert.rejects(() => db.query("SELECT public.complete_profile_intro('fuck_you')"), /not allowed|public text/i);

    for (const username of ['otherone', 'othertwo', 'otherthree', 'otherfour', 'otherfive']) {
      await db.query('SELECT public.update_username($1)', [username]);
    }

    await assert.rejects(() => db.query("SELECT public.update_username('othersix')"), /limited|changes/i);
  });
});