# Social collecting: proposed design

Status: draft for owner review; planning only. No application code or service configuration changed by this document.

Date: 2026-10-09. Companion implementation plan: `../plans/2026-10-09-social-collecting.md`.

## Purpose and decisions

Help collectors find people they know, follow their uploads, share selected items with friends, and like shared items. Preserve private-by-default collections and the current mobile-first interface across web, Android, and iOS.

Requested: unique editable usernames generated initially from the email local part, a one-time username prompt, following and a dedicated feed, friends-only item visibility, relationship management, and item likes. Comments are a later feature.

Confirmed by the owner on 2026-10-09: follows are one-way, and **friends means two people following each other**. Merely following somebody does not grant access to their Friends-only entries. Following someone back is a sharing decision: the UI must explain that both users' existing and future Friends-only entries become accessible. An approved-follower model would offer explicit request approval but add a requests workflow; a separate friend-request graph would duplicate relationship management. Mutual following is the selected first release.

The remaining detailed limits and interface choices below are proposed implementation defaults for review. Changing the relationship model later requires revising storage, authorization, copy, tests, and management actions together.

## Product behavior

Signed-in navigation becomes **My collections | Following | Explore**. Following contains entries from accounts the viewer follows, newest upload first. It includes their public items and, for mutual friends, their Friends-only items. It does not include the viewer's own uploads. Existing uploads become eligible when a person follows someone; edited items do not jump to the top. A small **Friends only** filter within Following can show mutual friends' entries without adding another main tab.

Explore stays accessible to visitors and contains public items only. Its existing Entries / Collections switch and grouped collection topics remain. An aggregated topic such as Pins represents multiple collectors; it has no single creator and must not get a Follow button. Individual entries and individual collectors' collections show `@username` and the relevant Follow / Following / Friends state. The owner sees no Follow button on their own entries. Selecting an item still opens its full entry view directly.

Each username opens a collector profile. A profile shows the username, a follow action, and only entries/collections the viewer may access. Initial profile pages have no custom avatar uploads, biographies, location, or email. Use a themed initials avatar to avoid a new upload surface. Signed-in users can search people by username, with a minimum of two characters, exact matches first, then prefix matches. No email search or address-book import. Visitors can open a shared profile but must sign in to search, follow, or like.

Settings gains Profile and People. People has Following, Followers, Friends, and Blocked lists with username search/filtering within the list and pagination. Actions: follow, unfollow, remove follower, block, unblock. Remove follower deletes only that user's follow toward the owner; if mutual, friendship ends. They can follow again unless blocked. Removing a friend means unfollowing them; explain that this ends Friends-only access in both directions. Unblocking does not recreate follows.

## Usernames and first login

The username is a public handle, never an email address. Keep authentication email private. Example: `alex@example.test` suggests `alex`; another account with the same local part receives `alex_1` or another available numeric suffix. Do not expose the domain, an email hash, or raw Auth account ID.

Rules: store lowercase, 3–30 characters, ASCII letters/digits/underscore, starting with a letter; unique case-insensitively in Postgres. Trim whitespace and an optional leading `@` when editing. Reject invalid characters with useful guidance rather than silently changing a manually chosen name. Server validation is authoritative. Reject reserved names (`admin`, `administrator`, `support`, `moderator`, `collectibles`, `sharecollectibles`, `system`, `deleted`) and terms prohibited by the current moderation list.

Generation happens on the server: strip the domain; lowercase; replace runs of non-ASCII/non-alphanumeric characters with `_`; trim `_`; prefix `u_` if necessary; use `collector` if the result is shorter than three characters, unavailable as a safe base, absent, or from an Apple private-relay address. Truncate to fit a numeric suffix within 30 characters. Try the base, then numeric suffixes using a database sequence and unique-constraint retries, not a client-side availability check. Suffixes need not be consecutive per name. Profiles and relationships use the existing stable public publisher ID, so renaming does not break follows, likes, or profile links. Changing login email does not rename the profile.

Backfill existing accounts with generated handles and a pending introduction marker. For new accounts, initialize the profile on the first authenticated app session using an idempotent RPC; do not add a fragile dependency to Auth signup. Show a focused Settings > Profile sheet once: “Your username is public. Keep this username or choose another.” Actions: Save username and Keep this username. Both persist the completion time in the database. Close/back has the same meaning as Keep, and must persist successfully before considering the prompt complete. A failed save stays retryable. After completion it must not reopen on later logins or another device. Returning to settings manually always allows editing.

The same prompt is recommended once for existing users on their next login. Email prefixes can identify people; communicate that publicly displaying the generated handle is intentional. Generation/backfill must never include emails in logs, migration output, fixtures, or documents. A missing profile gets a neutral Collector label until initialization succeeds; public feeds must not crash.

## Visibility and media

Visibility remains per item, with **Private** selected by default.

| Item audience | Owner | Mutual friend | One-way follower | Other member / visitor |
| --- | --- | --- | --- | --- |
| Private | Yes | No | No | No |
| Friends only | Yes | Yes | No | No |
| Public | Yes | Yes | Yes | Yes |

Non-owner access also requires an active account and eligible moderation state. Collection/category placement never grants access. Collection item counts, covers, profile summaries, and search results must be computed from eligible items only. Notes and acquired dates stay owner-only, including Friends-only items. Friends-only sharing exposes title, collection name, photo, username, upload time, audience badge, and like count.

New mutual friends can see all existing Friends-only items. Unfollowing either way, removing a follower, blocking either way, account deletion, an item becoming private, or moderation removal stops subsequent authorized access. Clear affected visible content immediately after a local action and recheck on focus and every 30 seconds while a restricted entry is open. Server permission checks are authoritative; already downloaded pixels/screenshots cannot be recalled and requests authorized just before a change may finish.

The R2 bucket stays private. The existing anonymous `public-media` endpoint must remain strictly public-only. Friends-only images use a new authenticated binary `member-media` endpoint that checks the current relationship and moderation on each request and returns `Cache-Control: private, no-store`. Do not return reusable R2 signed URLs for friends' images, put tokens in query strings, or issue public redirects. Owner-only media reads and public image delivery keep their existing contracts.

Web loads member images with an authenticated fetch and short-lived object URLs; native loads them with authorization headers. Restricted image components disable persistent caching and release/reset images on logout, account change, relationship changes, and access denial. Thumbnail requests stay thumbnail-sized, full images load only on opening the entry, and the gallery only loads visible/prefetched tiles. Reads consume configurable user and app budgets to protect billing.

## Following, blocking, and safety

Follow/unfollow is idempotent and server authorized. No self-follow. Only the acting user may change their outgoing follows; the followed user may remove an incoming follow. Serialize changes for each pair so simultaneous follows, removals, and blocks cannot resurrect a blocked relationship. Mutual friendship is derived from both follow rows, not stored as an independently editable flag.

Preserve blocking as a personal control, not a global takedown. A block hides that collector from the blocking person's feeds, search, and profile view. It also removes follow relationships in both directions and prevents new follows/likes between the pair while either block exists. That removes Friends-only access for both. Other users can still see the collector's public content, and public material remains available without signing in. Guest device-only blocks remain a display preference and never grant or revoke authenticated permissions.

Extend the existing report, profanity, and admin systems to Friends-only shared items. Only signed-in viewers who can currently access a target can submit a report. Keep **five distinct reporters per target/review cycle** for both items and collections. A collection report requires at least one visible shared item. Reports from public and authorized Friends-only viewers count toward the same target; duplicate reporters do not gain extra votes by changing audience. Review/removal hides the target from all non-owner sharing surfaces, including Following and profile views. Changing visibility must never clear a review/removal state. Admin review access remains explicit, audited, and restricted to reported content; do not grant routine access to private entries.

## Likes

One like per authenticated user per accessible shared item. Allow public and Friends-only items; no self-like or liking private/inaccessible/reviewed/removed items. Store a unique `(item_id, liker_id)` pair. Use a desired-state operation (`liked: true/false`), not an unguarded toggle, so retrying a request cannot reverse the action. Like counts and `likedByMe` come from the server, fetched with each feed page instead of one request per tile. Double taps and slow responses must not create duplicates or negative counts.

Guests see counts on public entries and a sign-in prompt if they press Like or Follow. Counts are visible only to people who can see the entry (and its owner). Do not expose a list of likers initially. Keep historical likes when audience changes or a friendship ends, but hide all item metadata/counts from unauthorized viewers. Account or item deletion removes related likes. Unlike is permitted for one's own existing like even after losing access and returns a generic result without leaking the current count. No notifications or ranking changes in this release.

## Data and access design

Reuse `private.public_publishers` to translate Auth IDs to public collector IDs. Add private tables for profiles, directional follows, likes, and configurable social limits/counters. All public projections omit internal account IDs. Keep existing owner-only RLS on `public.items`, `collections`, and `categories`; widening it would expose notes and other fields through direct REST reads. Serve shared data through narrowly projected database functions with explicit authorization. New functions deny execution by default and grant only the required caller roles. Security-definer functions use an empty search path and qualified identifiers; a client-supplied viewer ID never determines permission.

No extra backend host, public R2 bucket, feed algorithm, or external social provider is needed. Build the Following feed on indexed queries and bounded cursor pagination (24 entries, ordered by upload timestamp and item ID). Include relationships/likes in a single page query. Keep existing Explore RPCs backward compatible and public-only while adding username and social state fields.

Initial configurable limits: 1,000 active follows per account; 60 new follows/hour and 200/day; 300 new likes/hour and 1,000/day; 5 username changes/day; username/profile-search queries 60/minute per member; member-image reads 120/minute and 5,000/day per member plus the existing app-wide image-read budget. Idempotent no-ops do not consume successful-add quotas; unfollow, unlike, remove follower, and unblock remain possible when add quotas are exhausted. Add a global social-writes switch and a separate Friends-sharing switch so rollback can deny restricted access without deleting data. Final limits are product defaults and can be tuned without a client release.

## Release scope and sequencing

1. Profiles, username generation/backfill, first-session initialization, one-time editor, safe collector links/search.
2. Follow graph, People management, and Following with public entries only.
3. Friends audience across database projections, authenticated images, moderation, reporting, owner editing, and shared views; enable only when all access tests pass.
4. Likes and consistent creator/action controls across Explore, Following, shared collections, profiles, and full entry views.
5. Web/native acceptance, documentation, staged backend deployment, and frontend/native releases.

Comments, direct messages, contact imports, push/email notifications, recommendations, and private-account approval workflows are deferred. Useful later additions are private bookmarks, a muted-follow option, and an in-app activity inbox. Comments should be a separate project with comment reporting, moderation, deletion, rate limits, and notifications designed before shipping.

## Acceptance and reference material

Ship only after testing owner, mutual friend, one-way follower, unrelated account, blocked pair, logged-out visitor, and admin against entries, collection covers/counts, direct links, media, likes, and reports. Exercise existing data upgrades, simultaneous username claims, follow/block races, repeated likes, account deletion, two devices, and an old client alongside the new backend.

Official references checked while planning: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Supabase user data](https://supabase.com/docs/guides/auth/managing-user-data). These support keeping email/Auth data private, carefully granting exposed operations, and testing profile creation so it cannot disrupt signup. They do not prescribe this app's proposed social rules.
