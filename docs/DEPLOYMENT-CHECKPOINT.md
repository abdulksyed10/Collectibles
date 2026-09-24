# Deployment checkpoint — updated September 24, 2026

> **Current redesign status — September 24, 2026:** `202609240001_public_image_lookup_bridge.sql` and `202609240002_collection_first.sql` are applied to the linked Supabase project. The media function paused mutations during the upgrade; bridge-aware `public-media` was deployed before the final transaction, and mutations were restored afterward. The app now uses the collection-first schema.

## Completed collection-first rollout

- Local source now treats collections as parents, categories as optional children, and visibility as an item field.
- Cloudflare R2 remains connected through server-side functions and the bucket must remain private; the redesign does not require a new bucket or client R2 credentials.
- An ignored local metadata backup was made before the change. The maintenance-capable media function paused mutations, the bridge migration was applied, bridge-aware `public-media` was deployed, and the transactional hierarchy migration was applied. Mutations are restored.
- Live checks confirm the legacy `collections.category_id` column is gone, categories have collection parents, items have visibility, the anonymous Explore projection is security-definer protected, and existing item/image metadata is preserved. Complete the remaining disposable owner/viewer checks: private entry denial, public sibling visibility, revocation, category detachment, old-link scope, quota rejection, and private-bucket denial before beta launch.

## Scope and authorization

The user authorized connecting the existing Supabase project and R2 bucket and requested resumable stages. They then broadened the app to Collectibles: customizable collectible types (Pins, Pokémon Cards, Bottle Caps, Boots, etc.), with collections and items within them. Entries below are historical stage records; the current stopping point and [beta launch checklist](BETA-LAUNCH.md) describe remaining work.

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

## Stage 2 — media deployment (complete, September 17)

- Migration `202609160004_media_budgets.sql` was reviewed in a dry run and applied to the linked project. It adds private rate, byte, photo-count and public-read controls without modifying collection data.
- Live verification confirms the limits row is seeded and enabled; anonymous/authenticated roles cannot read the limits, owner budgets, attempts or public-read counter.
- The ignored server configuration passed its name-only checker. Seven server values were uploaded to Supabase secrets without printing their contents.
- The empty R2 bucket accepted authenticated object requests. The S3 base URL rejected unsigned access. The Cloudflare dashboard confirms public access is disabled, there is no custom domain, and the public development URL is disabled. The current least-privilege R2 token cannot inspect CORS (HTTP 403); the dashboard now confirms a local browser rule for `http://127.0.0.1:4173` and `http://localhost:8081`, with only GET/HEAD access.
- Both `media` and `public-media` functions are ACTIVE. A credential-free `media` request returned 401 and malformed `public-media` request returned 400, confirming the deployed code starts with its configured secrets.
- The local backend flag is enabled in ignored `.env.local`; restart Expo with a cleared cache before trying the connected app.

The deployed defaults are 100 photos/account, 20 attempts/account/hour, 50 attempts/account/day, 200 attempts/app/day, 250 MiB/account lifetime photo reservations, 1 GiB/app lifetime photo reservations, and 10,000 anonymous shared-photo reads/app/day. Failed and deleted uploads remain reserved to protect against late R2 writes. The controls are conservative app limits, not a guarantee of a provider-wide spending cap.

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
- Verify opt-in shared links from a signed-out browser, private-field exclusion, and revocation of metadata/photos. Configure the hosted web URL for native share links.
- Enable the local backend flag and test the connected frontend.
- Native development builds/device testing and store publication follow separately.

## Resume notes

- Credentials are only in ignored `.env.local`, `supabase/.env.local`, and the CLI credential store. Never include their values in logs, Git or chat.
- Do not reset the remote database or rerun already recorded migrations. Inspect migration history first when resuming.
- GitHub publishing was authorized and the project has been pushed to `abdulksyed10/Collectibles`, branch `codex/private-pin-mvp`. Keep secrets and generated builds excluded.
- See `docs/CONNECT-SERVICES.md` for operator commands and `docs/BACKEND.md` for backend behavior.

## Stage 1c — collection sharing and acquired dates (live database complete)

- Applied `202609160003_collection_sharing.sql` after a dry run that listed only this new migration.
- Collections now have required `visibility` (default Private) and `acquired_on` (default current date) fields. Existing dates are backfilled from creation dates. No collection was published by deployment.
- Live schema checks confirm all four public tables retain RLS and all 11 owner policies. Anonymous raw-table access and writes remain denied; only the explicit `get_shared_collection` projection is executable anonymously.
- Public metadata exposes collection name/description/category and item names/photo availability. Notes, acquired dates, owner IDs and storage keys are excluded.
- The UI now has compact mobile controls, Private/Public owner tabs, a date picker, opt-in sharing and a read-only public route. R2 remains private by design; the new `public-media` source checks visibility before proxying bytes with no-store headers.
- Function deployment is still Stage 2. No live accounts or shared test collections were created in this stage. See `COLLECTION-SHARING.md` for the contract and setup.

## Current stopping point

All eight migrations, including `202609170005_public_catalog.sql`, `202609240001_public_image_lookup_bridge.sql`, and `202609240002_collection_first.sql`, and both media functions are deployed. Real user-created accounts/uploads exist; the earlier empty-project checks are historical. Explore now lists shared entries across accounts and can switch to collections. The legacy `collections.category_id` constraint that blocked top-level collection creation is no longer present. Do not reset the database or modify existing users for acceptance tests.

The September 21 readiness review found missing mobile app identifiers/EAS association, a hosted web origin/share URL, native installation evidence, public-content reporting/blocking, published privacy/support/deletion pages, and cleanup scheduling. Hosted Auth/email settings still need verification. See [BETA-LAUNCH.md](BETA-LAUNCH.md) for ordered stages and device acceptance; [VERIFICATION.md](VERIFICATION.md) records checks completed locally.
