# Frontend verification — September 15, 2026

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
