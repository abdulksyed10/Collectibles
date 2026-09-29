# Collectibles: safer onboarding, public discovery, and mobile release

Status: proposed for user review; implementation is explicitly awaiting the user's go-ahead.
Date: September 28, 2026.

## Purpose and scope

Make the working hosted app easier to start using and safer to open to more people, then prepare Android and iOS builds. Keep one Expo/React Native application using the existing Supabase project and private R2 bucket. Do not reset the database, merge owners' collections, or change existing item visibility as a side effect of organization or appearance changes.

The user requested: stronger authentication/signup abuse protection, guest Explore, inline collection/category creation while adding an item, item-only acquired dates, accurate image-only errors, direct entry viewing, consolidated discovery of similarly named collections, and additional themes. The theme clarification favors colorful and vibrant, with muted styling also acceptable. Recommend retaining the current Classic theme, adding Fun and Dark, and offering a System setting. No separate muted fourth theme in this release.

## Findings from the current repository

- `App.tsx` sends signed-out visitors to `AuthScreen`, except direct shared-collection links. `PublicCatalog` is rendered inside `LibraryScreen`, which starts owner-only queries. Public database functions already grant anonymous read access to their restricted projections.
- Both entry and collection cards call the same collection-opening callback. Full photo viewing currently lives in `SharedCollectionScreen`.
- `LibraryScreen.openAddItem()` opens the collection editor when there are no collections. It does not preserve an item form through that detour.
- Collections have `acquired_on`; the current `Item` model and item editor do not have an acquired date. This requires an additive database migration, not just moving a component.
- `pickPhoto` requests images but neither validates the returned media type nor normalizes picker errors before conversion. Installed Expo web picker source contains the misleading images-and-videos message.
- Authentication calls go directly to Supabase. There is no CAPTCHA token handling or retry countdown in the app. The local Auth configuration is not evidence of the hosted project's actual settings.
- Colors/styles are static exports in `src/components/ui.tsx`; several screens have additional literal colors. `app.json` forces light appearance.
- `android.package`, `ios.bundleIdentifier`, and an EAS project ID are absent. Camera/photo permissions and native secure session storage already exist. Native installation has not been demonstrated by this review.
- This review inspected source and documentation only. No hosted settings, credentials, accounts, or data were changed.

## 1. Authentication and abuse protection

### Recommended beta policy

Use Supabase-enforced CAPTCHA for password sign-in, signup, and password-reset requests, verified email before normal account use, reviewed server rate limits, and a clear retry experience. Use Cloudflare Turnstile because the project already uses Cloudflare; its site key is public, its verification secret belongs only in hosted Auth settings.

An automatic one-hour account lock after five mistakes is not the default recommendation: an attacker who knows an email could repeatedly lock out its owner. Keep password recovery available through its own protected path; do not force a reset solely because someone submitted incorrect passwords.

Supabase's current documentation lists Password Verification Attempt hooks for Teams/Enterprise, and Before User Created hooks for Free/Pro. Confirm the actual project entitlement before choosing a hook. Do not upgrade a paid plan automatically. A UI counter or optional auth proxy cannot enforce an account-wide lock if direct Supabase password requests still work. [Auth hook availability](https://supabase.com/docs/guides/auth/auth-hooks), [password verification hook guidance](https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook).

For the recommended baseline, normalize provider error codes and 429 responses. Honor a valid server Retry-After value when exposed. If no retry duration is supplied, pause this client's form for 60 seconds and clearly say to wait before retrying; this is UX, not an asserted server account lock. Five incorrect submissions within ten minutes can trigger the same local pause, with a new CAPTCHA required for the next attempt. Store only the deadline/count needed by the device, never the password or email in persistent throttle storage. Server CAPTCHA/rate limits remain authoritative if storage is cleared. Do not automatically retry passwords or email sends.

Supabase uses replenishing rate-limit buckets, which can allow retries sooner than a fixed lockout. Its token limit also covers refresh flows: do not reduce it to five requests for all traffic and break valid sessions. Inspect live values, preserve normal refresh headroom, and test shared-network use. [Rate limits](https://supabase.com/docs/guides/auth/rate-limits).

### Signup abuse and cost controls

- Require a valid CAPTCHA and email confirmation; use generic account/recovery errors rather than disclose whether an email exists.
- Add a server-side Before User Created hook with configurable initial beta ceilings: 5 new accounts per source IP per rolling hour, 10 per source IP per rolling 24 hours, and 50 new accounts per rolling 24 hours for the project. These are proposed small-beta defaults, not provider defaults or claims of one person per IP. Test and tune for shared households/schools. A global ceiling may be deliberately exhausted; show a temporary signup pause, keep existing users working, and alert the operator.
- Use the hook's trusted metadata IP, never user-submitted user_metadata or a client device identifier. Store a keyed digest with short retention; do not record passwords, CAPTCHA tokens, raw IPs, or full auth payloads. Reject missing/invalid hook input safely; test IPv4/IPv6 normalization. Counters must serialize concurrent accepted signups, survive account deletion, and not double count a repeated event. Verify hook transaction behavior on a disposable project.
- Keep the existing account/app upload caps and public-media read budget. Multiple emails or a VPN can evade per-account/IP heuristics; app-wide budgets are the last backstop. These do not cap all provider invocation or email charges.
- Vercel's automatic DDoS mitigation protects requests reaching Vercel. Auth, database, and function requests go directly to Supabase, so a Vercel rule alone cannot protect them. Review controls at each actual endpoint; do not add Apache or claim CORS prevents automated clients. [Vercel DDoS protection](https://vercel.com/docs/vercel-firewall/ddos-mitigation).

### Native CAPTCHA and rollout

Implement a shared challenge interface with a web widget and a native WebView adapter loading an HTTPS challenge page under the owned web origin. Restrict navigation/messages to the intended challenge flow, match a per-request nonce, accept only bounded token messages, and reset expired/cancelled challenges. Passwords stay in the native form, outside the WebView. Supabase validates the resulting token; do not verify it twice and accidentally consume a single-use token. Test missing/expired/replayed tokens directly against Auth. Deploy working web/native adapters before enforcing CAPTCHA for active clients. [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Turnstile mobile guidance](https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/).

If the user instead chooses strict account lockout and the required Auth hook is available, propose a separate policy before enabling it: five failures in fifteen minutes, sixty-minute suspension of password sign-in only, fixed expiry that blocked attempts cannot extend, no attacker-triggered logout of active sessions, and a separately tested verified-email recovery path. Keep all counters hook-owned and private. This optional alternative is not part of the recommended baseline.

## 2. Guest Explore and direct viewing

Signed-out visitors can open Explore, browse public items/topics, open an item, and follow its collection link without creating an Auth user. Keep a landing/sign-in route with a Browse Explore action; direct `?view=explore` loads discovery. An anonymous reader is not a Supabase anonymous account.

Move public navigation outside the owner library. Mount owner queries only after a real session is ready. Guests see Sign in/Create account; choosing My collections or Add item presents authentication and then returns to the intended destination. Reading alone never prompts authentication. Future comments/follows will use this same gate, but are not implemented now. Keep the isolated demo available and distinct from real public data.

Separate route targets: Explore, public entry, shared collection, topic, and owner library. Entry cards open a full public entry viewer immediately. Display the image/title and a View collection action. Collection cards still open that specific owner's shared collection. Preserve feed mode, scroll position, and loaded pages on Back; support browser Back, Android Back, and direct links.

Add an anonymous-safe `get_public_entry(p_item_id uuid)` projection so a viewer never has to load every collection page to locate one entry. It returns only item ID/title/photo presence and the actual collection ID/name. Categories, notes, acquired date, emails, raw owner IDs, and storage keys remain private. Validate visibility on open, foreground return, and every public image request; recheck open foreground views at the existing 60-second cadence. Revoked/deleted/hidden content clears from the viewer. Do not retain persistent public-photo caches or prefetch full-size photos. Already downloaded copies cannot be revoked.

Keep pagination bounded (24 entries per page, current 0–20 page limit for beta); use deterministic created_at/id ordering. Preserve the existing 10,000 daily public image read budget until measured traffic justifies a reviewed change. Guest browsing increases reads, so check load, visible-thumbnail fetching, unavailable states, and alerts before advertising it.

## 3. First upload and organization

Recommend a General collection created lazily on the first successful item save that uses it. A new account still has an empty All view; it is not seeded with placeholder data. General is a real owner-only collection with an internal default marker, distinct from the virtual All filter. Users may rename it, move its items, or delete it using existing confirmations. Deleting it permits a new default to be created on a later save. No name-based unique constraint should block the user's own collection names.

Every item retains one parent collection in the database; users do not have to create it separately. Add item always opens the item form:

1. Choose a photo and enter a name.
2. Collection defaults to the current collection when entered from one, or General otherwise. Offer existing collections and New collection inline. Help text: "Collections group related items, like Pins or Bottle caps."
3. Category is optional and belongs to the selected collection. Offer No category, existing child categories, and New category inline. Help text: "Categories help organize items within this collection."
4. Acquired date defaults to today in the user's local calendar; allow changing it or clearing it for an unknown date.
5. Visibility defaults to Private. Save once.

Use one editor with inline sections/substeps rather than stacked modals. Preserve photo/name/notes/date/visibility when creating or cancelling organization choices. Changing collection clears only an incompatible category. Create parent/category/item metadata in one server transaction on final Save, with an owner-scoped request ID for retry safety. Cancellation before Save creates nothing. Upload the photo through the existing media service after metadata commits; a failed photo retains the created item ID and draft so retry cannot duplicate parents/items. If upload success is uncertain, reconcile the existing image before uploading again.

### Date migration

Add nullable `items.acquired_on date` with validation and owner-scoped write grants. Existing items remain unknown (`null`): a collection date is not evidence of when every item was acquired. The new UI supplies today's local date for new items; legacy clients may omit it safely. Remove collection acquired-date controls and display, and stop populating dates on new collection saves. Retain legacy collection/category columns during the compatibility window; remove them only in a separate reviewed cleanup after old clients are retired. Upload ordering continues to use created_at, never acquired_on. Dates stay out of public projections by default.

## 4. Image-only selection

Keep the picker image-only and also validate returned asset type/MIME before image conversion. Browser filters are hints, not security. Normalize picker-thrown unsupported-type errors, PDFs/documents, and videos to exactly: "Unsupported file type. Only images are supported."

Unknown MIME/type metadata must not automatically reject a genuine Android/iOS image. Use supported image decoding as the fallback; an unreadable/corrupt image gets "This image could not be opened. Choose another image." Permission denial, cancellation, excessive size, and upload failures keep distinct handling. Accept usable HEIC/HEIF via device conversion; browsers that cannot decode those formats get actionable format guidance. Do not promise every image codec works everywhere. GIF input, if accepted by the platform, becomes a still photo; no video/animation feature is introduced.

Retain server JPEG decoding/size checks and existing 2 MiB full / 200 KiB thumbnail limits. Disguising a PDF as a JPG must not get bytes into R2. Invalid selections do not create metadata or reserve media-upload budget.

## 5. Consolidated public discovery

Recommend **Entries | Topics** in Explore. Topics are a discovery index, separate from the user's collection → category hierarchy. For example, Pins can include public items from several collectors' separate collections. The label avoids representing a mixed feed as one person's collection. If retaining the label Collections is preferred, the aggregated cards must explicitly say "Community topic" and identify how many separate collections they include.

Suggested first topics: Pins, Pokémon cards, Bottle caps, Boots, and Logos, plus an Other browse bucket. Topic membership is optional and does not determine visibility. Public entries without a recognized topic remain discoverable in Entries and Other; they are never hidden because classification failed.

Use curated aliases with deterministic normalization: Unicode normalization, case folding, trimming, and collapsed whitespace. Examples: pin/pins/my pins → Pins; logo/logos/my logos → Logos. No generic substring, edit-distance, AI, or remove-the-final-s rule. Safety pins and bowling pins should not be merged with wearable pins merely because they contain "pins". Card collections are not automatically Pokémon cards. Operators curate aliases, and owners can correct a collection's topic or choose Other. Rename only recalculates automatic assignments; manual overrides persist.

Keep each actual collection ID, name, owner, category tree, and share URL. Topics add optional `topic_id` and assignment mode to collections plus operator-managed topic/alias tables. No user collection rows or R2 objects are merged. Backfill only safe exact aliases, including for private collections; public queries aggregate only currently eligible public items, never reveal private collection names or inflate counts with private siblings.

Topic cards show eligible item and collection counts and a public cover. A topic opens an aggregated entry grid with a View collections option. Cards in that list open the original shared collection. Public entry viewers always link to the source collection. Apply the same visibility/moderation predicate to topic counts, covers, entry pages, shared pages, and image bytes. Use SQL aggregation before pagination, indexes, and stable IDs; never group just the currently downloaded client page.

## 6. Store-related public-content work

Existing public images are user-generated content even without comments. Before store distribution, add in-app reporting, blocking publishers, a review/removal process, published rules/support contact, and account-deletion checks. These requirements arise from existing public sharing, not from a future social feature. [Apple UGC guidance](https://developer.apple.com/app-store/review/guidelines/#user-generated-content), [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937).

Keep user-selected visibility separate from moderation state. Recommend manual pre-publication review for the small beta: a request to make an item public remains pending until approved. A private item is never published by moderation approval. Reported content is reviewed, not automatically removed solely because many people report it. Any title/photo change after approval must go through the defined re-review path. Migration must explicitly account for existing public items and operator review; do not silently claim that they were reviewed.

Provide a private operator queue and removal action, report deduplication/rate limits, and a public opaque publisher identity solely for display/blocking rather than exposing email/Auth IDs. Blocking filters feeds and disables interactions for the signed-in blocker; it is not a promise to hide otherwise public content from signed-out readers. Guest users can reach a report/contact route; account-backed reporting and blocks require authentication with preserved return context. A guest can hide a publisher locally, with clear device-only semantics, if that experience is included.

Make global removals effective at database projections, topic counts/covers, shared links, and `public-media`, not merely by hiding a React card. Verify existing account deletion deletes media/Auth/metadata; add the externally accessible account deletion request path and disclosures needed for Google Play. [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111).

## 7. Appearance

Appearance choices: System, Classic, Fun, Dark. Classic preserves the current green/cream look. Fun uses brighter accents and playful details with restrained surfaces so collection photographs remain the focus. Dark uses dark surfaces and readable contrast. System follows device/browser dark preference and resolves to Classic or Dark; default new installs to System, with no surprise alteration of stored item data.

Replace static/literal colors with semantic tokens (surface, text, accent, border, danger, overlay) and a shared ThemeProvider. Update buttons, forms, galleries, sheets, loading/error states, date controls, status bar, and Android system bars. Persist the device preference outside authentication storage; visitors can change it too. No account-sync database is needed initially. Test contrast, large text, focus states, screen readers, reduced motion, and photos without color tinting. Make native `userInterfaceStyle` automatic and configure the SDK-compatible system UI integration. Theme selection does not redesign navigation.

## 8. Android/iOS readiness

The same source and backend serve web, Android, and iOS, but a working website is not proof of a working signed native build. Configure stable package/bundle IDs, Expo project ownership, EAS environments, signing, versions, icons/splash assets, permissions, and store metadata. Vercel variables do not automatically populate EAS builds. Only publishable Supabase configuration and CAPTCHA site key go in native public configuration; R2/database/Auth-admin secrets remain server-only.

Verify physical-device camera/library access, limited/denied permissions, Android providers with missing MIME/dimensions, large/rotated HEIC photos, CAPTCHA, OTP recovery/email confirmation, session refresh after background/restart, keyboard avoidance, safe areas, back gestures, date picker, sharing, themes, and deletion. Preserve the current email-code recovery flow unless intentionally changing it. A custom URL scheme already exists; universal/app links require domain association configuration and must not be assumed present.

Begin a device build after the authentication adapters and first-upload changes, before all visual polish, to expose native-only issues early. Finish with an Android AAB for Play testing and an iOS store build for TestFlight; the existing internal APK/ad hoc profile is not equivalent to store distribution. Expo build configuration supports the missing identifiers, but both binaries and their environments need verification. [Expo build configuration](https://docs.expo.dev/build-reference/build-configuration/), [Expo store submission](https://docs.expo.dev/deploy/submit-to-app-stores/).

## Proposed sequence and acceptance

1. Record live Auth/config capabilities and establish a staging/disposable test route.
2. Authentication/CAPTCHA/signup abuse protection; native adapter proof.
3. Image-only validation and first-upload flow, dates, transactional metadata saves.
4. Guest Explore and direct entry viewer, followed by an early signed-device test.
5. Reporting/moderation/blocking and store account lifecycle requirements.
6. Canonical topic discovery, reusing the public visibility/moderation rules.
7. Themes.
8. Full signed-device acceptance, store assets/disclosures, and controlled distribution.

Each implementation stage must have meaningful tests, a deploy/revert sequence, and a recorded checkpoint before moving on. Security, privacy, photo reliability, and native account lifecycle are release gates. Topic grouping and Fun styling can be deferred if they delay a safe beta.

Decisions proposed for the user's go-ahead: CAPTCHA/throttling instead of mandatory one-hour locks; lazy General collection; item dates only; Entries/Topics terminology; curated aliases with owner overrides; manual public-content review for the initial store beta; Classic/Fun/Dark plus System. No implementation or service reconfiguration is authorized by this planning document alone.
