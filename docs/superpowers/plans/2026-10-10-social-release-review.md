# Social release: review findings and implementation handoff

## Start here

The owner requested verification and deployment, then narrowed this review on October 10: finish small fixes, document larger work for a smaller model. **Do not release the current social implementation yet.** The earlier claim that it was fully validated was not supported by browser/device coverage.

- Workspace: `C:\Users\syedz\Desktop\Web Dev\Josh-pin-collection`.
- Continue on `codex/social-review`; social implementation is included through `c2b1366`.
- Original feature checkout: `codex/social-collecting`. Do not overwrite it or discard unrelated changes.
- Local `main` was created from the feature commit while preparing the requested release. It has not been pushed. At the last remote check, only `codex/private-pin-mvp` existed remotely. Confirm the GitHub default and Vercel production branches before eventual release.
- Requirements remain in `2026-10-09-social-collecting-design.md` and `2026-10-09-social-collecting.md`. This document prioritizes the remaining work; unchecked original tasks are not proof of completion.
- No production changes were made by this review. Never print credentials, production account lists, or photo keys. Use synthetic fixtures. Keep `.env.local`, `supabase/.env.local`, local audit output, and build artifacts ignored.
- Read-only live check on October 10: `POST /rest/v1/rpc/get_social_capabilities` returned HTTP 404 using the configured public client credentials. The capability API is not currently available to the client; inspect migration history/schema before rollout. This does not imply existing auth/media services are offline.

## Small corrections already prepared

Migration `202610090006_social_review_fixes.sql` corrects:

1. Cursor parsers called nonexistent PostgreSQL `jsonb_object_length`. They now validate shape/types using supported functions, including null and infinite timestamp rejection.
2. All five paginated social RPCs used the 25th lookahead row as an exclusive boundary, losing an entry on every page. They now use the last returned (24th) row.
3. A user blocked by a publisher could still like that publisher's public entries. Likes now check both block directions and coordinate pair locks with follows/blocks before locking the item. Public reading remains personal-block behavior; blocking does not remove content globally.
4. A restricted `pin_media` database role receives execute permission for authenticated member-image lookup if that role exists. Clients still receive no private-schema access.
5. Expiring social counters get a private cleanup function, called by the maintenance script. Actual scheduled execution must still be verified during deployment.

`tests/backend/social-pagination.test.ts` covers all feed and people/search pages, tied timestamps, malformed cursors, and blocked-user likes. The original failures were reproduced before applying the correction. Preserve this forward migration; do not rewrite already deployed migrations.

## Order of remaining implementation

### 1. Finish database security and rollout controls — release blocker

Files: `supabase/migrations/202610090001_social_profiles.sql` through `005` for reference; add a new forward migration after `006`. Extend `tests/backend/social-profiles.test.ts`, `social-upgrade.test.ts`, and integration coverage.

Confirmed with synthetic database fixtures:

- `complete_profile_intro` accepts repeated username changes after onboarding and never consumes the rename quota. Seven consecutive changes were accepted with zero rename-counter rows.
- `update_username` still changes a handle with `social_writes_enabled=false`.
- Email-prefix allocation bypasses the prohibited-term filter; a prohibited local part becomes a public username.
- With all social flags disabled, existing public entry/collection projections still publish backfilled usernames, although `get_collector` returns null.

Implementation:

- Serialize intro completion on the profile row. First completion may set the initial username; repeating the same completed intro is idempotent. Subsequent different names must use the same bounded rename path as settings (or return a safe error).
- Respect the write-pause flag for username mutations. Preserve read/login access and a workable onboarding experience while writes are paused. Keeping an unchanged generated name can remain idempotent; do not trap people in an unclosable setup sheet.
- Validate generated bases using the server's text rules. Fall back to collision-safe `collector` handles instead of failing signup. Repair already generated prohibited handles without exposing their email or breaking stable publisher IDs.
- Gate public username projections on `profiles_enabled` everywhere: legacy entries, collections, topics, shared collections, and new social projections. Keep legacy non-social fields compatible. Capability flags never replace per-request authorization.
- Add tests for repeated intro, exhausted quota through both endpoints, paused writes, profanity fallback/collisions, disabled-profile projections, and private-table/RPC grants. Retain unique-handle race handling.

Acceptance: no mutation bypass, no username publication before profiles are enabled, and disabled social features do not break existing sign-in/library/Explore.

### 2. Fix restricted-content lifecycle and navigation — release blocker

Files: `App.tsx`, `src/social/SharedEntryImage.web.tsx`, `.native.tsx`, `SharedEntryDetail.tsx`, `SharedEntryScreen.tsx`, `FollowingScreen.tsx`, `CollectorProfileScreen.tsx`, `VisibleCollectionScreen.tsx`; add `useSharedFeed.ts` or another focused shared loader.

Source review found:

- Direct social routes mount a provider without a session key. Switching account/guest state can preserve loaded friends-only metadata and images.
- Shared routes take precedence over password recovery; auth callback handling clears the URL but not all route state.
- Image loading depends on an inline `onUnavailable` callback, so ordinary detail renders can restart requests. Missing native tokens leave a spinner; native image identity excludes the viewer.
- Load-more results are not protected against a later refresh/account/relationship change. Collection pages do not subscribe to invalidation or paginate. Failed profile/collection reloads can leave stale data.
- New restricted details do not periodically revalidate authorization or recheck on foreground/focus.

Implementation:

- Key/unmount all social providers, screens, open previews, and like state by session identity. Clear restricted state synchronously on logout/switch before any new fetch completes. Prioritize recovery/auth callbacks and clear obsolete destinations. Wire the existing pending-destination helper into sign-in, storing only an internal route ID.
- Keep callback identity out of image effect dependencies using a ref/stable callback. Cancel requests; revoke Blob URLs; handle 401/403/404 and absent tokens with a clear unavailable state. Use viewer-scoped native image identity and no disk cache. Never place JWTs in URLs.
- Use request generations and an in-flight guard for refresh and pagination; discard stale success and error responses. Deduplicate IDs. Handle unavailable collections and failures explicitly.
- Revalidate open restricted details on focus/foreground and at a bounded interval (planned 30 seconds). Remove denied metadata/photos and discard responses from before a permission change. Already delivered/downloaded bytes cannot be remotely revoked; explain this accurately.
- Render nested collection/profile routes through one coherent screen/modal stack, not two competing flex screens. Preserve Back and Close on web and native.

Acceptance tests: delayed image/page resolves after logout; account B never sees account A's friend content; unfollow/block/private/review transitions revoke metadata and both image sizes; foreground refresh works; image errors do not loop; full-size photos fit rather than crop. Test actual native headers on devices.

### 3. Restore moderation on every shared surface — release blocker

Files: `src/components/PublicSafetyControls.tsx`, all new shared screens, `src/social/repository.ts`, existing public moderation RPC tests.

- New `SharedEntryDetail` and viewer-aware collection screens omit report/block controls.
- Existing block-by-collection resolves public content; it cannot be assumed to work for a collection containing only friends-visible entries. Use authenticated `blockCollector(publisherId)` on signed-in social screens; retain local guest blocks for public browsing.
- Reuse signed-in report controls for both public and friends-visible entries/collections. The server must verify access, never trust the UI. Preserve five distinct authorized signed-in reporters per target/review cycle. Report submission alone must not remove content globally.
- A block removes both follow directions and hides content only for the blocker; neither side can follow/like while blocked. Other viewers retain normal public access. Immediately invalidate open feeds/details after blocking.
- Update messages to say shared content where Friends-only content is included.

Acceptance: report/block entry and collection from Explore, Following, profile, direct link, and friends-only collection. Guests cannot report; one reporter cannot force review; five distinct authorized reporters can; self/hidden content cannot be reported.

### 4. Complete social browsing and synchronized likes — functional blocker

Files: `PublicCatalog.tsx`, `LibraryScreen.tsx`, `src/social/PeopleScreen.tsx`, `SharedEntryCard.tsx`, `FollowButton.tsx`, `LikeButton.tsx`, the shared feed/detail components, `src/data/demo.ts`.

- Add Following to the Explore navigation. Make usernames open profiles without opening the photo. Every real collector entry gets the appropriate follow action; grouped multi-collector topics do not.
- Add bounded pagination to people/search and visible collections. Currently those screens show only the first page. Correct the Following filter's selected styling.
- Separate like events from relationship/access invalidation: liking currently causes Following to clear its feed and close its selected detail.
- Use one like state store per viewer/item shared by cards and sheets, with duplicate-request suppression, rollback, nonnegative counts, and authoritative state refresh after success. Do not simply increment a guessed count and reset the whole gallery.
- Show own-entry counts without self-like/follow buttons. Guest social actions should open sign-in with a return destination, not issue authenticated requests or display an unusable control. Respect server pause flags while allowing removal actions supported by the server.
- Fix nested profile-to-collection layout, error/empty/loading states, and username links currently wired to no-op callbacks.
- Either add the planned synthetic social demo or clearly retain a limited isolated demo; do not represent its disabled social methods as tested feature coverage.

Acceptance: follow-back warns about mutual access; Find people/profile navigation works; 51-item feeds/people lists traverse completely; liking a detail keeps it open and updates its card; stale requests cannot overwrite state after filtering or changing accounts.

### 5. Dependency/security triage and public documentation

The October 10 `npm audit` reported **25 affected package entries: 1 critical, 16 high, 8 moderate**. These include parent packages inheriting a transitive advisory, not 25 independently demonstrated production exploits. Raw output is ignored at `test-results/review-audit.json`.

- Critical: `shell-quote`, advisory `GHSA-pqg4-j6r4-53mv`.
- High leaf findings include `braces` (`GHSA-vfj7-8cjw-p6xm`) and `node-forge` (`GHSA-86w9-cpqp-85rv`). Inspect exact installed/locked versions and reachable usage; several paths are Expo/Metro/build tooling.
- The lockfile currently contains `shell-quote@1.10.0`, `braces@3.0.3`, and `node-forge@1.4.0`. The installed root checkout has older Expo patches than the feature lockfile; synchronize with `npm ci` before release builds. The offline Expo compatibility check passed against the installed map, but explicitly warned that validation was unreliable offline. Treat online compatibility validation as outstanding.
- Re-run the audit. Prefer supported Expo-compatible patches and justified targeted overrides with validation. **Do not run `npm audit fix --force`**: its suggested resolutions include Expo 44 / React Native 0.72 downgrades, incompatible with this SDK 57 project.
- Update privacy/help copy for public usernames, likes, follow relationships, mutual Friends-only access, blocking, retention/deletion, and revocation limits. Current policy text still describes the older public/private app.
- Verify maintenance scheduling and database-role grants against the actual deployed role, without exposing its connection string. Do not infer deployment status from source files.

### 6. Acceptance before release

Run locally and capture final exit codes (retain long-running process session IDs):

1. `npm ci`, `npm run typecheck`, `npm test`, `node scripts/check-secrets.mjs --all`, `npx expo install --check`, `npx --no-install expo-doctor`.
2. Add meaningful social Playwright cases. Use the synthetic environment from `.github/workflows/verify.yml`, export all platforms, and run the complete browser suite with no unintentional fixture skips. Existing `public-safety.spec.ts` still expects guest reporting and must be updated to the signed-in-only policy; preserve guest blocking tests.
3. Run the configured Deno Edge Function checks including `member-media`. Deno was not found on PATH in this review; use an approved local runtime or CI, and record the actual result.
4. Test owner/mutual/one-way/stranger/blocked/guest/admin access across metadata, counts, public-media and member-media. Prove private table access remains denied. Test full/thumb, valid/revoked/missing JWTs, CORS, request quotas, and account deletion.
5. Run real Postgres concurrency checks for handle claims, follow-vs-block, like-vs-block/unfollow and deletion. PGlite's single-process tests do not prove concurrent transaction behavior.
6. Android and iOS preview builds on actual devices: auth/recovery, onboarding once, follow-back, friends image headers, revocation, likes, share links, report/block, foreground refresh, keyboard/back, and light/fun/dark contrast. An export compiling is not a device runtime test.

### 7. Backend-first release after fixes pass

- Recheck the owner's latest deployment instructions and working tree. Inspect live migration history; apply only missing forward migrations. Never reset production.
- Keep profile/social/friends/like flags off until their release prerequisites pass. Deploy `member-media` with existing server-only credentials before enabling Friends sharing. Validate exact origin allowlist and real database role execution.
- Verify migrations and anonymous denial checks, then synthetic authenticated end-to-end reads/uploads. Clean up only those synthetic fixtures.
- Push the reviewed commit to the requested `main` branch. Verify GitHub's default branch and Vercel's production branch; pushing a new `main` alone may not update the deployed site.
- Enable profiles/public Following, then friends sharing after authenticated-media checks, then likes. Check the live site. Record commit, migration/function versions, flag state, and actual device evidence.
- Rollback pauses social writes/friends sharing and fails closed. Preserve friends rows and owner access; never downgrade Friends-only entries to public.

## Review evidence

- Original implementation's full Node suite: 161 passed, 0 failed. This missed the newly reproduced bugs; a green baseline alone did not prove readiness.
- Focused regression runs reproduced the missing cursor function and blocked-user like bypass before their corrections. All six new regression cases now pass, including 51-entry and 51-person pagination.
- Final complete Node suite: **167 passed, 0 failed, 0 skipped**, exit code 0, October 10. TypeScript check passed, exit code 0. Tracked-file and review-file secret scans passed; local credential and audit files remain ignored.
- Browser/native runtime, clean-lockfile release builds, online Expo validation, real Postgres concurrency, and production social rollout remain unverified in this review. The passing tests do not remove the documented blockers.

Keep fixes in small commits by numbered task. Run the tests that exercise each change before broad release checks. Avoid unrelated redesigns, comments, messaging, or new dependencies for social features.
