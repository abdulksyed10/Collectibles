# Frontend verification — September 15, 2026

This file is chronological. The latest completed stage and remaining live work are in [the deployment checkpoint](DEPLOYMENT-CHECKPOINT.md).

## Passed locally

- TypeScript: `npm run typecheck`.
- 34 domain, demo, secret-check and draft-backend tests: `npm test`.
- Expo dependency compatibility: `npx expo install --check`.
- Production web export and Hermes bundles for Android/iOS: `npx expo export --platform all --clear`, with dotenv disabled and empty public service configuration.
- Six Playwright browser scenarios with isolated Chrome: mobile collection/photo/create/edit/search/delete, desktop login validation, partial-upload edit recovery, local logout cleanup retry, failed server logout, and demo isolation/reset.
- Rechecked the final backend-disabled, credential-free export: sign-in disabled, gallery/edit/search/reset functional, zero Auth/REST/media requests and no horizontal overflow at 390px. The check caught stale Metro environment settings; clearing the export cache fixed them and is now part of the web build command.
- Independent frontend code review; identified client failure paths corrected. Native temporary-photo wording corrected.
- Staged/all-tracked files and existing Git history passed the repository's secret rules. Local environment files and generated artifacts are ignored. The default web bundle contains no project reference or detected server credentials.

Browser integration tests intercept external services at the network boundary. Database tests use the actual SQL migration in PGlite with an Auth test shim; media tests use local substitutes for remote I/O. These establish local behavior, not hosted Supabase/R2 readiness.

## Deferred acceptance

- Supabase tables, Auth/email configuration, R2 bucket/secrets, media deployment and cleanup scheduling.
- The known stale-upload retry race and real two-account/privacy/concurrency checks in [the integration plan](INTEGRATION-PLAN.md).
- Installed/signed Android and iOS builds, camera/permission/keyboard behavior on devices, and store submission. Successful JavaScript/Hermes export is not a native-device test.
- `npm audit` reports 10 moderate dependency-path findings through Expo's `xcode` / `uuid` tooling dependency (GHSA-w5hq-g745-h8pq). Review an upstream-compatible update before release; the audit's proposed Expo 46 downgrade is incompatible with this SDK 57 project and was not applied.

GitHub Actions contains repeatable checks for both fixture-connected UI and credential-free demo builds. Local passing checks do not claim a completed hosted CI run.

## September 16 backend preparation

- The stale-upload retry race is fixed using separately inventoried attempt keys. The regression reproduces a timed-out PUT completing after a retry and checks that the committed image is unchanged.
- An upgrade migration preserves existing object keys and grants. Apply the initial migration and then `202609160001_media_attempts.sql` before deploying the updated function and cleanup script.
- 29 backend tests and the Deno check passed; independent backend review approved the code for deployment and live acceptance checks.
- Supabase CLI 2.117.0 is installed as a pinned development dependency. The configuration checker reports missing fields without displaying credentials.
- Hosted tables/functions have not yet been deployed. CLI login and the remaining server-only configuration are required.

## Stage 1 hosted database checkpoint

Both migrations were applied to the authorized project through the CLI after inspecting the empty schema and dry run. Live metadata checks confirmed the five app/private tables, parent foreign keys, seven owner policies, RLS on public tables, restricted client grants and the attempt-based inventory primary key. This verifies the deployed schema; R2/media and real-account end-to-end tests remain Stage 2/3 work. See `DEPLOYMENT-CHECKPOINT.md`.

## September 16 — Collectibles hierarchy

- 45 domain/demo/backend/secret-check tests pass. New coverage includes custom collectible types, category filtering and collection moves, ownership rejection, category quotas, starter provisioning, and empty-only category deletion.
- The upgrade test seeds the historical populated pin schema, applies forward migrations and checks preserved item/image IDs, original object keys, attempt inventory and owner counters.
- Review found category DELETE omitted the statement-level owner lock. A regression test failed before the fix and passes afterward; frozen accounts cannot delete categories, while Auth can complete account cascades. Scoped review approved the correction.
- TypeScript and the frozen/cached Deno check pass.
- The final credential-free export passed for web plus Android/iOS Hermes bundles using `EXPO_NO_DOTENV=1` and the backend flag disabled. This confirms compilation, not installation or device behavior.
- Both demo browser scenarios passed again against that final export: real sign-in stays disabled; custom categories, collection moves, edits, deletion and reset work without service calls.
- Nine browser workflows passed against intercepted Auth/REST/media calls: desktop and mobile custom hierarchy, navigation with all 20 categories, creation/photo/edit/search/delete, failed photo save recovery, sign-out failure handling and isolated demo reset. These verify app behavior, not live service connectivity.
- Migration `202609160002_collectibles_hierarchy.sql` was applied to the authorized Supabase project after a dry run. Migration history matches, and live schema verification confirms categories → collections → items → item_images, owner RLS/grants, quota/locking triggers and the new-user starter trigger.
- No live accounts were created and the media function was not deployed in this stage. R2, real-account privacy/expiry/cleanup checks and native device testing remain outstanding.

## September 16 — mobile library, visibility and dates

- All 55 domain, demo, backend and secret-rule tests pass. New coverage checks local-calendar dates, invalid dates and infinity, omitted-field preservation, private defaults, safe share URLs, public projection and pagination, anonymous table isolation, metadata/photo revocation and bounded R2 reads.
- TypeScript and Deno checks pass. The Deno task now includes both media entrypoints and the cleanup script.
- Applied `202609160003_collection_sharing.sql` after inspecting linked history and its dry run. All four local/remote migration versions match. Live schema checks confirm private defaults, required date fields, the bounded anonymous RPC and unchanged owner table protection. No collection was made public by the migration.
- Review found background public-view refresh reset pagination and closed an open photo every minute. The correction rechecks loaded pages without clearing an unchanged view, and removes content when unavailable or moved out of the collection. Dedicated browser regressions cover this behavior.
- All 13 fixture-connected browser scenarios pass, including the existing CRUD/hierarchy/upload-failure flows, 320px layout and overflow checks, private/date defaults, date editing, demo preview, anonymous share-link access, no owner-data requests from anonymous views, revocation, and background revalidation. Mobile and desktop screenshots were inspected. The scoped correction review found no blocking issues.
- Expo's dependency compatibility check passes with the native date picker installed.
- The final credential-free export passes for web, Android and iOS Hermes bundles with dotenv disabled. The web bundle contains no project reference or detected server credentials. This verifies compilation; installed native date-picker/device behavior still needs device testing.
- All three demo browser scenarios pass again against that final export. Sign-in remains disabled until service setup; demo editing, hierarchy, dates and sharing preview work without service calls. All 84 source/documentation files pass the secret scan; local environment files and generated artifacts remain ignored.
- `npm audit` reports 11 moderate dependency-path findings, all from the existing `xcode`/`uuid` advisory GHSA-w5hq-g745-h8pq. The new date picker adds another tooling dependency path. No high or critical findings were reported, and no incompatible forced dependency change was applied.
- R2 privacy/CORS, both hosted media functions, hosted share-link URL, Auth settings and live two-account acceptance remain pending. Public sharing is implemented in source and the demo has a read-only preview; it is not yet a deployed public service.
