# Collectibles Store Preparation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task after the user approves implementation. Steps use checkbox (`- [ ]`) syntax for tracking. Execute in the current task; do not dispatch sub-agents without user authorization.

**Status:** Proposed plan only. No application code, database migrations, hosted settings, dependencies, or builds were changed while preparing it.

**Goal:** Deliver safer account access, frictionless image capture/organization, useful guest discovery, and verified Android/iOS store candidates.

**Architecture:** Keep the existing Expo application, Supabase Auth/PostgreSQL/Edge Functions, and private R2 bucket. Add server-enforced signup controls, atomic item-draft saves, restricted public projections, and optional discovery topics while preserving collection ownership and per-item visibility. Use platform adapters only where authentication challenges, media selection, and device appearance require them.

**Tech Stack:** Existing Expo 57/React Native/TypeScript, Supabase PostgreSQL and Deno functions, R2, PGlite, Playwright; add an SDK-compatible native WebView for CAPTCHA and device preference storage/system UI packages only when their task begins.

**Spec:** [Store preparation design](../specs/2026-09-28-store-preparation-design.md). Recommendations in the spec are proposed, not already approved product decisions.

## Global constraints

- Wait for the user's explicit go-ahead before implementation or production configuration changes.
- Preserve all existing accounts, collection/category/item identities, photo keys, and item visibility. Do not reset the shared database.
- New items default to Private. Collection, category, topic, and theme never publish an item.
- Keep database/R2/admin/CAPTCHA secrets server-only and out of Git; public environment variables are readable in distributed builds.
- Keep public projections free of private notes, acquired dates, email/Auth IDs, storage keys, and private category details.
- Keep existing upload/read budgets unless the user approves a measured adjustment. No claim of a provider-wide spending cap.
- Support web, Android, and iOS in each affected feature; do not defer native CAPTCHA until after enabling mandatory CAPTCHA.
- Default new item acquired date to the user's local calendar date; preserve unknown dates as null; order uploads by created_at/id.
- Exact rejected-media copy: `Unsupported file type. Only images are supported.`
- Use Classic, Fun, Dark, and System appearance choices. Keep the UI mobile-first and explanatory copy short.
- Make new database changes additive initially; do not drop legacy acquired-date columns while older clients may still use them.
- No paid service upgrade, account creation, store submission, or broad live invitation merely as a side effect of implementing a task.

## Review focus

- A refreshed form, raw API call, or second device bypasses a client-only pause: verify CAPTCHA and signup limits at hosted Auth, not just disabled buttons (Tasks 1–2).
- Mobile challenge/HEIC selection behaves differently from desktop: require a physical-device check before marking auth/upload complete (Tasks 1, 3, 6).
- A failed or uncertain request creates duplicate General collections, categories, or items: verify concurrent metadata saves and photo reconciliation (Tasks 4–5).
- An open public viewer or grouped cover exposes an entry after privacy/moderation changes: use the same eligibility rules and revalidation across projections/media (Tasks 6–8).
- A guest navigation refactor accidentally mounts owner queries or loses the user's place: test guest network calls, auth return targets, Back, and account switching (Task 6).

## Milestones and order

| Order | Deliverable | User requests | Gate |
|---|---|---|---|
| 0 | Read-only baseline and configuration inventory | Native readiness, security | Identify capabilities; record current behavior |
| 1 | Auth challenges, retry UX, signup limits | 1 | Server-bypass and native challenge checks |
| 2 | Image validation and first-upload workflow | 3, 4 | First account can save a photo without a setup detour |
| 3 | Guest Explore and direct item viewer | 2, 5 | Anonymous privacy and navigation checks |
| 4 | Moderation/report/block and account lifecycle | Store prerequisites | Public eligibility enforced through image bytes |
| 5 | Topics and alias-based grouping | 6 | Separate owners remain separate; counts include public items only |
| 6 | Appearance preferences | 7 | All three visual styles tested on device |
| 7 | Store candidate validation and distribution preparation | Android/iOS | Signed binaries and real lifecycle checks |

Security and correct uploads come first. Run an early native build after Milestone 2/3; do not wait for topics/themes to find platform failures. Milestones 5 and 6 can be deferred if needed for a smaller safe beta.

## Task 0: Establish the implementation baseline

**Files:** Read `App.tsx`, `src/auth/session.ts`, `src/lib/photos.ts`, `src/screens/Editors.tsx`, `src/screens/PublicCatalog.tsx`, `app.json`, `eas.json`, `supabase/config.toml`, and deployment docs. Update only `docs/DEPLOYMENT-CHECKPOINT.md` and `docs/BETA-LAUNCH.md` when recording verified implementation-time findings.

**Produces:** A redacted capabilities inventory and a baseline acceptance record; no secrets or user records.

- [ ] Record branch/HEAD and working-tree changes; preserve unrelated work. Read applicable repository instructions again at execution time.
- [ ] Inspect hosted Auth plan/hook availability, CAPTCHA status, rate settings, SMTP, confirmation, recovery template, site/redirect URLs, and function versions using read-only access. Do not infer these from local config.toml.
- [ ] Check hosted Vercel origin, media allowlist, and R2 browser-read configuration. Persist the previously added production origin into the ignored local server configuration/runbook too, so a later full secrets upload cannot accidentally replace it with localhost-only values.
- [ ] Choose a disposable/staging backend for aggressive auth/concurrency tests. Keep deliberate brute-force/load tests away from production accounts and shared rate limits.
- [ ] Run the existing CI-equivalent checks. Record observed failures separately from planned features; an export or a stale historical test report is not a native-device pass.
- [ ] Record the recommended security policy as CAPTCHA + provider throttling + signup hook. If the user selected strict lockout, verify the required paid Auth hook before planning deployment; do not build a bypassable client-only substitute.
- [ ] Arrange the Expo project, device access, and identifiers needed by Task 10 before the early native build. Perform that task's build setup when the first platform test needs it; do not postpone all native configuration until the final milestone.

## Task 1: CAPTCHA and understandable authentication failures

**Files:** Modify `src/auth/session.ts`, `src/screens/AuthScreen.tsx`, `.env.example`, `package.json`/lockfile. Create `src/auth/authErrors.ts`, `src/auth/challenge.ts`, `src/components/CaptchaChallenge.tsx` (native), `src/components/CaptchaChallenge.web.tsx`, and a hosted challenge page under `public/`. Add `tests/auth-errors.test.ts` and `tests/e2e/auth-protection.spec.ts`.

**Interfaces:**

- `type AuthAction = 'signin' | 'signup' | 'reset'`.
- `mapAuthError(error: unknown, now: number, retryAfter?: string): { kind: 'credentials' | 'rate-limit' | 'captcha' | 'network' | 'other'; message: string; retryAt?: number }`.
- Challenge component props: `{ action: AuthAction; requestId: string; onToken(token: string): void; onExpired(): void; onError(message: string): void }`.
- Extend `auth.signIn/signUp/sendReset` with a CAPTCHA token argument; pass it in Supabase's documented options. Preserve `verifyReset` and `updatePassword` flows.

- [ ] Write tests for invalid credentials, unknown-account-safe messages, a valid Retry-After deadline, a 60-second fallback pause, expired challenge, cancellation, and connection failure. A network failure must not be counted as a wrong password.
- [ ] Run the targeted tests and confirm they fail on the missing behavior.
- [ ] Add the platform challenge adapters. Web uses the public site key. Native loads the owned HTTPS challenge page in an SDK-compatible WebView, matching request nonces and rejecting unsolicited/oversized messages and unexpected navigation. Never send form passwords to that page.
- [ ] Add pending/submitting/cooldown states to the form. After five credential failures in ten minutes, pause this device's password submit for 60 seconds; a provider deadline takes precedence when supplied. Do not assert this locks the account server-wide. Clear appropriate local failure state on successful sign-in; reset challenge tokens between submissions.
- [ ] Keep protected recovery available separately. Do not automatically send repeated emails, force password changes on failed guesses, or tell a visitor whether an account exists.
- [ ] Test challenge accessibility, offline/retry, Android WebView and iOS WKWebView. Add Vercel/EAS public site-key configuration and store only the secret in hosted Supabase Auth settings.
- [ ] Deploy compatible clients/challenge page before enabling mandatory CAPTCHA. Verify missing, bad, expired, and replayed tokens are rejected through direct Auth requests in staging; valid tokens allow the intended actions. Confirm signed-in session refresh remains usable.
- [ ] Run targeted tests/typecheck and record physical-device results. Commit the task with no environment values or test credentials.

**Optional strict-lock alternative:** Only after explicit policy selection and entitlement confirmation, add a Password Verification Attempt hook with private atomic counters, a fixed five-in-fifteen-minute threshold and sixty-minute expiry, recovery/unlock checks, no lock extension from blocked attempts, and `should_logout_user=false`. Test direct Auth bypass, competing requests, successful recovery, nonexistent accounts, and active sessions. This optional work is separate from completing the recommended baseline.

## Task 2: Server-enforced signup limits and operations

**Files:** Create an additive migration ending `_signup_admission.sql`, `tests/backend/signup-admission.test.ts`, and a bounded cleanup script for signup events. Modify `supabase/config.toml` for local hook wiring and `docs/BACKEND.md` / `docs/CONNECT-SERVICES.md` for deployment and rollback.

**Interfaces:** `private.before_user_created(event jsonb) returns jsonb`, callable by `supabase_auth_admin` only. Private configuration/event tables supply the hook; no application REST access. Store only a trusted event identifier, timestamp, and HMAC of the normalized source IP for counters.

- [ ] Add SQL tests: five admissions from one IP in an hour succeed; the sixth is refused; the eleventh in 24 hours is refused; the fifty-first project admission in 24 hours is refused; another eligible IP works; expired windows recover; deletes do not erase admission history; duplicate event processing is idempotent; missing/invalid metadata is safe.
- [ ] Test that `anon`/`authenticated` cannot read counters, execute the hook, change limits, or forge a source through user_metadata.
- [ ] Implement the hook with a consistent transaction lock order so concurrent admissions cannot exceed ceilings. Use database time and event metadata, not client timestamps. Verify with a real PostgreSQL/Supabase concurrency test; PGlite alone is insufficient for this acceptance.
- [ ] Confirm transaction behavior: the admitted event remains when a user is created, rejection does not create a user, and failed signup cannot corrupt counters. Record only bounded diagnostic event types, not raw payloads.
- [ ] Add two-day event retention and an authenticated operator pause/unpause control. Document that per-IP caps affect shared networks and that the 50/day project cap can pause legitimate signup under abuse.
- [ ] Audit hosted provider rate limits, confirmed-email requirements, and SMTP caps; preserve token-refresh capacity. Keep email-send, signup, upload, and public-read budgets separately observable.
- [ ] Test missing CAPTCHA + direct signup + account deletion/recreation + distributed emails. Confirm that bypassing the UI does not bypass admission enforcement. Enable the hook after staging verification and a metadata/config checkpoint.
- [ ] Verify the kill switch and hook rollback procedure preserve existing sign-in. Commit the tested migration, tests, and runbook; configure alerts through the operator's chosen service when access is available.

## Task 3: Correct media selection and errors

**Files:** Modify `src/lib/photos.ts`. Create `src/domain/photoValidation.ts`, `tests/photo-validation.test.ts`, and image-selection cases in `tests/e2e/app.spec.ts`. Reuse backend media tests rather than weaken upload checks.

**Interfaces:** `classifyPhotoSelection(asset: { type?: string | null; mimeType?: string | null; width?: number; height?: number }): 'image' | 'needs-decode' | 'unsupported'`; `photoErrorMessage(reason: unknown): string`. `pickPhoto(camera?: boolean): Promise<PreparedPhoto | null>` retains its current signature.

- [ ] Write failing tests for PDF, MP4/MOV/WebM, picker-thrown unsupported-type errors, missing MIME on a genuine image, corrupt image, permission denial, cancellation, and oversized prepared bytes.
- [ ] Validate asset metadata before calling the manipulator; use decoding for ambiguous assets. Normalize known picker failures to the exact image-only message, including errors thrown before an asset is returned.
- [ ] Use a separate readable-image error for failed decoding, and retain size/permission errors. Ensure cancelled/invalid selection preserves the existing selected image and other form fields.
- [ ] Test JPEG/PNG/WebP where decoding is supported, native HEIC/HEIF conversion, a renamed PDF, and video files selected by bypassing the browser filter. No metadata save/upload request occurs for an invalid selection.
- [ ] Run the existing server JPEG/size/budget tests plus the targeted client tests. Record physical-device format limits. Commit.

## Task 4: Add item dates and atomic organization saves

**Files:** Create an additive migration ending `_item_draft_saves.sql` and `tests/backend/item-drafts.test.ts`. Modify `src/domain/models.ts`, `src/domain/validation.ts`, `src/data/repository.ts`, `src/data/demo.ts`, and domain/demo tests.

**Interfaces:**

- `Item` gains `acquired_on: string | null`; `ItemDraft` gains `acquiredOn?: string | null`.
- `CollectionSelection = { kind: 'existing'; id: string } | { kind: 'general' } | { kind: 'new'; name: string; description: string }`.
- `CategorySelection = { kind: 'none' } | { kind: 'existing'; id: string } | { kind: 'new'; name: string }`.
- `saveItemDraft({ requestId, itemId?, item, collection, category }): Promise<{ item: Item; collection: Collection; category: Category | null }>` on the repository. `item` carries title, notes, acquiredOn, and visibility, not owner/parent IDs supplied by an untrusted client.
- SQL RPC `public.save_item_draft(p_request_id uuid, p_item_id uuid, p_item jsonb, p_collection jsonb, p_category jsonb) returns jsonb`. The JSON shape matches the repository contract. `p_item_id` is null for a new item; the request ID makes identical retries return the same saved result.

- [ ] Write SQL tests for local-date values, leap days, explicit null, omitted legacy values, private defaults, and owner-only date access. Existing entries must remain null; no automatic collection-date copying.
- [ ] Add nullable item date/grants and a protected `is_default` collection marker with a partial unique index per owner. Normal clients cannot set/reset the marker directly.
- [ ] Implement General resolution inside the item RPC: reuse that owner's default, or create one under the owner lock. If a user already has a unique exact-name General collection, it may be adopted; if ambiguous, create an explicitly marked default without merging data. It counts toward existing collection quotas; report a clear choice to select an existing collection when the quota is full.
- [ ] Atomically create only requested new parents/category, validate owner/parent relationships and field bounds, and create/update the item. Preserve existing quota locks and media/deletion lock ordering. Restrict security-definer search_path/grants; never trust a provided owner ID.
- [ ] Store owner-scoped request ID, payload fingerprint, and result IDs in a private deduplication table. Identical retry returns the same result; a changed payload under the same request ID fails cleanly. Keep retry identity at least for the item lifetime so cleanup cannot turn a late retry into a new item. Deletion must not permit replay to recreate a deleted item; use a bounded tombstone/retirement policy consistent with existing media IDs.
- [ ] Test concurrent first saves, duplicate submit, lost response, category mismatch, cross-owner IDs, quotas, and rollback after invalid item data. Confirm cancellation creates no database rows because the UI does not call this RPC until final Save.
- [ ] Preserve existing `saveItem` compatibility while switching the editor next. Update demo behavior to match the same domain rules and dates. Stop supplying collection acquired dates in new client saves, while retaining old columns and legacy RPC response keys during rollout.
- [ ] Run SQL/domain/demo tests and real concurrency acceptance, record migration/backout steps, and commit. Deploy additive schema before the dependent app.

## Task 5: One uninterrupted Add item flow

**Files:** Modify `src/screens/LibraryScreen.tsx`, `src/screens/Editors.tsx`, `src/components/AcquiredDateField.tsx`, and `src/data/useLibrary.ts` as required. Extract `src/screens/ItemEditor.tsx` and `src/components/ItemOrganizationFields.tsx` to keep the expanded editor focused. Add `tests/e2e/item-onboarding.spec.ts`.

**Consumes:** Task 4's `saveItemDraft` and selection types; existing `PreparedPhoto` and media service.

- [ ] Write browser cases for a new empty account, General default, selected collection default, inline new collection/category, cancellation/back, changing collection, local date, and private default.
- [ ] Make Add item always open ItemEditor. Present the General option without persisting it yet; remove the empty-account detour to CollectionEditor.
- [ ] Add concise collection/category help and inline creation sections. Keep every existing field/photo when an inline section is opened/cancelled; changing parent clears only an incompatible category.
- [ ] Move AcquiredDateField to item create/edit. Initialize new dates using `todayLocalDate()`, preserve null for existing unknown dates, and allow clear. Remove collection date controls/detail text. Keep Added/upload timestamp distinct in item details.
- [ ] Submit organization + metadata once using a stable request ID. On confirmed metadata save retain returned IDs, then upload. A metadata retry keeps the same request ID/payload; an intentional edit after a saved result uses the actual item ID and a new request ID.
- [ ] On uncertain image success reconcile the existing image before retrying; preserve current error recovery without creating duplicates. Do not erase the draft on transient errors. Refresh parent lists after a successful save without resetting the still-open editor unexpectedly.
- [ ] Verify a phone-size keyboard never hides required fields/buttons; Back first leaves the inline substep, then the item editor. Test empty names, parent quota reached, and photo failure after parent creation.
- [ ] Run browser fixtures/domain tests, test a first upload on both native platforms, and commit.

## Task 6: Guest navigation and direct public entry viewer

**Files:** Modify `App.tsx`, `src/screens/AuthScreen.tsx`, `src/screens/LibraryScreen.tsx`, `src/screens/PublicCatalog.tsx`, `src/screens/SharedCollectionScreen.tsx`, `src/domain/models.ts`, `src/domain/sharing.ts`, `src/lib/sharing.ts`, and repositories. Create `src/navigation/routes.ts`, `src/screens/ExploreScreen.tsx`, `src/screens/PublicEntryScreen.tsx`, an additive migration ending `_public_entry_detail.sql`, and tests in `tests/e2e/explore.spec.ts` / `tests/backend/public-entry-detail.test.ts`.

**Interfaces:**

- Public route union: `{ kind: 'explore'; view: 'entries' | 'collections' } | { kind: 'entry'; itemId: string } | { kind: 'collection'; collectionId: string }`; Task 8 extends it with topics. Preserve existing `?collection=<id>` URLs and legacy category aliases.
- `readPublicEntry(itemId: string): Promise<PublicEntryCard | null>` via `get_public_entry(p_item_id uuid)`; null covers unavailable/private/missing entries without leaking which condition occurred.
- PublicCatalog callbacks become `onOpenEntry(itemId)` and `onOpenCollection(collectionId)`. A public read repository interface exposes only public methods, rather than mounting `useLibrary` for guests.

- [ ] Add SQL tests proving public single-entry data is available to anon, mixed-visibility siblings stay private, category/date/owner/notes/key fields are absent, and revoked/moved/deleted entries resolve safely.
- [ ] Implement the projection with fixed search_path, restricted grants, ownership-consistent joins, and no raw-table read grants. Retain existing public-media authorization and budgets.
- [ ] Add public routes outside LibraryScreen. Keep loading/recovery precedence correct, avoid creating Supabase anonymous users, and defer all owner queries until real authentication. Add Browse Explore on the landing screen plus guest Sign in/Create account controls.
- [ ] Add an authentication gate that preserves the pending owner action and public return context. Cancelling sign-in returns to the same public view; successful sign-in performs the intended navigation exactly once. Clear private data on account changes/sign-out.
- [ ] Entry taps open the full viewer and revalidate via `readPublicEntry`. Add View collection using the resolved canonical collection ID. Collection taps retain the shared collection route. Handle no-photo entries normally.
- [ ] Preserve feed pages/scroll/mode on Back, support deep links/refresh, and refresh visible entry data on foreground return/60-second intervals. Clear unavailable content; fetch full-resolution bytes only on opening the viewer.
- [ ] Test a guest session with owner endpoints deliberately rejected, cancelled/successful auth return, item not on the first collection page, offline/retry, browser/Android Back, and revocation while the viewer is open. Extend `shared-refresh.spec.ts` rather than regress its existing pagination behavior.
- [ ] Run SQL/browser tests and an early signed native build with the current auth/upload changes. Commit and deploy only after guest privacy checks pass.

## Task 7: Public-content and account-lifecycle release gates

**Files:** Create moderation/report/block migrations, `supabase/scripts/review-content.ts`, `src/components/PublicContentActions.tsx`, and tests for public eligibility and account cleanup. Modify public projections, `supabase/functions/public-media/lookup.ts`, relevant public views, and backend/docs. Add hosted public terms/privacy/support/deletion pages with real publisher/contact information before release.

**Interfaces:**

- Item visibility remains user-owned. Separate server-owned publication review status: pending, approved, hidden. A centralized `private.is_public_item_eligible(item_id uuid)` predicate requires public visibility + approved review + enabled publisher; all public projections and image lookup use it.
- A stable random public publisher identifier maps privately to each owner. Reports use item/collection/publisher public IDs; blocking is linked to the authenticated blocker and public publisher ID.
- Protected reporting operation: validated reason, bounded optional text, deduplication, and a proposed 10 reports/account/day limit. Review/removal actions are operator-only.

- [ ] Add SQL/media tests for pending/approved/hidden public items, private approved items, hidden publishers, blocked feed results, forged reports, rate limits, and unauthorized moderation writes.
- [ ] Implement pending publication and manual approval for the initial cohort, including re-review on public title/photo changes. Document exactly how existing public items enter review; do not silently approve or modify their chosen visibility.
- [ ] Add report/block actions to public entry and collection screens. Preserve guest-to-auth return behavior; expose a support/report contact to signed-out readers. Show pending/rejected status privately to the owner with clear next steps.
- [ ] Implement a restricted operator review queue and hide/restore operations; capture operator actions without dumping private notes or credentials. Assign a real operator and response process before inviting public-content contributors.
- [ ] Enforce global removals in metadata, counts, covers, shared links, and public-media. Personal blocks affect the blocker's app experience and authenticated projections; do not claim public content becomes inaccessible to signed-out readers.
- [ ] Add terms/community-rule acceptance before first public contribution and publish the privacy/support/deletion information. Verify required store disclosures against actual providers, data retention, and any new SDKs.
- [ ] Test a disposable account's deletion through the UI, R2 cleanup, Auth deletion, retry after storage failure, and the external deletion request route. Ensure evidence contains IDs/statuses only, no credentials or private photos.
- [ ] Run complete public/privacy/media regressions and record the moderation operating procedure. Commit and deploy before store distribution.

## Task 8: Topic discovery without merging collections

**Files:** Create an additive migration ending `_explore_topics.sql`, `src/domain/topics.ts`, `src/screens/TopicScreen.tsx`, `tests/backend/topics.test.ts`, and `tests/e2e/topics.spec.ts`. Modify collection models/save operations/editors, PublicCatalog, public repositories/routes, and demo fixtures.

**Interfaces:**

- Operator-managed `public.explore_topics(id, slug, name)` and `public.explore_topic_aliases(normalized_name, topic_id)` are publicly readable only as appropriate for topic selection; only the operator can change the dictionary.
- Collections gain nullable `topic_id` and `topic_assignment` ('automatic' or 'manual'); manual null means Other and is not overwritten by rename.
- `listPublicTopics(page): Promise<{ topics: PublicTopicCard[]; total: number; hasMore: boolean }>`.
- `PublicTopicCard = { id: string; name: string; itemCount: number; collectionCount: number; coverItemId: string | null; coverCollectionId: string | null }`.
- `listTopicEntries(topicId: string | 'other', page): Promise<PublicEntryPage>`; `listTopicCollections(topicId: string | 'other', page): Promise<PublicCollectionPage>`.
- Extend routes with `{ kind: 'topic'; topicId: string | 'other'; view: 'entries' | 'collections' }`. Existing single-owner collection routes remain unchanged.

- [ ] Write alias tests for pin/pins/my pins, logo/logos/my logos, case/spacing/Unicode normalization, and negative matches such as bowling pins, safety pins, generic cards, and unknown names. The stored alias map, not fuzzy logic, is authoritative.
- [ ] Add topic tables/indexes and safe seed aliases; assign existing collections only on exact normalized match. Preserve collection identities/names/ownership/share aliases/R2 keys. Keep unmatched content in Entries and Other.
- [ ] Extend collection saves and the atomic draft RPC to calculate automatic assignment. Add an optional topic correction to collection editing; do not add a required first-upload step. A manual choice survives renaming.
- [ ] Implement server aggregation before pagination using Task 7's eligibility predicate for every count/cover/row. Handle duplicate collection names across users and public/private siblings, with stable IDs/order and bounded queries. Index the new joins.
- [ ] Change Explore to Entries/Topics as proposed. Topic opens public entries from all matching collections; View collections lists the original collections, each still opening its specific shared page. Item View collection always points to its real source.
- [ ] Test more than one page of repeated names, unknown topics, owner correction, private-to-public transitions, moderation removal, moved/deleted items, and a revoked cover. Check query plans on a synthetic larger dataset; do not load the entire public catalog in the client.
- [ ] Run SQL/browser/demo regressions, record migration/backfill results, and commit. Deploy schema/projections before the updated UI.

## Task 9: Themes and appearance persistence

**Files:** Create `src/theme/tokens.ts`, `src/theme/ThemeProvider.tsx`, `src/theme/storage.ts` (native) / `.web.ts`, and `src/components/AppearancePicker.tsx`. Modify `src/components/ui.tsx`, literal-color users, `App.tsx`, `app.json`, package dependencies/lockfile, and appearance tests.

**Interfaces:** `ThemePreference = 'system' | 'classic' | 'fun' | 'dark'`; `ThemeTokens` contains surface, elevatedSurface, text, mutedText, accent, onAccent, border, danger, onDanger, overlay, and focus colors. `useTheme(): { preference: ThemePreference; resolvedTheme: 'classic' | 'fun' | 'dark'; colors: ThemeTokens; setPreference(value: ThemePreference): void }`. `useUiStyles()` builds shared styles from current tokens so static StyleSheet colors cannot remain stale.

- [ ] Define semantic light/fun/dark palettes and test System resolution, persisted choice, invalid stored values, and unavailable storage. Prefer SDK-compatible AsyncStorage for native nonsecret preferences and localStorage on web; do not store appearance in the auth session record.
- [ ] Add the provider, default System, and Appearance selector available to guests and signed-in users. Fun stays bright but keeps photos unaltered and body/form surfaces readable.
- [ ] Replace literal/static colors in all touched screens and controls, including loading/error/disabled states, date pickers, sheets, navigation and login/landing artwork. Use memoized styles by resolved theme rather than mutating a global colors object.
- [ ] Set native appearance to automatic and use compatible system UI/status/navigation-bar support. Verify that native system controls can follow the selected appearance without unreadable system bars.
- [ ] Test reload/restart persistence, live OS-mode changes, large text, keyboard/focus, screen-reader labels, contrast, and reduced motion. Capture phone/tablet views for Classic, Fun, and Dark; no snapshot-only assertion of accessibility.
- [ ] Run typecheck/browser checks and physical-device appearance checks. Commit. Topic/auth/upload logic must remain unchanged by appearance.

## Task 10: Signed builds, final acceptance, and rollout

**Files:** Update `app.json` (or introduce `app.config.ts` if environment variants need it), `eas.json`, launch/deployment docs, store assets, and `.github/workflows/verify.yml` only if verification requires it. Keep credentials in provider tooling.

**Produces:** Reproducible signed test builds and a device acceptance matrix, followed by an explicit release decision.

- [ ] Obtain Expo organization/project ownership, stable Android package/iOS bundle IDs, support contact, and developer-account access. These are required identifiers; never ask for passwords/tokens in chat.
- [ ] Configure explicit EAS preview/production environments with Supabase URL/publishable key, backend enabled, web URL, and CAPTCHA site key. Verify a missing backend config fails a release preflight instead of shipping a disabled login or demo.
- [ ] Build an internal Android APK for early testing, then an AAB for Play internal/closed testing. Build a store-distribution iOS archive for TestFlight; internal ad hoc provisioning is not TestFlight. Confirm current OS/SDK/store requirements at build time rather than assuming today's values remain valid.
- [ ] Verify both signed binaries against the same intended backend. Test install/upgrade, signup/confirmation/recovery, CAPTCHA, background/restart/refresh, upload/image conversion, guest routes, private/public changes, topics, reports/blocks, deletion, themes, and native sharing/back navigation. Include Android phone, iPhone, and an iPad/tablet if those form factors stay enabled.
- [ ] Inspect the generated Android manifest and iOS permission descriptions, using only permissions needed for still-photo selection/camera. Do not let a picker package's optional video/audio features introduce unnecessary store declarations or permissions.
- [ ] Test Safari/Chrome on mobile and desktop plus Firefox/Edge. Exercise slow/offline/expired sessions, invalid formats, quota responses, mixed visibility, and account switching. No private content in caches/logs or another account's view.
- [ ] Prepare icons/splash/screenshots, store privacy/Data safety disclosures, content/age ratings, review access, support/deletion links, and the beta feedback path. Recheck Google personal-account closed-testing eligibility and Apple external TestFlight review requirements for the actual publisher.
- [ ] Confirm cleanup scheduling, provider alerts, admission/upload/read kill switches, backup/restore, and the moderation operator are functioning. Keep anonymous image budgets conservative; document availability tradeoffs if the cap is hit.
- [ ] Deploy backend additions before dependent clients; use compatibility windows for stale web/native clients. Enable stricter Auth only after clients support it. Revert a UI release without dropping migrated data; revoke a faulty hook through the tested operator procedure.
- [ ] Record exact app/build/function/migration versions and test results. Proceed to beta distribution only after the user approves the concrete release candidate and store-facing details. Do not describe a successful export as a successful install or store approval.

## Verification commands and evidence

Use targeted tests while implementing each task; run the full gates at milestones and before a release candidate:

```text
npm run typecheck
npm test
node scripts/check-secrets.mjs --all
npx expo install --check
deno task --config supabase/functions/media/deno.json check
npx expo export --platform all --clear --max-workers 2
npm run test:e2e
```

The export and browser commands must use the fixture environment from `.github/workflows/verify.yml` (including `EXPO_NO_DOTENV=1` and `PLAYWRIGHT_BACKEND_FIXTURE=true`), not local production credentials. Then run the existing backend-disabled demo build/tests separately. Do not execute fixtures against real user records. Changes to provider-side CAPTCHA/hooks require live staging acceptance too; mocks prove UI handling only.

At the end of every stage record: commit/build, migrations/settings changed, observed checks, remaining limitations, and rollback steps. Do not broaden tests repeatedly once the relevant gates pass without a new reason.

## Inputs needed during implementation, not for approving this plan

- Confirm whether the project has the Password Verification Attempt entitlement only if strict account locks are desired; baseline uses the more widely available features.
- Cloudflare Turnstile widget/domain configuration; public site key in build variables, secret entered privately in Supabase.
- Custom SMTP and monitored support/abuse contact if not already configured.
- Expo project and Apple/Google developer access, application identifiers, and physical tester devices.
- A moderation operator and approval of the initial manual-review policy/topic vocabulary.

The user can approve or adjust the proposed security policy, lazy General collection, Entries/Topics naming, and publication review policy in one response. Implementation must wait for that go-ahead; preparing this document is not permission to deploy anything.
