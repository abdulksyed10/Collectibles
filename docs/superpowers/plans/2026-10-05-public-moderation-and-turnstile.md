# Public Moderation and Turnstile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish public content immediately, automatically remove reported content after five distinct member reports, and provide secure review and submit-triggered Turnstile behavior.

**Architecture:** A database migration converts the unshipped manual publication model into immediate publication with private review state. The same migration owns report thresholding, text checks, and admin-only RPCs; the React Native app consumes those RPCs and the media Edge Function verifies admin image access. CAPTCHA moves from render-time verification to an explicit client state machine on web and native.

**Tech Stack:** Expo React Native/Web, TypeScript, Supabase Postgres/RLS/RPCs, Supabase Edge Functions, Cloudflare Turnstile, PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-public-moderation-and-turnstile-design.md`

## Global Constraints

- Default public visibility remains immediate; no approval queue is introduced.
- Only authenticated users may report; five distinct users trigger automatic review.
- All public reads must continue to use `private.visible_public_items`.
- The admin grant is server-side and scoped to the designated account, never a client email check.
- Turnstile tokens are only requested after a submit attempt and remain single-use.
- R2 credentials, service-role keys, and private backups must remain ignored and unlogged.

## Review Focus

- A single account changing report reason or reporting on a later date must not increase the five-reporter count; Task 1 adds the database regression.
- A reviewed collection must hide its entries from every Explore surface and public media; Task 1 adds projection and image-lookup tests.
- A restored target must remain visible until five new distinct active reports arrive; Task 1 adds restore-cycle coverage.
- A non-admin signed-in session must not read review data or private review thumbnails; Tasks 2 and 3 add permission tests.
- A login screen render, form edit, or expired token must not start or loop a CAPTCHA check; Task 5 adds web and native bridge regressions.

---

### Task 1: Replace manual approval with report-threshold review in the database

**Files:**
- Create: `supabase/migrations/202610050001_report_threshold_review.sql`
- Modify: `tests/backend/moderation.test.ts`, `tests/backend/public-safety.test.ts`, `tests/backend/collection-first-public-media.test.ts`, `tests/backend/migrations.ts`

**Interfaces:**
- Produces: `public.report_public_content(...)`, `private.visible_public_items`, `public.list_owned_publications()`, `private.moderation_config`, and item/collection review states consumed by later tasks.

- [ ] Write database tests for immediate publication, five distinct authenticated reporters, duplicate prevention, auto-hide propagation, restore cycles, and private/public text boundaries.
- [ ] Run the focused backend tests and observe each new assertion fail under the current pending-review schema.
- [ ] Add the migration: publication states, collection publication state, active-report uniqueness, threshold configuration, review transitions, public text validation, and owner-facing publication status.
- [ ] Update all public projection/query functions and public-media lookups to enforce both item and collection review state.
- [ ] Run focused backend tests and the full `npm test` suite.
- [ ] Commit the database behavior and tests.

### Task 2: Add server-authorized admin queue and safe initial grant

**Files:**
- Modify: `supabase/migrations/202610050001_report_threshold_review.sql`, `supabase/scripts/review-public-content.ts`
- Create: `supabase/scripts/grant-admin.ts`
- Modify: `tests/backend/moderation.test.ts`, `tests/backend/public-safety.test.ts`

**Interfaces:**
- Consumes: Task 1 review-state tables and report lifecycle.
- Produces: `public.get_admin_context()`, `public.list_admin_review_queue(page)`, `public.resolve_admin_review(...)`, and the admin bootstrap command consumed by Tasks 3 and 6.

- [ ] Write failing database tests proving non-admin sessions cannot list or resolve review targets and that restore resolves the relevant reports.
- [ ] Run focused tests and confirm role enforcement is absent.
- [ ] Implement `private.app_admins`, role-check helper, admin RPCs, queue projection without reporter identities, and an idempotent bootstrap script that only grants the supplied account.
- [ ] Run focused tests and the full database test suite.
- [ ] Commit admin authorization, queue interfaces, and tests.

### Task 3: Secure review-media thumbnails through the media Edge Function

**Files:**
- Modify: `supabase/functions/media/http.ts`, `supabase/functions/media/index.ts`, `supabase/functions/media/database.ts`, `supabase/functions/media/service.ts`
- Modify: `tests/backend/media.test.ts`, `tests/backend/http.test.ts`

**Interfaces:**
- Consumes: `public.get_admin_context()` and review item IDs from Task 2.
- Produces: authenticated `media` action for admin-only review thumbnails.

- [ ] Write failing handler tests for unauthenticated/non-admin denial and admin thumbnail access.
- [ ] Run Deno or Node handler tests and observe denial/access behavior is unavailable.
- [ ] Implement one bounded read-only action that authorizes the current JWT through the database before reading a review thumbnail from R2.
- [ ] Run focused handler tests, Deno type checks, and the complete test suite.
- [ ] Commit the reviewed-media path and tests.

### Task 4: Add report feedback, owner review state, and the mobile-first admin page

**Files:**
- Create: `src/screens/AdminReviewScreen.tsx`
- Modify: `src/domain/models.ts`, `src/data/repository.ts`, `src/data/demo.ts`, `src/screens/LibraryScreen.tsx`, `src/components/PublicSafetyControls.tsx`, `App.tsx`
- Modify: `tests/domain.test.ts`, `tests/public-pages.test.ts`, `tests/e2e/public-safety.spec.ts`, `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: Task 1 report acknowledgment/publication state and Task 2 admin RPCs.
- Produces: report-only-for-members UI, review-state copy for owners, and an admin review route.

- [ ] Write failing domain/UI tests for member-only reporting, five-report explanatory copy, admin route denial, and queue actions.
- [ ] Run focused tests to confirm the existing guest CAPTCHA report UI and no admin route fail the new expectations.
- [ ] Add repository methods/types, report controls that require sign-in, an authorized admin navigation entry, and the responsive queue screen with restore/remove actions.
- [ ] Run focused UI tests, typecheck, and `npm test`.
- [ ] Commit the app moderation interface and tests.

### Task 5: Change CAPTCHA to submit-triggered execution without automatic retry loops

**Files:**
- Modify: `src/components/CaptchaChallenge.web.tsx`, `src/components/CaptchaChallenge.native.tsx`, `src/components/CaptchaChallenge.d.ts`, `src/screens/AuthScreen.tsx`, `public/auth/captcha.js`, `public/auth/captcha.html`, `src/auth/captchaMessages.ts`
- Modify: `tests/captcha-messages.test.ts`, `tests/e2e/captcha.spec.ts`, `tests/auth-security.test.ts`

**Interfaces:**
- Produces: an imperative CAPTCHA challenge handle with `execute()` and deliberate `retry()` behavior for auth forms.

- [ ] Write failing tests for no initial execution, exactly one execution after form submit, and manual retry after error/expiry.
- [ ] Run the tests to confirm current render-time configuration violates those assertions.
- [ ] Implement explicit execution, interaction-only appearance, manual retry/refresh, and the AuthScreen checking/submitting state machine for both web and native bridge paths.
- [ ] Run CAPTCHA tests, typecheck, and the full test suite.
- [ ] Commit CAPTCHA behavior and tests.

### Task 6: Update operational guidance and validate the release path

**Files:**
- Modify: `README.md`, `docs/SECURITY.md`, `docs/MODERATION.md`, `docs/DEPLOYMENT.md`, `supabase/.env.example`, `scripts/check-backend-config.ts`
- Modify: `.github/workflows/*` only if validation requires it.

**Interfaces:**
- Consumes: all prior interfaces and deployment requirements.

- [ ] Write or update regression checks for required public Turnstile configuration and named-but-never-printed server secrets.
- [ ] Document migration/function deployment order, initial admin grant, changing the threshold, and the report/review support procedure.
- [ ] Run `npm run typecheck`, `npm test`, `npm run check:secrets`, `npm run check:backend-config`, Expo Doctor, web build, native exports, and Playwright.
- [ ] Commit documentation and verification support.

## Self-review

- Immediate public publication, member-only reporting, configurable five-reporter hiding, text moderation, admin review, and deferred Turnstile each map to Tasks 1–5.
- Task 1 produces the states and RPCs used by Tasks 2 and 4; Task 2 produces the role contract used by Tasks 3 and 4; no interface name changes are left ambiguous.
- The Review Focus cases are assigned to Tasks 1–5.
- No task relies on an untrusted browser flag for authorization or a public R2 route for review content.
