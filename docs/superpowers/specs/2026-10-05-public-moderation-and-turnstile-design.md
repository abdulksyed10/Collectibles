# Public Moderation and Turnstile Design

## Goal

Keep public collecting useful and open while giving signed-in members an abuse-resistant reporting path, automatically hiding content after five independent reports, and giving the designated administrator a secure review surface.

## Decisions

- Public entries publish to Explore immediately. There is no manual pre-publication queue.
- Only authenticated users can report. The guest report endpoint is removed from the product flow and disabled server-side.
- A reporter can contribute one active report to a target item or collection. Changing the reason or waiting for a new day does not create another vote.
- Five distinct authenticated reporter IDs on one target automatically move it to `review`.
- An item in `review` is excluded from Explore, shared collection pages, public topics, and public media.
- A collection in `review` excludes the collection and every one of its public items from those same public surfaces. The owner retains private access.
- The threshold is stored in a private configuration table with an initial value of `5`, rather than embedded in application code.
- The first report only records a report. It does not change public visibility.
- Reporting cannot reveal whether an unavailable target exists, and owners cannot report their own content.
- Reporters remain anonymous to content owners and to the client admin page. The queue exposes counts and reason summaries, not reporter IDs or raw report details.
- A restore action resolves the reports that triggered the review state before republishing. New reports can trigger a later review cycle.

## Publication model

`private.item_publication` remains the authoritative record for entry publication but uses `published`, `review`, and `removed` states. Private entries are represented by `public.items.visibility = 'private'`; they do not need a publication record.

`private.collection_publication` records a collection-level public state. A collection defaults to `published` when absent, so a private collection does not acquire public metadata until it has a public entry. Its `review` and `removed` states suppress all otherwise-public entries in that collection.

`private.visible_public_items` is the only public eligibility projection. Every public RPC, shared page, topic query, and public-media lookup continues to consume this view. The view accepts only an entry in `published` state whose collection is also in `published` state.

## Reporting and review data

`private.public_content_reports` records a signed-in reporter, target, reason, bounded optional details, lifecycle status, and review cycle. Partial uniqueness enforces one active report per reporter and target. Database functions count distinct reporter IDs while holding the target row lock, then atomically move the item or collection to `review` at the configured threshold.

The report function accepts exactly one target, validates that it is currently public, applies per-account rate limits, and returns one non-sensitive acknowledgement for unavailable, blocked, own, or duplicate targets. It never accepts a reporter ID from the client.

## Admin access and review queue

`private.app_admins` is the source of truth for administrator authorization. A controlled bootstrap script grants the role only to the `auth.users` record matching `abdulksyed10@gmail.com`; it fails if that user does not exist or is ambiguous. No browser code grants privileges based on an email string.

Authenticated admin RPCs provide a minimal context flag, paginated queue, and actions to restore or permanently remove items and collections. They enforce `private.is_app_admin(auth.uid())` in the database. Non-admin callers receive no queue data.

The mobile-first admin page is reachable only to an authorized session and is not linked for other accounts. It presents target type, public-facing title, owner public identifier, report count, reason summary, time hidden, and safe thumbnail preview. Review-media thumbnails are delivered by the existing authenticated media Edge Function only after it verifies the caller's admin role; the public image proxy never serves review-only content.

## Public-text moderation

The database contains a private, versioned blocked-term list and normalization helper. Normalization lowercases Unicode-compatible text, removes invisible separator characters, and normalizes common leetspeak before boundary-aware matching.

Server-side triggers and write functions reject blocked public-facing text when:

- creating or changing a public item title;
- making an item public;
- changing a collection name that contains public items; or
- changing a category name referenced by public items.

Private titles, notes, collections, and categories are not screened merely because they are stored. Image moderation remains based on reports and administrator review.

## Turnstile behavior

The web and native CAPTCHA bridges use explicit execution. Entering an auth screen does not start a challenge. A valid form submission starts exactly one attempt; the UI changes to a checking state and submits after it receives a fresh token. The widget uses interaction-only appearance and manual retry/expiration handling. It is shown only when Cloudflare requires interaction or when the person chooses to retry.

Tokens remain single-use. Each failed authentication attempt clears the token and requires a deliberate new submit. The server-side Turnstile secret remains an Edge Function/Supabase secret; the public site key remains a public Vercel/EAS build configuration value.

## Non-goals

- Automated image classification, comments, and broader social moderation are out of scope.
- Collection-level reporting does not delete private data.
- The application does not expose reporter identity, moderation notes, R2 credentials, or a service-role key.

## Rollout and verification

Apply the new migration only after its PGlite regression suite passes. Deploy the updated media and public-safety functions before enabling the matching app release. Grant the initial admin role only after the designated Supabase account exists. Validate the five-reporter threshold with independent accounts, then confirm Explore, shared pages, topics, and public-media all reject review-state content.
