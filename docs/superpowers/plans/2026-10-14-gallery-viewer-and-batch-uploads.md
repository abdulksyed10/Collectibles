# Responsive Gallery, Entry Viewer, and Batch Uploads Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. The user intends a smaller model to implement it. Do not delegate, deploy, or expand the scope automatically. Steps use checkboxes for tracking.

**Goal:** Use wide screens well, make entry viewing easy to navigate, and let collectors add up to 10 separate photo entries in one operation.

**Architecture:** Keep the Expo application, existing repositories, virtualized lists, and authorization boundaries. Share layout calculations and a presentation-only entry viewer across existing screens. Add two additive database migrations for display dates and retry-safe creation; continue sending each photo through the existing authenticated media service.

**Tech Stack:** TypeScript, Expo, React Native / Web, Expo Image Picker and Image Manipulator, Supabase/Postgres, private R2, Node tests, PGlite, Playwright.

**Spec:** The design brief below implements the user's seven requirements and five screenshots from October 14, 2026. This document is a proposed implementation handoff, not an implementation or deployment report. Reviewed baseline: `194ce98`.

## Design brief and decisions

### Gallery and navigation

- At viewport widths of **900 px and above**, keep the signed-in Collections navigation visible beside My collections, Following, and Explore. Use a **260 px** sidebar and let the main pane fill the remaining width. Guests get the full main pane without an empty personal sidebar.
- Below 900 px, keep collection navigation in My collections only. Do not put it above Explore or Following.
- Selecting a collection/category from the desktop sidebar switches to My collections with that filter. Creating a collection/category from there returns to the relevant My collections view on success. The logo continues to open All collections.
- Remove gallery width caps and the maximum of four columns. Measure the main pane, not the window, to calculate columns. Keep the current card appearance and ordering; this is not a masonry redesign.
- Keep one main scrolling list in the available viewport. The sidebar may scroll independently when it contains many collections. Avoid a centered, narrow scroll region with an unused strip beside it.

### Entry viewer

- An entry opens in a dedicated viewer: full viewport below 600 px, a centered dialog up to **960 px wide** on larger screens, with safe-area insets. Use a contained image, a persistent close control, and vertically scrollable details. Do not enlarge every settings/editor Sheet.
- Show subtle previous/next chevrons over the left/right image edges, with 48 px interactive targets and backgrounds readable against light and dark photos. Also support left/right keyboard arrows and horizontal swipes on the image on touch devices. Keep buttons available as an alternative to swiping.
- The sequence is the currently opened list, including filters and sort order. Explore navigates Explore entries; Following navigates that feed; a collection/profile navigates its own list; My collections respects the current collection/category/search. Do not jump from a feed into an unrelated collection. Do not wrap at the ends.
- Load the next page when necessary. A direct link with no list context has no fabricated previous/next sequence; retain View full collection.
- Put the creator and social actions in one row: username left, like/follow right. Put the small date below the username. Keep red liked hearts, tooltips, screen-reader labels, sign-in nudges, own-item behavior, and permission rules.
- Use thin, themed web scrollbars with transparent tracks. Keep scrolling, keyboard access, and platform accessibility intact. Do not globally hide scrollbars or disable scrolling to disguise the problem.

### Date semantics

- Existing entries at migration time: use a snapshot of their acquired date, labelled **Acquired Oct 6, 2026**. If absent, use creation time labelled **Added …**.
- New photo entries: record the server time of the **first successful photo attachment**, labelled **Posted …**. Creating metadata or selecting a file is not a successful photo upload.
- New entries without a photo display **Added …** until a photo is attached. Later title edits, likes, moving collections, or changing visibility do not change Posted.
- Show this date in the viewer only, not gallery cards or collection cards. Avoid “Updated” because that would misdescribe acquired/posted dates.
- This intentionally makes the legacy acquired-date snapshot visible to people authorized to view that shared entry. Expose only this display value, not notes or the rest of the owner's private metadata. No location/EXIF dates.

### Batch creation

- Choose **1–10 images**, show a thumbnail queue, remove selections, or append more up to the limit. Camera adds one image at a time. Keep the existing ability to make a single item without a photo.
- One shared form supplies title, collection, optional category, acquired date, visibility, and optional notes. Every selected image becomes a separate entry with those values; use the exact same title without automatic numbering. Explain that titles can be edited individually afterward. Notes remain private.
- Existing-item editing stays a single-entry operation. It must not turn one existing entry into 10 images or silently create more entries.
- Prepare and upload **one image at a time**. Show progress and per-image results. Successful images remain saved if another fails; retries reuse the same entry, including after a lost server response.
- Create upload drafts privately. Apply the selected audience after the photo is confirmed. A successfully shared entry follows the existing immediate-sharing/moderation rules; this does not introduce an approval queue for new uploads.
- No background/offline upload service in this release. A Stop after current image control pauses scheduling. Explain that closing/reloading discards unstarted local selections, while completed entries and any saved incomplete draft remain in My collections.

## Global constraints

- Planning only until the user starts implementation. Do not modify application code, hosted settings, or branches as part of reviewing this document.
- Preserve public, friends-only (mutual follows), private, block, report, moderation, and account-deletion checks. Only signed-in users report; the existing five-distinct-report threshold stays unchanged.
- Keep R2 private; use existing owner/public/member image paths. Never send credentials in image URLs or bypass access checks for navigation/prefetching.
- Retain server quotas, image signature validation, policy acceptance, and profanity checks. Ten per operation is not an increased account/storage quota.
- Keep list virtualization and bounded pagination. Do not fetch a whole account/feed to implement a viewer or fill a large display.
- No dependency upgrade, authentication work, comments, new social features, or full routing rewrite.
- Use additive migrations; never edit historical deployed SQL. Preserve old app/RPC compatibility during rollout.
- Build behavior for web, Android, and iOS. Web browser checks alone are not proof that native gestures/pickers work.

## Findings that determine the implementation

| Current location | Relevant behavior |
| --- | --- |
| `src/screens/LibraryScreen.tsx` | Sidebar only exists in the library branch; gallery caps at four columns and 1,500 px; own detail is inline. |
| `src/screens/PublicCatalog.tsx`, `src/social/FollowingScreen.tsx` | Four-column cap and 1,200 px container; feed/detail state and pagination already exist. |
| `src/screens/PublicTopicScreen.tsx`, `src/screens/SharedCollectionScreen.tsx` | Separate older viewer implementations and capped grids. These must not be missed. |
| `src/social/CollectorProfileScreen.tsx`, `VisibleCollectionScreen.tsx`, `SharedEntryScreen.tsx` | Social viewers, cursor feeds, and direct-link access checks. |
| `src/components/ui.tsx` | Sheet contains an unstyled ScrollView and has a 530 px maximum width; used by forms as well as current viewers. |
| `src/social/SharedEntryDetail.tsx` | Creator information and action icons are separate rows. |
| `src/lib/photos.ts` | Picks/prepares only `assets[0]`; creates full and thumbnail base64 immediately. |
| `src/screens/Editors.tsx` | One photo and one saved ID; creates metadata before upload and preserves the ID after known failures. |
| `src/domain/itemPhoto.ts` | `confirmPhotoUpload` already reconciles a lost upload response by checking saved images. Keep it. |
| `src/data/repository.ts` | New item creation has no request ID. A lost metadata-create response can therefore duplicate an entry on retry. |
| `private.shared_entry_json`, `get_shared_collection` | The latest SQL (`202610090007`) uses the common projection for both. Some older frontend shared-collection types still omit its creator/date/social fields. |
| `tests/backend/item-dates.test.ts` | Existing tests deliberately keep raw acquired-date fields out of shared responses; revise expectations narrowly for the new display-date projection. |

The installed Expo Image Picker types support multiple selection on web/iOS/Android, but `selectionLimit` is documented only for native platforms. Enforce the ten-image limit in application validation too.

## Review focus

1. A screen resized while scrolled or viewing a selected item must not jump to a different entry or lose its filters (Tasks 1, 4).
2. A friendship/block/visibility change while a viewer is open must remove inaccessible content, including old media and stale async results (Task 4).
3. Losing a response after metadata or photo commit must not create duplicates or repeat completed uploads (Tasks 5, 6).
4. Large phone photos, unsupported files, and picker cancellation must not freeze the app or discard already selected valid images (Task 6).
5. Date-only values must not shift a day with timezone conversion; migration must not change feed ordering or disclose private metadata (Task 3).

## Task 1 — Stable desktop shell and responsive grids

**Modify:** `src/screens/LibraryScreen.tsx`, `src/components/CollectionNavigator.tsx`, `src/screens/PublicCatalog.tsx`, `src/social/FollowingScreen.tsx`, `src/screens/PublicTopicScreen.tsx`, `src/screens/SharedCollectionScreen.tsx`, `src/social/CollectorProfileScreen.tsx`, `src/social/VisibleCollectionScreen.tsx`.

**Create:** `src/components/galleryLayout.ts`, `src/components/useGalleryLayout.ts`, `tests/gallery-layout.test.ts`, `tests/e2e/gallery-layout.spec.ts`.

**Interfaces:** `getGalleryLayout(paneWidth: number): { columns: number; cardWidth: number; padding: number; gap: number }`; `useGalleryLayout()` returns that layout plus an `onLayout` handler. Width means the measured list pane, after sidebar allocation, not `useWindowDimensions().width`.

- [ ] Add behavior tests for 320, 390, 535, 900, 1440, 1920, and 2560 px viewports, with/without the sidebar. Assert no horizontal overflow, two cards where compact widths permit, and more than four cards at wide widths. Verify these fail against the old caps.
- [ ] Calculate padding as 16 px below a 900 px pane, otherwise 32 px; use a 14 px gap. Use a minimum card width of 156 px below a 600 px pane, otherwise 232 px. Let usable width be pane width minus twice padding; columns = max(1, floor((usable + gap) / (minimum + gap))). Divide remaining usable width evenly. Handle a zero initial measurement without negative/NaN dimensions.
- [ ] Measure each list's actual pane. Apply identical spacing math to list cells; remove the existing extra 7 px cell padding when switching to actual gaps. Preserve widths on incomplete last rows. Remove the gallery maxWidth/four-column caps in all listed screens, including Explore collection/topic cards.
- [ ] Hoist the 260 px desktop sidebar outside the active-tab conditional in LibraryScreen. Give the main pane `flex: 1`, `minWidth: 0`, and a bounded flex height. Keep narrow-screen navigation only in the library header. Sidebar callbacks explicitly select the library tab.
- [ ] Make the long desktop sidebar independently scrollable. Preserve filters when simply switching tabs. A sidebar selection changes the library filter intentionally. Keep a clear indication that these are the user's collections while browsing Explore.
- [ ] Preserve a first-visible item ID/offset when `numColumns` changes and FlatList must remount. Closing a viewer at unchanged width restores the original list position; resizing restores its nearest visible item.
- [ ] Verify with `npx tsx --test tests/gallery-layout.test.ts` and the targeted browser spec after a fixture build. Check signed-in, guest, and demo layouts. Commit this task after it passes.

## Task 2 — Shared viewer frame, subtle scrolling, and aligned actions

**Create:** `src/components/EntryViewer.tsx`, `src/components/EntryMetaRow.tsx`, `src/components/scrollbars.web.ts`, `src/components/scrollbars.native.ts`, `tests/e2e/entry-viewer.spec.ts`.

**Modify:** `src/components/ui.tsx`, `src/social/SharedEntryDetail.tsx`, `src/screens/PublicCatalog.tsx`, `src/screens/PublicTopicScreen.tsx`, `src/screens/SharedCollectionScreen.tsx`, and the own-entry detail in `src/screens/LibraryScreen.tsx`. Attach scrollbar styling to Task 1's lists/sidebar too.

**Interfaces:** `EntryViewer` accepts title, media, metadata/actions children, onClose, and optional navigation `{ canPrevious, canNext, busy, onPrevious, onNext, positionLabel }`. It does not fetch data or decide authorization. `EntryMetaRow` accepts username/profile action, optional date text, and existing social-action children.

- [ ] Add browser assertions for close button reachability, wheel/keyboard scrolling, no background scroll while open, same-row username/actions, long usernames, and narrow-screen layout. Record a failing screenshot/assertion before replacing the old viewers.
- [ ] Implement the dedicated modal frame from the design brief. Keep the title/close outside the scrolling body; bound image height to available viewport height with `contain`, so portrait photos do not bury controls. Keep forms in the existing Sheet.
- [ ] Implement a web-only scoped scrollbar adapter: 6 px track width, transparent track, rounded theme-aware thumb, stronger thumb on hover/focus, and standard scrollbars in forced-colors mode. Scope it to opted-in app scroll regions, not every browser element. Native uses normal transient platform indicators. Avoid untyped DOM work leaking into native bundles.
- [ ] Apply the subtle treatment to Sheet's scroll region without changing its form sizing or busy-close behavior. Check upload forms, account settings, and reporting dialogs remain scrollable.
- [ ] Build EntryMetaRow using a shrinkable left column (`flex: 1`, `minWidth: 0`, single-line ellipsis) and non-shrinking action group. Username and actions share the top row; the date sits below in the left column. Do not reduce IconActionButton's 48 px targets to make room.
- [ ] Reuse LikeButton/FollowButton and their existing state updates; never place them inside the image's open pressable. Preserve guest sign-in behavior, own-item disabled/count-only behavior, username/profile navigation, safety controls, and View full collection. Legacy/demo entries without profile fields still render correctly.
- [ ] Migrate each inline detail view to the presentation shell without coercing owner data into a public SharedEntry. Owner notes/edit/delete remain owner-only. Social and public media keep their existing loaders. Extend SharedCollectionPage's entry type to retain optional creator, relationship, likes, createdAt, audience, and collection identifiers already returned by the latest backend, so the older shared-collection screen can show the same header. Preserve compatibility with demo/old responses that omit them.
- [ ] Run `npm run typecheck` and the viewer browser spec across classic, dark, and playful themes. Check keyboard focus enters the viewer, stays inside it, Escape closes it, and focus returns to the originating card. Commit.

## Task 3 — Accurate dates with an additive backend migration

**Create:** `supabase/migrations/202610140001_entry_post_dates.sql`, `src/domain/postDates.ts`, `tests/post-dates.test.ts`, `tests/backend/entry-post-dates.test.ts`.

**Modify:** `src/domain/models.ts`, `src/social/types.ts`, `src/data/demo.ts`, `tests/backend/item-dates.test.ts`, all Task 2 metadata renderers, and `docs/COLLECTION-SHARING.md`.

**Data contract:** `EntryPostDate = { kind: 'acquired' | 'posted' | 'added'; value: string }`. Acquired values are `YYYY-MM-DD`; posted/added values are ISO timestamps. Shared entries, including SharedCollectionPage items, return optional `postDate` for compatibility; missing fields fall back to `createdAt` if available, otherwise omit the date. Owner Item gains optional nullable `legacy_post_date` and `posted_at`; `getOwnedEntryPostDate(item: Item): EntryPostDate` applies the same precedence as the server. Never invent today's date for old responses.

- [ ] Add an upgrade test that seeds old entries before applying the new migration: with acquired dates, without dates, private, public, and friends-only. Assert exact output, permissions, and unchanged `created_at`/sort order.
- [ ] Add nullable `legacy_post_date date` and `posted_at timestamptz` columns to items. In the migration transaction, snapshot existing non-null `acquired_on` into `legacy_post_date`. Leave defaults null for future inserts. The existing `guard_pins` trigger (retained under that name after the items rename) rewrites updated_at. Hold the migration's table lock, disable only that trigger for this non-user backfill, then re-enable it before commit. Do not disable all triggers or leave a guard disabled. Assert created_at, updated_at, acquired_on, owner counters, publication state, and the guard's enabled state are unchanged after migration, including accounts awaiting deletion.
- [ ] Add a narrowly scoped, server-owned AFTER INSERT trigger on item_images that sets items.posted_at once from the image's server-created timestamp. This executes in the photo commit transaction. Keep it out of client INSERT/UPDATE grants; ordinary owners cannot spoof these columns. Failed media commits must not set a posted date. Repeated reconciliation/edits must not change it.
- [ ] Add a private projection helper with precedence: legacy_post_date -> Acquired; posted_at -> Posted; created_at -> Added. Extend the latest definition of `private.shared_entry_json` from `202610090007_social_profile_rollout_fixes.sql` in the new migration, preserving username sanitization and every existing field/visibility predicate. Shared collections, public topics, Following, profiles, and visible collections all use this helper in the current schema; verify the new field through every route without replacing newer SQL with an older definition.
- [ ] Return only `postDate`, not raw acquired_on, notes, owner IDs, or storage keys, through shared APIs. Update the old privacy test to allow this specific projection while continuing to reject raw private fields. Document the deliberate legacy-date disclosure for shared entries.
- [ ] Implement `formatEntryPostDate(value: EntryPostDate, locale?: string): string` using the existing local calendar-date helper for acquired dates and normal localized timestamp formatting for posted/added. Test west/east-of-UTC zones and leap day. Display in EntryMetaRow and own detail only; keep the editable acquired field separate.
- [ ] Update demo entries and fixtures to model old/new dates. Run `npx tsx --test --test-concurrency=1 tests/post-dates.test.ts tests/backend/entry-post-dates.test.ts tests/backend/item-dates.test.ts`, plus the relevant sharing/visibility tests. Commit.

## Task 4 — Previous/next navigation and touch gestures

**Create:** `src/components/useEntryNavigation.ts`, `src/domain/entryNavigation.ts`, `src/components/EntrySwipeSurface.tsx`, `tests/entry-navigation.test.ts`.

**Modify:** Task 2 viewer/callers; `src/social/FollowingScreen.tsx`, `src/social/CollectorProfileScreen.tsx`, `src/social/VisibleCollectionScreen.tsx`, `src/social/SharedEntryScreen.tsx`, `src/data/useLibrary.ts`, and relevant existing refresh tests.

**Interfaces:** Navigation uses `contextKey`, ordered unique item IDs, `activeId`, `hasMore`, and `requestMore(): Promise<{ appendedIds: string[]; hasMore: boolean }>`. Add thin pagination adapters that return these values; retain existing repository paging formats. Reject on page failure rather than pretending the list ended.

- [ ] Test first/middle/last entry, one entry, empty list, append across page boundaries, duplicate IDs, failed next-page fetch, and switching filters during a pending request.
- [ ] Keep selection by ID, not a copied item object or array index. Derive current metadata from the current list so likes, titles, dates, and relationship changes stay synchronized. Reuse `appendUniqueEntries` and request-generation guards.
- [ ] Wire Previous/Next into the same ordered sequence used by the originating grid. Freeze ordering for the open viewing session; reconcile removed IDs and data updates, but do not insert freshly arriving feed entries ahead of the user mid-swipe. Append explicitly loaded pages in source order.
- [ ] At the loaded boundary, fetch one next page with a loading state. Coalesce rapid Next clicks/swipes into one request; move only after a new entry is present. On error retain the current entry with Retry. Honor existing page bounds and show the real end state rather than an endless enabled Next button.
- [ ] Wire keyboard Left/Right only while the viewer is active and focus is not in a field, content-editable area, or nested report/edit dialog. Escape remains Close. Disable unavailable directions; never wrap. A small position label describes position within the loaded sequence without claiming an inaccessible/global count.
- [ ] Recognize a one-finger image-area swipe only after at least 50 px horizontal movement and horizontal displacement greater than 1.5 times vertical displacement. Left = next, right = previous. Vertical scrolling, pinch gestures, buttons, reporting fields, and browser edge gestures retain their behavior. Use existing React Native responder APIs/platform adapters; no gesture dependency upgrade just for this feature.
- [ ] Keep only the active full image mounted initially; use a loading state during transitions. Do not preload entire pages or persist friends-only blobs. Prefetching is deferred unless measured navigation performance warrants a separately reviewed change.
- [ ] On block, sign-out, access invalidation, or unavailable/deleted item, discard stale media and controls and show unavailable/return to list. Keep existing focus/30-second shared revalidation and check the selected shared entry through `readSharedEntry` on navigation. Retain legacy public availability checks when social APIs are unavailable. Request generations prevent a slower previous image/profile response from replacing the current one.
- [ ] Direct-link SharedEntryScreen uses the shell with navigation omitted. Preserve View full collection. Closing a list viewer restores its originating grid's position/focus; owner edit/delete acts on the active ID only.
- [ ] Run unit tests, existing shared-refresh/access tests, and browser viewer tests; manually exercise Android/iOS swiping when devices are available. Commit.

## Task 5 — Retry-safe upload draft creation

**Create:** `supabase/migrations/202610140002_upload_draft_requests.sql`, `tests/backend/upload-draft-requests.test.ts`.

**Modify:** `src/domain/models.ts`, `src/data/repository.ts`, `src/data/demo.ts`.

**Interfaces:** Add `CollectionRepository.createUploadDraft(draft: ItemDraft, requestId: string): Promise<Item>` and `readOwnedItem(itemId: string): Promise<Item | null>` (an owner-RLS SELECT by ID; null when missing/inaccessible). Implement both in live/demo repositories. Keep `saveItem(draft, id?)` unchanged for editing/single metadata creation. RPC: `public.create_upload_draft(p_request_id uuid, p_draft jsonb) returns public.items`.

- [ ] Test repeat/concurrent requests, response-loss replay, conflicting payload with same key, different owners using the same key, deleted result, foreign collection/category, sign-out/anonymous access, account deletion, and all existing rules/quotas.
- [ ] Add a private owner-scoped request ledger keyed by `(owner_id, request_id)` with normalized request payload and resulting item ID. No anon/authenticated table grants. Cascade ledger removal on account deletion; retain a tombstone if its item is deleted so the same request cannot resurrect it. Store no photo bytes, tokens, or signed URLs.
- [ ] Validate a non-null UUID and a bounded, whitelisted JSON object matching ItemDraft's fields; reject unknown fields and wrong types. Lock the existing owner-state row before checking/creating a request, matching save_item_draft's locking order. Same key/same normalized payload returns the existing owner item; changed payload fails clearly without mutating it.
- [ ] For a new request, reuse `save_item_draft` with the intended audience so ownership, collection/category creation, policy, sharing capability, profanity, and item-count checks run. Before the same transaction commits, set the resulting item private and return its final private state. The temporary requested visibility is never externally visible. Test the item is private and excluded from every shared feed after commit, including public/friends drafts. Save the ledger result in that transaction; no duplicate collection/category on replay.
- [ ] Restrict RPC execution to authenticated/service roles; use a fixed safe search_path and preserve checks when service role lacks an authenticated actor. Existing RPC remains compatible with old clients.
- [ ] Mirror idempotency and private-draft behavior in demo repository. Client adapter sends only validated fields. Do not add a public batch endpoint with a large base64 body.
- [ ] Run `npx tsx --test --test-concurrency=1 tests/backend/upload-draft-requests.test.ts tests/backend/item-draft.test.ts` and policy/moderation/account-deletion regression tests. Commit.

## Task 6 — Ten-image picker and resumable-in-session upload queue

**Create:** `src/components/PhotoSelectionQueue.tsx`, `src/domain/batchUpload.ts`, `src/domain/mediaErrors.ts`, `tests/batch-upload.test.ts`, `tests/photo-selection.test.ts`, `tests/e2e/batch-upload.spec.ts`.

**Modify:** `src/lib/photos.ts`, `src/domain/photoValidation.ts`, `src/screens/Editors.tsx`, `src/domain/itemPhoto.ts` only as needed, `src/domain/models.ts`, `src/data/repository.ts`, and demo fixtures.

**Interfaces:**

- `selectPhotoAssets(options: { camera: boolean; remaining: number }): Promise<ImagePickerAsset[]>` returns descriptors, not prepared base64. Cancellation returns `[]` without changing current selections.
- `preparePhoto(asset: ImagePickerAsset): Promise<PreparedPhoto>` preserves the existing 1600 px full-image / 360 px thumbnail processing, JPEG encoding, EXIF exclusion, and byte limits.
- A queue job holds a stable UUID requestId, selected asset, frozen ItemDraft, optional itemId, and a status: `queued | preparing | creating | uploading | publishing | saved | failed | paused`. Retry resumes the recorded stage after reconciling server state.

- [ ] Add tests for one/ten/eleven selections, adding more to an existing selection, camera append, cancel, unsupported PDF/video, corrupt image, mixed selection, and retry after both metadata and upload response loss. Verify existing code fails these cases before implementation.
- [ ] Split picker selection from preparation. Request images only, disable editing/cropping for multiselect, set native selectionLimit to remaining capacity, and validate returned assets on every platform. When a browser returns too many, reject that newly chosen selection with “You can add up to 10 images at a time” and preserve the prior queue; do not silently drop files. When supported, validate each asset and report rejected names; if the picker itself rejects a mixed selection, show the existing image-only message and preserve the queue.
- [ ] Preview lightweight asset URIs rather than preparing ten full images immediately. Show count, thumbnail/removal, Add more photos, and Camera. Release temporary previews/prepared data when removed, completed, or closed. Only one prepared full/thumbnail pair should be retained by the processing worker at a time; gallery thumbnails may remain lightweight local images.
- [ ] For creation only, render the shared form and an “Add N items” submit action. Freeze shared fields once upload starts. Explain that each image becomes a separate entry with the same initial name. Keep single-item/no-photo creation and existing-item editing compatible.
- [ ] Before upload, validate shared input and ensure policy acceptance once. Generate stable per-job UUIDs using existing Expo Crypto. For each job: prepare -> createUploadDraft -> confirmPhotoUpload -> saveItem with the same ID and selected audience -> saved. Private target needs no public-sharing transition. After first successful draft creation, reuse its actual collection/category IDs for subsequent jobs, clearing new-name fields; freeze each job's actual request payload before its first create call.
- [ ] Preserve `confirmPhotoUpload`'s server reconciliation. After a lost create response, replay the identical request ID/payload. After a lost final visibility update, use readOwnedItem before retrying; matching visibility confirms the write, without overriding a moderation decision. Do not re-upload or generate another item. A publication/permission failure leaves the photo in a private entry and offers Retry sharing. A file failure before metadata creates no entry. A deleted/inaccessible draft is a terminal job error, not permission to recreate it under a new key.
- [ ] Continue past a file-specific failure; pause the remaining queue on auth failure, quota/rate limit, unavailable service, or loss of network. Preserve safe machine-readable HTTP status/error code in a typed media error so this distinction does not depend on matching English messages. Do not loop automatically on 429s or consume remaining account attempts repeatedly. Keep existing server defaults/production quotas unchanged.
- [ ] Show per-image results and a summary such as “8 saved, 2 need attention”; Retry failed uses existing jobs, and Done refreshes My collections once. Stop after current image lets the current request reconcile, then schedules no more. Closing after failures explains that saved drafts/photos remain and unstarted files must be selected again. An incomplete saved item can be opened in the ordinary editor to finish its photo. Never silently delete successful items on cancel.
- [ ] Guard against duplicate submits, changing owner mid-run, callbacks after unmount, and opening a second picker while one is active. The ten-image rule is a UI operation limit, while each backend request independently enforces authorization/rate/storage/item limits; multiple legitimate operations remain possible.
- [ ] Run `npx tsx --test --test-concurrency=1 tests/batch-upload.test.ts tests/photo-selection.test.ts tests/item-photo.test.ts tests/photo-validation.test.ts tests/backend/upload-draft-requests.test.ts tests/backend/media-budgets.test.ts`, then the batch browser spec. Test Android/iOS pickers separately when available. Commit.

## Task 7 — Integrated verification and deployment handoff

**Modify:** `docs/DEVICE-ACCEPTANCE.md`, `docs/VERIFICATION.md`, `docs/DEPLOYMENT-CHECKPOINT.md`. Update only after evidence is collected.

- [ ] Run `npm run typecheck`, `npm test`, and `npm run check:secrets`. Run a fixture web build with `COLLECTIBLES_BUILD_MODE=fixture` using the established test environment and then `npm run test:e2e`. Do not use invented production keys or relax release validation to make a build pass.
- [ ] Run a real release `npm run build:web` with valid configured public values. Verify the plan's viewport matrix in light/dark/playful themes, with guest/signed-in/demo users, empty/full/partial rows, long usernames, browser zoom, and both axes of phone rotation. The screenshot cases must be visually resolved.
- [ ] Exercise a feed longer than one page; verify next/previous, filters, exhausted pagination, access removal during viewing, report/block actions, current-item likes/follow counts, username links, and close/return position.
- [ ] Exercise batches of 1 and 10; verify 10 distinct item IDs with one image each, one shared collection/category creation, independent later title edits, and correct Posted dates. Simulate each network failure stage, expired session, invalid file, and quota exhaustion. Assert no duplicate rows/media attempts after ambiguous success.
- [ ] Run Android and iOS export/bundle checks using the installed Expo tooling, then physical-device/emulator acceptance for limited photo permission, multiselect, camera, memory pressure, swipes, safe areas, and accessibility. If devices/build credentials are unavailable, mark those checks pending; do not claim native testing passed.
- [ ] Deploy only when implementation is approved for deployment: apply date and request-ledger migrations first; verify functions, grants, triggers, and old-client compatibility; then deploy the frontend. No R2 public domain, CORS expansion, new secret, auth-provider configuration, or mandatory media-function redeployment is expected from this design. If implementation changes a function, deploy/test that change explicitly.
- [ ] Use staging/fixtures for automated writes. Any production smoke test must use an authorized test identity and remove only its own disposable data. Verify latest live build and migration versions, not just a green local test run.
- [ ] Rollback strategy: roll back the frontend first and retain additive columns/ledger. Do not delete user entries or rewrite posted dates. If a migration needs repair, use a forward corrective migration. Record exactly what shipped, what passed, and any remaining device checks.

## Completion criteria / requirement map

| User requirement | Complete when |
| --- | --- |
| 1. Wide layout | Main gallery uses available width; wide screens can exceed four columns; no misplaced scroll region/unused strip. Task 1. |
| 2. Thick viewer scrollbar | Thin themed web thumb, no white track, scroll/keyboard/touch still work. Task 2. |
| 3. Next/previous | Buttons, keyboard, phone swipes, page boundaries, same source sequence, access revalidation. Task 4. |
| 4. Inline social actions | Username left and 48 px like/follow controls right on the same row; date underneath. Task 2. |
| 5. Dates | Legacy acquired snapshots and new successful-upload dates display only in detail; honest labels, safe projection. Task 3. |
| 6. Up to ten uploads | Separate entries, shared initial metadata, partial success, retry-safe creation/upload, no quota bypass. Tasks 5–6. |
| 7. Persistent desktop Collections | Sidebar present across signed-in top-level tabs at >=900 px; mobile Explore/Following remain uncluttered. Task 1. |

**Suggested execution order:** Tasks 1, 2, 3, 4, 5, 6, then 7. Complete and verify one task before moving on. The layout/viewer tasks can be released separately from batch uploads if desired; Tasks 5–6 must ship together after the supporting migration.
