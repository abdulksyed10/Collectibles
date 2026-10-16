import assert from 'node:assert/strict';
import test from 'node:test';
import { createHierarchyFixture, asOwner } from './hierarchy-fixture.ts';
import { applyMigrations } from './migrations.ts';

test('date upgrade preserves old entries, including accounts without policy acceptance or pending deletion', async () => {
  const db = await createHierarchyFixture('202610090007~');
  const owner = '00000000-0000-4000-8000-000000000876';
  try {
    await db.query('insert into auth.users(id) values ($1)', [owner]);
    const item = await asOwner(db, owner, async () => {
      await db.exec("select public.accept_public_rules('2026-10-04')");
      return (await db.query<{ id: string; updated_at: string }>("select id, updated_at::text from public.save_item_draft('Historical', '', 'private', null, 'History', null, null, '2020-02-29')")).rows[0]!;
    });
    await db.query('delete from private.owner_public_rules where owner_id=$1', [owner]);
    await db.query('update private.owner_state set deleting=true where owner_id=$1', [owner]);
    await applyMigrations(db, '202610090007~');
    const row = (await db.query<{ legacy: string; updated_at: string; posted_at: string | null }>('select legacy_post_date::text as legacy, updated_at::text, posted_at from items where id=$1', [item.id])).rows[0]!;
    assert.equal(row.legacy, '2020-02-29');
    assert.equal(row.updated_at, item.updated_at);
    assert.equal(row.posted_at, null);
    const triggers = (await db.query<{ tgenabled: string }>("select tgenabled from pg_trigger where tgrelid='public.items'::regclass and tgname in ('guard_pins','contribution_policy')")).rows;
    assert.equal(triggers.length, 2);
    assert.ok(triggers.every(t => t.tgenabled === 'O'));
    const grants = (await db.query<{ allowed: boolean }>("select has_column_privilege('authenticated','public.items','posted_at','UPDATE') or has_column_privilege('authenticated','public.items','legacy_post_date','UPDATE') as allowed")).rows[0]!;
    assert.equal(grants.allowed, false);
  } finally { await db.close(); }
});
