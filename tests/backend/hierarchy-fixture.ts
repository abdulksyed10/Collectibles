import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrations.ts';

export async function createHierarchyFixture(through = '~') {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE supabase_auth_admin;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(
      id uuid PRIMARY KEY,
      email text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  `);
  await applyMigrations(db, '', through);
  return db;
}

export async function asOwner<T>(db: PGlite, ownerId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${ownerId}', false);`);
  try {
    return await run();
  } finally {
    await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
  }
}

/** Test-only operator action. Production approval is performed outside app roles. */
export async function approvePendingPublications(db: PGlite, itemIds?: string[]) {
  if (itemIds?.length) {
    await db.query("UPDATE private.item_publication SET status='approved', approved_revision=revision, reviewed_at=now() WHERE status='pending' AND item_id=ANY($1::uuid[])", [itemIds]);
    return;
  }
  await db.query("UPDATE private.item_publication SET status='approved', approved_revision=revision, reviewed_at=now() WHERE status='pending'");
}
