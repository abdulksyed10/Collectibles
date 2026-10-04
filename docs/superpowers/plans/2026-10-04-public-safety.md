# Public safety and privacy implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` after the user's go-ahead. Implement sequentially, with additive migrations and evidence after each batch.

**Goal:** Preserve guest Explore while adding public-content review, reporting, publisher blocking, support and deletion information needed for store distribution.

**Architecture:** Item visibility remains the owner's choice; a separate server-controlled publication state governs whether public content is approved. Existing public projections and the media proxy share that rule. Keep reviewer tools server/operator-only and expose no Auth identity details to visitors.

**Tech stack:** Existing Expo UI, Supabase Postgres/RLS/RPCs and Edge Functions, private R2, trusted operator scripts, Node/PGlite/Postgres tests and Playwright.

**Spec:** `docs/STORE-READINESS-2026-10-04.md`, F4–F5 and F9. Human pre-publication review is a proposed product decision; confirm it with the user's implementation go-ahead. If there is no person available to review, do not claim this release can operate the public-content feature safely.

## Global constraints

- Item visibility is independent; new items are private. Collection/category membership never grants public access.
- Preserve existing accounts, item IDs, R2 keys and legacy sharing links. Add forward migrations; never reset production.
- Guest Explore stays available; no categories in Explore.
- Private notes, acquired dates, categories, email addresses, Auth UUIDs, storage keys and signed URLs never become public metadata.
- Moderation sees content submitted for publication; private entries are not added to a public-review queue.
- No comments, DMs, recommendation algorithm, ads or third-party content-scanning subscription in this scope.

## Review focus

1. An approved entry is edited, moved or given its first photo: old approval cannot publish new unreviewed content (B1).
2. A hidden entry was used as a topic cover: neither counts nor photo proxy reveal it (B1).
3. A signed-out visitor blocks a publisher, restarts and opens a share link: the preference still applies to the UI (B2).
4. A report contains another account's IDs, giant text or duplicate submissions: no impersonation, unbounded writes or private-content oracle (B2).
5. A deleted account has a late upload or provider failure: cleanup works without restoring public data or overstating deletion (B4).

## B1 — Publication state and operator review

**Create:** next migrations `*_public_moderation.sql`; `supabase/scripts/review-public-content.ts`; `docs/MODERATION.md`; `tests/backend/moderation.test.ts`. **Modify:** `src/domain/models.ts`, `src/data/repository.ts`, `src/data/demo.ts`, `src/screens/Editors.tsx`, `src/screens/LibraryScreen.tsx`, `supabase/functions/public-media/lookup.ts`, public SQL RPCs by new migration.

**Data contract:** Server-only `private.item_publication(item_id, revision, status, approved_revision, reviewed_at)` where status is `pending | approved | rejected | removed`; `private.publisher_restrictions(owner_id, publishing_suspended)`; append-only bounded moderation audit. Owners can obtain their own status/reason through a redacted owner RPC, not update approval columns.

**Predicate:** An item is publicly eligible only when `visibility='public'`, publication status is approved for its current public revision, owner is not deleting, and publishing is not suspended. Authenticated-viewer blocking is applied on top of this for metadata. Use fixed `search_path`, qualified names and explicit grants on security-definer functions.

- [ ] Add migration tests that ordinary owners and anon cannot approve, remove restrictions, read private review notes or forge a publisher. Existing accounts/data/media survive upgrading from the current migrations.
- [ ] Start public entries as pending; do not change their visibility or delete them. Private entries need no review. Public revision increments on title, collection membership/name or photo changes that affect published content; private notes/date edits do not invalidate approval. Review both full and thumbnail bytes, not just a thumbnail. A collection rename invalidates affected entries because its name is public.
- [ ] Require version-matching approve/reject actions under locks. An edit during review returns a conflict requiring a refresh. Photo upload invalidation must occur transactionally when `item_images` commits; an approved photo-less entry cannot silently gain unreviewed bytes.
- [ ] Apply the predicate to `list_public_entries`, `list_public_collections`, `list_public_topics`, `get_public_topic`, `get_shared_collection`, legacy-link resolution and `public-media` lookup. All totals, covers and pagination use the filtered set. Keep owner signed-image reads available for their own pending entries.
- [ ] Test each projection plus a direct image GET before/after rejection/removal/public-to-private/account deletion. Test stale URLs, topic covers and mixed visibility. Public proxy must check current state per request and keep no-store headers.
- [ ] Add a narrow trusted operator script: list pending IDs/revisions, view submitted public fields/photos securely, approve/reject/remove exact revision with reason, suspend publishing, resolve reports. Credentials are read from ignored/server environment only. Never ship this capability or its keys in the app. Avoid stdout logs containing private URLs or user profiles.
- [ ] Owner UI shows Private, Pending review, Public, or Not published with a concise reason and support link. Viewers see only eligible content. Confirm normal private uploads still work without public review.
- [ ] Write the human process: inspect image and text, prohibited content rules, response/escalation contact, daily queue check, appeals, and removal tests. Migrate/deploy server gating before new public UI; one-time review existing public content before reopening it. Rolling back UI must not bypass moderation.

## B2 — Reports and publisher blocking

**Create:** next migration `*_public_reports_blocks.sql`; `supabase/functions/public-safety/` with separately testable HTTP/service modules; `src/components/PublicItemActions.tsx`; `src/data/publicSafety.ts`; `tests/backend/public-safety.test.ts`; `tests/e2e/public-safety.spec.ts`. **Modify:** `PublicCatalog.tsx`, `PublicTopicScreen.tsx`, `SharedCollectionScreen.tsx`, settings and demo repository.

**Interfaces:** `reportPublicContent({itemId,reason,details,captchaToken?}): Promise<void>`; `blockPublisher(publisherId): Promise<void>`; `unblockPublisher(publisherId): Promise<void>`; `listBlockedPublishers(): Promise<{publisherId:string}[]>`.

**Data:** Random public publisher ID mapped privately to Auth user; it is a grouping identifier, not email or Auth UUID. Public cards/shared entries include this opaque ID. Reports are private; authenticated reporter ID comes from verified session. `private.publisher_blocks(viewer_id,publisher_id)` unique pair; owner-scoped RPC access only.

- [ ] Add Report item / Report publisher and Block publisher to every item-detail surface and shared collection menu. Topic groups may contain several publishers: block only the chosen publisher, never the whole topic. Add an Unblock list in settings.
- [ ] Enforce authenticated blocks in public metadata RPCs, counts and covers; signed-out guests keep a local block preference (localStorage on web, existing safe native storage). Filter all guest detail/share views consistently and state that guest preferences apply on this device. Blocking is a viewing preference, not a promise that public URLs become confidential.
- [ ] Guests can report without creating an account through `public-safety`, protected by server-verified Turnstile and request limits; signed-in reports use verified sessions. Neither route trusts a submitted reporter/owner ID. Server maps the item/publisher, gives the same acknowledgement for inaccessible/deleted targets, and never returns private metadata.
- [ ] Bound report details to 1,000 characters, body to 8 KiB, allowed reasons to a small enum. Start with 5 reports/source/hour, 20/source/day and 200/app/day, deduplicate same target/reason/source within a day, use transactional counters. For guests, use trusted ingress IP metadata and a server-keyed digest with short retention; do not trust arbitrary X-Forwarded-For. If trustworthy ingress IP is unavailable, use the global cap plus CAPTCHA and document the limitation.
- [ ] Test limits under concurrency, foreign reporter spoofing, oversized inputs, duplicate reports, no private item oracle, signed-in cross-device blocks, guest persistence, and block removal restoring eligible cards. Do not log report free text/tokens in ordinary diagnostics.
- [ ] Report queue is visible only to the operator workflow; actioning a report updates B1's server publication state. Publish monitored contact information even when reporting is temporarily unavailable. Clearly document response expectations the operator can actually meet.

## B3 — Terms acceptance, privacy, support and external deletion

**Create:** `public/privacy/index.html`, `public/terms/index.html`, `public/community/index.html`, `public/support/index.html`, `public/delete-account/index.html`; next migration `*_policy_acceptance.sql`; `src/screens/PolicyAcceptanceScreen.tsx`; `tests/backend/policy-acceptance.test.ts`; browser route tests. **Modify:** app/auth/settings routes, metadata insert RPC/triggers and media upload boundary, hosting/preview static routing as necessary.

**Interface:** `acceptPolicy(version:string): Promise<void>` records current user ID server-side and current policy version/time. `getPolicyAcceptance(): Promise<{requiredVersion:string;acceptedVersion:string|null}>`.

- [ ] Draft actual app-specific documents using publisher identity/support contact. Explain Supabase Auth/database, Cloudflare private image storage/Turnstile, Vercel web hosting/optional analytics, chosen email service, public sharing, deletion/retention and user rights. Do not publish placeholders or claim end-to-end encryption, no data collection, or permanent erase from others' copies.
- [ ] Require affirmative current community/terms acceptance before first content contribution, including users arriving by OAuth. Link privacy information separately; do not label all privacy processing as optional marketing consent. Existing users may read/delete without accepting new terms; content writes require acceptance. Enforce server-side on all metadata write routes and uploads, not just a checkbox.
- [ ] Keep all five pages publicly reachable at stable HTTPS URLs, direct load and refresh included. Link them from authentication and Settings. On the delete page provide a prominent browser sign-in/delete path and a monitored account-deletion request contact with identity verification for people unable to log in. Do not require reinstalling the app or publish a contact nobody monitors.
- [ ] Verify the existing deletion flow and Plan A provider revocation work together. Explain what is removed, any limited security records kept, and expected processing time. Add a support procedure for outstanding provider/storage failures.
- [ ] Test fresh email/Google/Apple accounts, preexisting accounts, outdated policy version, direct RPC write bypass, denied private-page access, and anonymous access to all public pages. Test deletion/support while policy acceptance is pending.

## B4 — Scheduled cleanup, cost controls and retention evidence

**Modify:** `supabase/scripts/cleanup-media.ts`, backend runbooks, cleanup tests. **Create:** `docs/OPERATIONS.md`, a trusted scheduled workflow/job definition, `scripts/check-release-services.ts` that emits safe booleans/counts only.

- [ ] Schedule the media sweep daily and signup-event purge daily with server-only credentials. Choose a runner the publisher owns; if GitHub Actions is used, protect its environment/secrets and pin actions. Retries must be bounded and failures sent only to a publisher-authorized alert channel. Record actual job run evidence, not just YAML existence.
- [ ] Document retention for reports, moderation records, deletion retries, logs and backups; propose report resolution purge after 30 days for beta unless a concrete security/legal reason requires longer. Signup digest purge already targets two days; test it. Avoid claiming digests are anonymous.
- [ ] Do not delete media tombstones or reset lifetime byte reservations merely to make counters look clean. They prevent late-write/reused-ID bugs. Separate object removal from retention of minimal deletion guards; pseudonymize/unlink where safe and describe remaining records accurately. Restore drills must replay deletion/removal state so restoring backups does not republish removed content.
- [ ] Verify private bucket access and bucket-only R2 permissions; test current owner access, anonymous denial, cross-account isolation, real cleanup/deletion and public revocation on disposable accounts. Retain limits of 100 photos/account, 20 uploads/hour/account, 50/day/account, 200/day/app, 250 MiB/account and 1 GiB/app lifetime reservations, and 10,000 public reads/day until measured usage supports a change.
- [ ] Configure provider usage alerts and test emergency switches. Record that CORS and Vercel firewall alone do not protect the direct Supabase API and application quotas are not universal spend caps. Inspect public query plans and indexes with realistic fixtures; avoid unbounded global aggregation or expensive full-count scans becoming an abuse path.
- [ ] Establish redacted diagnostic codes/counts, crash reporting decision, account MFA/recovery, backup/export coverage and a restore rehearsal. If no external crash SDK is chosen, use store crash reports plus sanitized server metrics for beta; do not add a new processor silently.

## Completion gate

Public entries cannot bypass approval/removal by legacy links, topic covers or direct image requests. Report/block works as a guest and member; the human process is operating. Policies/support/deletion pages are live and accurate. All new SQL has role/concurrency tests. Update `docs/IMPLEMENTATION-PROGRESS.md` and the current readiness report with evidence before Plan C release acceptance.
