# Deployment checkpoint — September 16, 2026

## Scope and authorization

The user authorized connecting the existing Supabase project and R2 bucket. They requested staged work because their usage window is almost exhausted. Do not start the next stage automatically after completing the current checkpoint.

## Stage 1 — database setup (complete)

- Supabase project: `hoxesktykdwuvunhqnrp`.
- All required local environment fields are populated; values were not printed.
- Supabase CLI login works; the project was linked and the full public/private table inventory was empty before applying migrations.
- Dry run listed exactly the two reviewed migrations. Both were then applied successfully with the CLI.
- Live verification via `scripts/verify-schema.sql` confirmed all five tables, four parent relationships, seven owner policies, four metadata/locking triggers, and the attempt-based inventory primary key.
- RLS is enabled on all three public app tables. Anonymous table access, client owner reassignment, client image-key writes and authenticated access to the private schema all returned false.
- The private tables rely on schema/table privilege restrictions and are not exposed to clients. No test accounts or collection data were created in this stage.
- Migrations: `202609150001_private_pins.sql`, then `202609160001_media_attempts.sql`.
- Backend code reviewed; 38 local tests and TypeScript checks passed in the preceding stage.
- Keep the frontend backend flag disabled until integration checks pass.

## Stage 2 — media deployment (next; not started)

- Verify the database connection and R2 credentials without printing secrets.
- Inspect bucket privacy and CORS; configure the exact development origins.
- Set hosted secrets from ignored `supabase/.env.local`.
- Deploy `media` using the installed Supabase CLI; verify rejection of unauthenticated requests.
- Arrange the cleanup job with the updated attempt-aware cleanup script.

## Stage 3 — connected app acceptance (pending)

- Configure Auth/email/recovery settings, matching password rules.
- Generate database types and test with two disposable accounts.
- Verify ownership isolation, uploads, signed URLs, retries, deletion and cleanup.
- Enable the local backend flag and test the connected frontend.
- Native development builds/device testing and store publication follow separately.

## Resume notes

- Credentials are only in ignored `.env.local`, `supabase/.env.local`, and the CLI credential store. Never include their values in logs, Git or chat.
- Do not reset the remote database or rerun already recorded migrations. Inspect migration history first when resuming.
- GitHub publishing remains separate; do not infer permission from a remote URL when the earlier destination question is unresolved.
- See `docs/CONNECT-SERVICES.md` for operator commands and `docs/BACKEND.md` for backend behavior.

## Current stopping point

Database migrations are live. Media function deployment, R2 connection/privacy/CORS verification, Auth setup, cleanup scheduling and live two-account tests are still pending. The frontend stays in demo mode. Resume with Stage 2; do not reapply or reset Stage 1.
