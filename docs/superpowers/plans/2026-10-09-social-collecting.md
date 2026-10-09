# Social Collecting Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task in the chosen smaller-model session. Steps use checkbox syntax for tracking. Do not delegate or deploy merely because a plan exists; preserve the user's current implementation/deployment instructions.

**Goal:** Add usernames, following, a chronological Following feed, mutual-friend item sharing, relationship management, and item likes across web, Android, and iOS.

**Architecture:** Extend the existing Supabase functions and private database schema, reusing stable IDs in `private.public_publishers`. Preserve owner-only table access and public-only Explore; serve friends' metadata through authorized projections and their images through an authenticated Edge Function. Use the existing repository/demo pattern and shared mobile-first React Native components.

**Tech stack:** Existing Expo/React Native, TypeScript, Supabase Auth/Postgres/Edge Functions, private R2, PGlite/Node tests, and Playwright. No new production dependency is needed for the core feature.

**Spec:** `docs/superpowers/specs/2026-10-09-social-collecting-design.md` (read first).

**Status:** Planning handoff, not an instruction to implement in the planning turn. Mutual follows was explicitly selected by the owner. Remaining defaults are proposed for review. Source inspected at `d1a98a2`; recheck current files and migration ordering before execution.

## Global constraints

- Friends means reciprocal follows; a one-way follow never grants Friends-only access.
- New items default to Private. Visibility belongs to each item, never to its collection/category.
- Never expose full email addresses, Auth user IDs, notes, acquired dates, storage keys, or secret credentials in shared responses.
- Five distinct signed-in, authorized reporters per item/collection and review cycle trigger review; preserve existing moderation and upload/storage budgets.
- Existing Explore, topic grouping, old collection links, owner workflows, account deletion, auth/recovery, and demo mode keep working.
- No new public R2 access. Anonymous public-media must never return Friends-only bytes, including thumbnails.
- Current plain UI, all themes, mobile-first sizing, keyboard/screen-reader access, and web/Android/iOS behavior are required.
- No comments, contact imports, notifications, custom profile-picture uploads, recommendations, or direct messages in this release.
- Only plan documents were created by the planning turn. Do not treat any planned feature as already implemented.
- Use synthetic test emails only. Never print `.env.local`, tokens, production account lists, or production content during verification.

## Review focus

1. A stale/native/old web client must not expose restricted images or notes when it receives a new audience value (Tasks 4, 5, 8).
2. Follow/block races and in-flight gallery requests must not restore access after the relationship changes (Tasks 3, 5, 6, 8).
3. Null/relay/non-ASCII emails and simultaneous username claims must not prevent login/signup or expose email (Tasks 1, 2, 8).
4. A mixed-audience collection must not leak a hidden item's existence through its count, cover, topic, like count, or direct link (Tasks 4, 7, 8).
5. Switching accounts, browser history, OAuth/recovery redirects, and first-login settings must preserve correct navigation without carrying friend content into the next session (Tasks 2, 6, 8).

## Existing code anchors

| Area | Existing files / behavior |
| --- | --- |
| Contracts and validation | `src/domain/models.ts`, `src/domain/validation.ts`; visibility is currently private/public |
| Data | `src/data/repository.ts`, `demo.ts`, `RepositoryProvider.tsx`, `useLibrary.ts` |
| Navigation and settings | `App.tsx`, `src/screens/LibraryScreen.tsx`; settings currently lives in a Sheet |
| Feeds and detail | `PublicCatalog.tsx`, `PublicTopicScreen.tsx`, `SharedCollectionScreen.tsx`, `Editors.tsx` |
| Safety | `src/components/PublicSafetyControls.tsx`, `ContributionPolicy.tsx`, `src/lib/publisherPreferences.ts` |
| Media | `supabase/functions/media/`, `public-media/`, `src/lib/sharing.ts` |
| Public identity | `202610040002_publication_review.sql` creates private public-ID mapping |
| Latest moderation | `202610050001_report_threshold_review.sql`: visible-public view, five reports, text rules, admin queue |
| Database tests | `tests/backend/hierarchy-fixture.ts`, `migrations.ts`; the fixture currently stubs auth.users with only id |
| Verification/deployment | `.github/workflows/verify.yml`, `supabase/config.toml`, `scripts/verify-schema.sql`, `docs/DEPLOYMENT-CHECKPOINT.md` |

Do not append the entire social implementation to the already large repository/screens. Put the new behavior in focused `src/social/` modules and compose it into the existing repository. Add forward migrations; never rewrite migrations already applied in production.

## Contracts to implement

Create `src/social/types.ts`. Export the following contracts; page cursors are opaque JSON strings created/validated by the repository, never raw SQL.

```ts
type Relationship = {
  isFollowing: boolean; isFollower: boolean; isFriend: boolean;
  blockedByMe: boolean; interactionAllowed: boolean;
};
type CollectorIdentity = { publisherId: string; username: string | null };
type OwnSocialProfile = CollectorIdentity & { introCompletedAt: string | null };
type CollectorProfile = CollectorIdentity & { relationship: Relationship };
type LikeState = { count: number; likedByMe: boolean };
type SharedEntry = PublicEntryCard & {
  publisherId: string; creator: CollectorIdentity; createdAt: string;
  audience: 'public' | 'friends'; relationship: Relationship; likes: LikeState;
};
type CursorPage<T> = { items: T[]; nextCursor: string | null };
type PeopleList = 'following' | 'followers' | 'friends' | 'blocked';
type VisibleCollection = {
  collection: { id: string; name: string; creator: CollectorIdentity };
  entries: CursorPage<SharedEntry>; visibleItemCount: number;
};
type SocialCapabilities = {
  profilesEnabled: boolean; socialWritesEnabled: boolean;
  friendsSharingEnabled: boolean; likesEnabled: boolean;
};
```

Create `SocialRepository` with these methods and have `CollectionRepository` extend it. Imports should be type-only to avoid runtime cycles. A separate `src/social/repository.ts` exports its live implementation; spread that into the existing repository and provide the same methods in the demo repository. Profile/search APIs never accept a viewer ID.

```ts
getSocialCapabilities(): Promise<SocialCapabilities>;
ensureSocialProfile(): Promise<OwnSocialProfile>;
completeProfileIntro(username: string): Promise<OwnSocialProfile>;
updateUsername(username: string): Promise<OwnSocialProfile>;
getCollector(publisherId: string): Promise<CollectorProfile | null>;
searchCollectors(query: string, cursor?: string): Promise<CursorPage<CollectorProfile>>;
listPeople(kind: PeopleList, cursor?: string): Promise<CursorPage<CollectorProfile>>;
setFollowing(publisherId: string, following: boolean): Promise<Relationship>;
removeFollower(publisherId: string): Promise<Relationship>;
blockCollector(publisherId: string): Promise<void>;
listFollowingEntries(cursor?: string, friendsOnly?: boolean): Promise<CursorPage<SharedEntry>>;
listCollectorEntries(publisherId: string, cursor?: string): Promise<CursorPage<SharedEntry>>;
readVisibleCollection(collectionId: string, cursor?: string): Promise<VisibleCollection | null>;
readSharedEntry(itemId: string): Promise<SharedEntry | null>;
setItemLiked(itemId: string, liked: boolean): Promise<void>;
getEntrySocialState(itemIds: string[]): Promise<Record<string, LikeState>>;
```

Keep public APIs callable by guests only where necessary (`getCollector`, public-only projections of collector entries/collection/entry, authorized-like-count reads). Mutations, people lists/search, and Following require a real signed-in user. Existing public feed RPCs get additive creator/createdAt/audience/relationship/likes fields matching SharedEntry; maintain all existing fields and page-number inputs for older clients. Profiles not initialized yet have username null and a neutral label.

SQL RPC mapping: `ensure_social_profile()`, `complete_profile_intro(p_username text)`, `update_username(p_username text)`, `get_collector(p_publisher_id uuid)`, `search_collectors(p_query text,p_cursor jsonb default null)`, `list_people(p_kind text,p_cursor jsonb default null)`, `set_following(p_publisher_id uuid,p_following boolean)`, `remove_follower(p_publisher_id uuid)`, `block_collector(p_publisher_id uuid)`, `list_following_entries(p_cursor jsonb default null,p_friends_only boolean default false)`, `list_collector_entries(p_publisher_id uuid,p_cursor jsonb default null)`, `get_visible_collection(p_collection_id uuid,p_cursor jsonb default null)`, `get_shared_entry(p_item_id uuid)`, `set_item_liked(p_item_id uuid,p_liked boolean)`, `get_entry_social_state(p_item_ids uuid[])`. JSON output follows the TypeScript fields above. `set_item_liked` returns a generic success flag; refresh authorized state separately after optimistic mutation.

`getSocialCapabilities()` maps to guest-safe `get_social_capabilities()` and returns only the four boolean flags. If the RPC is unavailable during a staged deployment, return all false and preserve existing app behavior. Capability flags describe availability, not authorization; every server operation must enforce its own corresponding flag.

Feed cursors contain `{createdAt,id}` and order descending by `(created_at,id)`; people/search cursors contain `{username,publisherId}` and order ascending by that pair. Fetch 25 rows, return 24 and a next cursor only when another row exists. Validate types/lengths/UUIDs/timestamps; reject malformed cursors with a safe error. New uploads appear on refresh. No exact total-count query is required on Following. Do not reuse the current 20-page validation cap for the new cursor feeds.

## Task 1 — Profile storage and collision-safe usernames

**Files:** Create migration `supabase/migrations/202610090001_social_profiles.sql`, `src/social/usernames.ts`, `tests/social-usernames.test.ts`, `tests/backend/social-profiles.test.ts`, `tests/backend/social-upgrade.test.ts`. Modify `tests/backend/hierarchy-fixture.ts` and other auth fixture declarations found by search.

**Consumes:** public publisher mapping and current text moderation. **Produces:** profile RPCs, validated handle rules, private profile storage, additive public identity projections.

- [x] Write failing tests for normalization (`Alex@example.test` -> `alex`), collisions, case-insensitive manual uniqueness, invalid/reserved/prohibited names, 3/30 length bounds, numeric prefixes, absent/relay/non-ASCII emails, and all profile mutations by a different caller. Fixtures use `email`, `created_at`, and realistic null values without depending on other Auth internals.
- [x] Run `npx tsx --test tests/social-usernames.test.ts tests/backend/social-profiles.test.ts tests/backend/social-upgrade.test.ts`; established meaningful missing-function/module failures before the implementation.
- [x] Add `private.collector_profiles(owner_id PK FK auth.users ON DELETE CASCADE, username text UNIQUE NOT NULL, intro_completed_at timestamptz, created_at, updated_at)` and the private suffix sequence. Constrain lowercase syntax in SQL. Do not add a publicly readable owner/email profile table.
- [x] Implement private safe-base generation and allocation. First try the base; after a uniqueness collision, append a numeric suffix, truncate the base to fit 30 characters, and retry under the unique constraint. Make simultaneous initialization of the same owner return its existing profile. Do not rely on JavaScript availability checks or user-editable Auth metadata. Use the specified fallback for unsafe/absent/Apple relay values.
- [x] Backfill existing users in stable created_at/id order with the same allocator and pending intro marker. Do not log source emails. `ensure_social_profile()` lazily initializes future users, using the authenticated ID/email from the server. No new Auth signup trigger.
- [x] Create private singleton `social_config` with the four capability flags initially false and the numeric defaults from the spec, plus `social_action_counters(actor_id, action, bucket_start, count, expires_at)` with a compound primary key. Implement safe `get_social_capabilities()`. Only operators may edit config. Initialize profiles during backfill independently of flags; runtime profile init/edit/completion requires profilesEnabled. Later tasks reuse this configuration/counter storage.
- [x] Implement update/completion RPCs using row locks, fixed search_path, qualified names, explicit grants, and safe conflict codes. Completion with the unchanged name is idempotent. A manual rename is limited to five successful changes per UTC day; Keep/completion does not consume a rename quota. Same-account concurrent requests cannot bypass the quota.
- [x] Upgrade-test from the last old migration with existing private/public content and publisher IDs. Assert every existing account gets one handle, IDs/content stay intact, and emails/owner IDs never appear in any public JSON. Test lazy init with only an ID, matching older fixtures.
- [x] Run focused tests, `npm run typecheck`, the secret scan, and `npm test` (135 passing tests); commit only this task's files once green.

## Task 2 — One-time profile editor and stable profile navigation

**Files:** Create `src/social/types.ts`, `repository.ts`, `demo.ts`, `events.ts`, `ProfileSettings.tsx`, `links.ts`, `tests/social-links.test.ts`, `tests/e2e/social-profile.spec.ts`. Modify `src/domain/models.ts`, `src/data/repository.ts`, `demo.ts`, `App.tsx`, `src/screens/LibraryScreen.tsx`. Stage unimplemented later repository methods with clear capability-disabled errors in this task only; replace them before enabling social UI.

**Consumes:** Task 1 RPCs. **Produces:** SocialRepository composition, settings/profile routing, persisted first-session onboarding, a session-scoped social invalidation event.

- [x] Add tests for first sign-in showing the profile editor; Keep, save, rename collision, close/back, failure/retry; a second login and another device not reopening it; account switching not reusing another profile. Recovery must finish before onboarding. A profile load failure leaves collection browsing usable and provides retry.
- [x] Implement session initialization once per authenticated user. Reopen the introduction only while the server completion timestamp is null. Demo uses synthetic handles and never calls Supabase. A disabled social rollout skips this initialization until the backend is ready.
- [x] Move the new profile editor into its own module and link it from existing settings. Show “Your username is public. Keep this username or choose another.” Save/Keep complete onboarding; later settings edits only rename. Gate all completion UI on the server result; no localStorage-only marker.
- [x] Add `?collector=<public-id>` and `?item=<item-id>` URL helpers using the existing secure collection-link pattern. Strip auth/recovery query/fragment data when creating share URLs. Auth callbacks and password recovery retain priority. Canonical links use stable IDs, not mutable handles. Store an internal pending destination across sign-in and resume it after onboarding; never accept an arbitrary external return URL.
- [x] Prepare link helpers and pending-destination state now, but connect public collector/item routes and username actions in Task 6 once their RPCs exist. The completed deliverable of this task is profile settings/onboarding; it must not call future queries. Test URL parsing independently and keep unimplemented social destinations unavailable through the feature flags.
- [x] Verify desktop/mobile web, browser back and native back/deep-link paths with fixtures. Run focused tests and typecheck; commit.

## Task 3 — Follow graph, relationship management, and abuse limits

**Files:** Create migration `202610090002_social_relationships.sql`, `src/social/PeopleScreen.tsx`, `FollowButton.tsx`, `tests/backend/social-relationships.test.ts`, `tests/backend/social-limits.test.ts`, `tests/e2e/social-people.spec.ts`. Modify social repository/demo/types, profile/settings integration, `src/components/PublicSafetyControls.tsx`, blocked-collector list in `LibraryScreen.tsx`.

**Consumes:** stable publisher IDs and profiles. **Produces:** relationship RPCs, people/search pages, safe follow/remove/block operations, limits configuration.

- [x] Add tests: A follows B -> only isFollowing; B follows A -> both isFriend; unfollow/removeFollower -> friendship ends; self-follow denied; duplicate follow is a no-op; unrelated caller cannot delete a third person's relationship; block removes both directions and prevents refollow; unblock restores nothing. Existing personal Explore hiding still works and does not hide the collector for everybody.
- [x] Create `private.collector_follows(follower_id, followed_id, created_at, PK(follower_id,followed_id), CHECK !=)` with both IDs referencing auth.users ON DELETE CASCADE. Add reverse `(followed_id,follower_id)` index. Derive friendship with indexed EXISTS queries.
- [x] Reuse Task 1's private social config/counters and add relationship actions to the atomic quota helper. Keep `social_writes_enabled=false` and `friends_sharing_enabled=false` until staged release. Deny direct client table access and use atomic increment-under-lock checks; do not enforce quotas in UI alone. Initialization and username edits use profilesEnabled; follows/like additions use socialWritesEnabled, with likes also requiring likesEnabled.
- [x] Implement the pair-lock helper in consistent UUID order. Every follow, follower removal, block, and old `block_public_collection` path must use it and check active/deleting state. Existing block RPC compatibility wrappers resolve the public ID and call the same implementation. Check either direction of blocks for relationship interactions.
- [x] Implement get/search/list profile projections and actions. Search >=2 characters, exact before prefix (lexical ordering supplies this), escape literal `%` and `_`, 24-row pages, rate limit 60 queries/minute per member. Do not return other users' full social graph: list_people is caller-owned. The public profile has no follower identity lists or hidden-item counts.
- [x] Implement Follow / Following / Friends UI states and People tabs. Before a Follow back that creates friendship, explain “Following each other lets you both see existing and future Friends-only items” and confirm that transition. Disable repeated taps until settled; roll back optimistic state on error. Keep sign-in nudges for guests and no self-follow action.
- [ ] Enforce 1,000 follows maximum, 60 successful new follows/hour and 200/day. Removals/unblocks must work after add quotas or social-write pause; repeat adds do not consume quota. Add transaction-concurrency checks against local Supabase/Postgres (PGlite alone is insufficient proof of concurrent sessions). Test block vs follow simultaneously.
- [ ] Purge expired counters via the existing maintenance workflow. Verify FK cleanup during account deletion. Run focused tests, typecheck, and People E2E; commit.

## Task 4 — Visibility, Following queries, and moderation across shared audiences

**Files:** Create migration `202610090003_social_audiences.sql`, `tests/backend/social-visibility.test.ts`, `social-feeds.test.ts`, `social-moderation.test.ts`. Modify `src/domain/models.ts`, `validation.ts`, `src/social/repository.ts`, `demo.ts`, existing public RPC projections via the new migration.

**Consumes:** profiles, relationship graph, block/moderation state. **Produces:** friends audience and authorized shared metadata; all new feed/detail RPCs.

- [ ] Write the full owner/mutual/one-way/unrelated/blocked/guest access matrix for private/friends/public items, including mixed collections, counts, covers, topics, profiles, direct REST access, owner notes/dates, deleted/suspended accounts, and paused Friends sharing.
- [ ] Extend ItemVisibility and the database constraint to `private | friends | public`. Update `save_item_draft`, `list_owned_collections` validation, owner item edits, contribution-policy checks, publication/photo/collection/category triggers, `get_owned_publication`, and `list_owned_publications`. Locate all public-only conditionals and decide explicitly which remain public-only and which cover both shared audiences. Owner-only RLS for tables stays unchanged.
- [ ] Add private helpers `private.are_friends(p_a uuid,p_b uuid)` and `private.can_view_shared_item(p_viewer uuid,p_item uuid)`. The second excludes private, checks deletion/suspension/moderation/blocks, then allows public or eligible friends (subject to friends_sharing_enabled). RPCs supply auth.uid(); the future media function supplies the JWT-verified user ID. Revoke helpers from client roles. Owner library access and review-admin access remain separate paths.
- [ ] Ensure friends items create/maintain publication state and text validation like public items. Publishing immediately creates eligible shared state; existing review/removed state survives audience changes, item edits, image changes, and moves. Five distinct authorized users reporting either audience triggers the existing queue. Update report target eligibility and admin text from Explore-specific wording to shared visibility. Collection reports cover only shared content; admin evidence must not expose private entries.
- [ ] Implement the new Following/profile/collection/entry RPCs. Following includes eligible public uploads from outgoing follows plus eligible friends uploads from mutuals, excludes self, uses 24-row keyset pages and optional friendsOnly filter. Profile/collection reads compute every result/count from the authorized subset. Item IDs/cursors provided by a caller never bypass authorization. Unavailable targets have the same safe result regardless of why unavailable.
- [ ] Keep `private.visible_public_items`, `private.resolve_public_image`, `list_public_entries`, `list_public_topics`, `get_public_topic`, `list_public_collections`, and legacy `get_shared_collection` strictly public-only. Add creator/upload-time/relationship fields to their existing JSON shapes where applicable, without adding owner IDs. New viewer-aware collection RPC can reuse `private.resolve_shared_scope` for legacy links while preserving its category restriction.
- [ ] Add partial indexes for shared item owner/created_at/id and collection/created_at/id, joining the follow graph before paging. Verify plans on synthetic larger data rather than adding a client-side fetch/filter loop. Avoid one database call per feed card. Do not duplicate feed rows or media objects per follower.
- [ ] Run all backend tests, typecheck, and migration-upgrade tests. Specifically show anonymous public-media lookup returning null for friends items. Commit; keep Friends sharing disabled pending Task 5–8 verification.

## Task 5 — Authenticated delivery of friends' images

**Files:** Create `supabase/functions/member-media/{index,http,lookup}.ts`, `src/social/SharedEntryImage.web.tsx`, `SharedEntryImage.native.tsx`, `SharedEntryImage.d.ts`, `tests/backend/member-media.test.ts`, `tests/backend/member-media-http.test.ts`. Modify `supabase/config.toml`, social read counters/migration as needed, `.github/workflows/verify.yml`, `.github/workflows/maintenance.yml`, and test dependency config only if required.

**Consumes:** Task 4 permission helper, existing R2 adapter/database connection, verified Supabase session. **Produces:** restricted binary images with access checked for every request.

- [ ] Write tests for valid mutual friend/owner access; denied guest, expired/forged token, one-way follower, blocked/unfollowed/deleted account, removed/reviewed item/collection, private item, disabled friend sharing; no R2 read on denied requests. Prove public-media continues to deny the same friends image.
- [ ] Build GET `/functions/v1/member-media?itemId=<uuid>&size=thumb|full` plus OPTIONS. Require Authorization bearer header and validate with the established server auth method (`auth.getUser(token)` pattern). A query token or caller-supplied owner/viewer ID is never accepted. Copy the exact allowed-origin mechanism without putting secrets in the frontend. Set `verify_jwt=false` only with explicit handler authentication, matching the existing modern-key setup.
- [ ] Resolve the storage key only after current database access checks. For the owner, use a separate owner-id check to permit their own items; for everyone else, call can_view_shared_item. Return JPEG bytes, no redirects, signed URLs, or internal key. Use private/no-store, nosniff, correct content type, Vary Origin/Authorization, allowed auth headers, and generic 401/404/429/503 responses without credentials/provider details.
- [ ] Atomically charge authenticated member read budgets (120/minute, 5,000/day) and the existing app-wide image budget, before reading R2. Configure a member-read pause. Rate-limit authenticated misses as well to limit probing; invalid JWTs never reach R2. Reuse the existing object and thumbnail; no new image copies.
- [ ] Export the platform image component contract: `{itemId, collectionId, audience, size, accessRevision, style, onUnavailable}`. Public images may use the current publicPhotoUrl; friend images use the authenticated endpoint. Web fetches a Blob/object URL and revokes it on unmount/change; native uses header-authenticated expo-image with no disk caching. Include user identity/accessRevision in native cache identity. Verify header behavior on actual web and native runtimes; do not assume a web img element can attach Authorization.
- [ ] Clear restricted images on session change/logout, relationship/visibility invalidation, and denial; ignore stale async responses with a request generation check. On focus and every 30 seconds for open restricted detail, revalidate metadata and reset the image if unavailable. Do not preload full-resolution feeds. Already delivered pixels are outside server revocation; document that precisely.
- [ ] Test both image sizes, CORS preflights from the custom domain/local dev, absent Origin for native, rejected unknown Origin, budget exhaustion, no-store errors, late fetch after logout, and two sessions requesting the same item. Run edge typechecks and focused tests; commit.

## Task 6 — Following UI, Friends selector, and reusable entry views

**Files:** Create `src/social/FollowingScreen.tsx`, `CollectorProfileScreen.tsx`, `SharedEntryCard.tsx`, `SharedEntryDetail.tsx`, `useSharedFeed.ts`, `tests/e2e/social-sharing.spec.ts`. Modify `LibraryScreen.tsx`, `Editors.tsx`, `PublicCatalog.tsx`, `PublicTopicScreen.tsx`, `SharedCollectionScreen.tsx`, repository/demo integrations, `src/lib/sharing.ts`, `App.tsx`.

**Consumes:** completed metadata/media APIs. **Produces:** all requested social browsing and sharing flows, consistent across screens.

- [ ] Add browser interaction tests for My collections / Following / Explore at desktop and 390px mobile widths, username/profile links, direct entry detail, View full collection, no single-creator action on grouped topics, and chronological load-more/refresh with no duplicates after new uploads.
- [ ] Add Following tab with Friends only filter and a Find people empty-state action. My collections remains the logo/home destination. Keep guest Explore accessible and show sign-in prompts for account-only actions. Feed refresh updates relationship state and removes inaccessible entries immediately after local unfollow/block.
- [ ] Add Private / Friends only / Public selector and plain explanation: “Only people you follow who also follow you can see this item. Notes stay private.” Private remains initial default. If there are no friends, permit Friends-only save and explain it becomes visible when friendship exists. On editing, preserve saved audience; do not reset it to public/private accidentally. Gate selector availability on server Friends-sharing capability.
- [ ] Extract the shared entry card/detail around current UI. Every real collector entry shows username, follow state, audience badge, and later like control; a username action must not also open the item. Do not attach a Follow button to a multi-collector topic. Preserve existing full-image viewing, moderation controls, upload behavior, and category organization.
- [ ] Build the collector profile with themed initials, username, relationship controls, and viewer-aware entry/collection queries. Shared-collection views switch to the same authorized projection. Guests see only public subsets and Sign in actions. Following links to collections must show the authorized subset; neither a zero public count nor a missing public cover should hide a friend-visible collection. Existing public links still work and cannot unlock hidden entries.
- [ ] Update sharing/detail navigation and pending sign-in destination. On logout/account switch unmount session-owned social state and previews, clear images, and discard pending friend payloads. Keep auth callback/recovery parsing higher priority than collector/item URL parsing.
- [ ] Add realistic demo relationships and mixed-audience synthetic entries with the same rules. Verify light/fun/dark contrast, accessible labels/pressed states, 44px minimum controls, reduced motion where relevant, mobile scrolling, and hardware/browser back.
- [ ] Run focused E2E and typecheck; export web, Android, and iOS bundles. Record real-device gaps without claiming export equals device testing; commit.

## Task 7 — Likes and consistent feed state

**Files:** Create migration `202610090004_item_likes.sql`, `src/social/LikeButton.tsx`, `tests/backend/social-likes.test.ts`, `tests/e2e/social-likes.spec.ts`. Modify social repository/demo/types, SharedEntryCard/Detail and all public feed projections, owned-item detail if exposing owner counts.

**Consumes:** shared authorization and action budgets. **Produces:** desired-state liking, counts/viewer state in page responses, shared optimistic state.

- [ ] Test unique like identity, repeated desired-state requests, concurrent adds, guest/self/private/inaccessible denies, authorized friend/public success, expired friendship, review removal, account deletion, item deletion, and hidden count/state responses. A viewer can remove their own stored like after losing access and receives no item metadata/count.
- [ ] Create `private.item_likes(item_id FK items ON DELETE CASCADE, liker_id FK auth.users ON DELETE CASCADE, created_at, PK(item_id,liker_id))`; add liker_id index for account deletion. No public raw table or liker-list endpoint. Authorize adds using the same item helper inside the transaction. Revalidate before commit where relationship races are material; coordinate item/relationship locks consistently.
- [ ] Implement set_item_liked as idempotent insert-on-conflict/delete with 300/hour and 1,000/day successful-add limits, no-op exemption, and removals allowed after quotas/pause. It returns generic success. `get_entry_social_state` accepts at most 24 unique valid IDs, returns only authorized targets (plus caller-owned items), never hidden counts.
- [ ] Batch aggregate count and viewer-liked state with feed/detail queries in SQL, not per tile. Historical likes persist across audience changes, but authorization gates every response. Existing public RPC fields remain compatible. Start with indexed aggregation; do not add a distributed count cache.
- [ ] Implement one shared optimistic store keyed by viewer/item, including request generations, disable-while-saving, rollback, nonnegative count, and synchronized cards/details. Invalidate/refetch authoritative state after successful mutation. Public guest action opens sign-in with return destination. Own entry shows its count without an active self-like button.
- [ ] Test rapid click sequences, rejected/retried requests, screen changes while a request is in flight, liking then blocking, and switching accounts. Run focused suites/typecheck; commit.

## Task 8 — Integration, security regression, and platform acceptance

**Files:** Create `tests/backend/social-integration.test.ts`, `tests/backend/social-concurrency.test.ts`, `tests/e2e/social-session.spec.ts`. Modify `scripts/verify-schema.sql`, `docs/DEVICE-ACCEPTANCE.md`, `docs/VERIFICATION.md`, `docs/OPERATIONS.md`, `docs/MODERATION.md`, `docs/DEPLOYMENT-CHECKPOINT.md`, `src/screens/PublicInfoScreen.tsx` and relevant policy tests.

- [ ] Fill integration gaps from the five Review Focus items. Use at least A/B mutual, C one-way, D unrelated, a blocked pair, a guest, an admin, and five distinct reporters. Assert exact allowed/denied rows and bytes; check direct REST/table access separately from UI. Make sure collection covers/topic counts and social-state bulk endpoints disclose no friend/private data to guests.
- [ ] Run upgrade fixtures from `202610050001_report_threshold_review.sql`; verify current account IDs/public links, existing photos/notes, role grants, owner limits, and current admin remain intact. Verify first login works if no profile was initialized yet. Real Postgres concurrency checks use separate sessions for same-handle allocation, simultaneous follow/block, and repeated likes. Synthetic fixtures only; failures clean up their own records.
- [ ] Update privacy/help text to explain public usernames, Friends-only sharing through mutual follows, likes, personal blocks, revocation limits, and social-data deletion. Keep existing support/publisher info. Update contribution-policy version and acceptance tests only if the approved terms text changes obligations; don't arbitrarily force reacceptance for spelling changes.
- [ ] Run `npm run check:secrets -- --all`, `npm run typecheck`, `npm test`, `npx expo install --check`, web + native exports, edge function checks including member-media, and Playwright with the fixture environment from `.github/workflows/verify.yml`. Ensure env inputs are synthetic when producing test bundles. Never pass live secret files to frontend build steps.
- [ ] Test actual Android and iOS development/preview builds: auth, profile intro, follow/follow-back confirmation, friends image headers, revocation, likes, share links, app background/foreground, keyboard/back, guest Explore, dark theme. Mark each tested device/version or leave it explicitly outstanding. A platform bundle compiling is not proof of runtime behavior.
- [ ] Add schema verification for private-table grants, required RPCs, friends constraint, unique indexes, counter cleanup, old endpoint public-only behavior, and capability flags. Preserve all preexisting media safeguards. Review query plans with 1,000 follows and synthetic large item sets; new pages must remain bounded.
- [ ] Record passed commands and unresolved platform items in the checkpoint. Commit only after the applicable checks pass; do not mark live readiness from local tests alone.

## Task 9 — Staged deployment and handoff

**Files:** Update `docs/DEPLOYMENT-CHECKPOINT.md`, `docs/CONNECT-SERVICES.md`, `docs/STORE-PUBLISHING.md`; no secrets committed.

- [ ] Recheck current user authorization before external deployment/push. The request that created this document was planning-only; it does not itself authorize these future deployment steps.
- [ ] Apply forward migrations in staging/local Supabase first, deploy member-media with existing server-side R2 credentials and MEDIA_ALLOWED_ORIGINS, and confirm auth/CORS/denial tests. No new public secret or client R2 key is needed. Keep social writes and Friends sharing off in production until corresponding clients/endpoints are ready.
- [ ] Deploy compatible backend migrations before the frontend so no released UI calls missing RPCs. Deploy member-media before enabling Friends sharing. Verify the live database migration list and safe schema-check output rather than assuming a frontend deploy updates Supabase.
- [ ] Release frontend/native preview builds that consume capabilities. Enable profiles and public-only Following first; then enable Friends sharing after signed-in media tests; then likes. Test with designated synthetic beta accounts and remove their fixtures afterward. Production deploy must not run a raw production-email/user dump.
- [ ] Smoke-test on `https://www.sharecollectibles.com`: guest Explore, new/existing-account intro, follow-back, mixed-audience collection, full photo, likes/reporting, unblock behavior, no private data in public endpoints. Verify localhost/Vercel origins retained only where intentionally configured.
- [ ] Rollback: disable social writes and Friends sharing on the server; fail closed for restricted reads and remove Friends controls. Keep owner reads, unlink/remove actions, and existing public/private app working. Leave friends rows/data intact for recovery; never down-migrate friend items to public. Keep compatibility functions until released native clients no longer need them.
- [ ] Record deployed migration/function/frontend versions, capability state, tested device versions, and any outstanding store-account work. User handles GitHub push/deployment unless explicitly authorizing the implementing session to do it.

## Handoff for the smaller model

Read the spec and this plan first. Recheck the working tree and current schema files. Implement one task at a time; tests for new privacy/relationship behavior must fail before the implementation and pass afterward. Update checkboxes and the checkpoint after each completed task, recording commands and remaining work so a usage-limit interruption is recoverable. Do not broaden scope into comments or unrelated UI redesigns. Follow the most recent owner instructions on implementation, commits, and deployment.

Self-review completed during planning: the confirmed mutual-follow model, requested email-prefix generation, first-login settings, public usernames/actions, relationship management, Friends audience, likes, existing moderation, image security, demo/platform support, and migration/deployment ordering all have explicit owning tasks. Task 4/5 are a release dependency pair: restricted sharing cannot be enabled from the database or UI task alone.
