# Deployment checkpoint — September 16, 2026

## Scope and authorization

The user authorized connecting the existing Supabase project and R2 bucket and requested resumable stages. They then broadened the app to Collectibles: customizable collectible types (Pins, Pokémon Cards, Bottle Caps, Boots, etc.), with collections and items within them. This checkpoint records that completed schema/UI stage; media integration remains next.

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

## Stage 1b — Collectibles hierarchy (live database complete)

- Added and applied `202609160002_collectibles_hierarchy.sql`; all three local/remote migration versions match.
- Preflight confirmed zero Auth users, collections, pins/images, or media attempts and no table-name conflicts. No user data or credentials were printed, and no database reset occurred.
- Public tables are now `categories`, `collections`, `items`, and `item_images`. Private inventory and state remain server-only. The migration renames existing tables/columns in place, retains object keys, and assigns existing collections to each owner's Pins starter category.
- Categories are custom, owner-scoped rows. New Auth users receive Pins automatically; it can be renamed or deleted. Collections require an owned category and can be moved without changing their items/photos. Direct category deletion is allowed only when empty.
- Limits: 20 categories, 50 collections, 500 items. Category deletion uses the owner lock and respects frozen account state; Auth's account cascade remains possible.
- Live verification confirmed four public tables with RLS, 11 owner policies, six parent foreign keys and seven triggers. Anonymous table access, client owner/identity changes, image-key writes and private-schema access all returned false; category selection updates and empty-category deletion grants are present.
- The app/UI/demo and media source now use generic item terminology and Collectibles branding. Media requests use `itemId`, `itemIds`, and `delete-item`; deploy the matching current function/cleanup code, not an older pin-based version.
- Local tests, browser results, and native export status are recorded in `VERIFICATION.md`. Real Supabase/R2 account behavior still needs Stage 3 acceptance.

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

The generic Collectibles schema is live, and category/collection/item UI is implemented. Media function deployment, R2 connection/privacy/CORS verification, Auth setup, cleanup scheduling and live two-account tests are still pending. The frontend stays in demo mode. Resume with Stage 2 using the new item-based API; do not reapply or reset Stage 1/1b.
