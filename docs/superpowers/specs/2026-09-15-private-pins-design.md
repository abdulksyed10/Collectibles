# Private pin collection MVP

## Approved direction
The user approved building a small private collection app with Supabase, Cloudflare R2, future backend flexibility, and committing source to GitHub without secrets. React Native + Expo is the announced default while the framework question is pending.

## Product
Working title: Pin Keeper. Android/iOS app with a web development preview. Email/password sign-in and sign-up, private named collections, pin title/notes, one photo per pin (with thumbnail), collection filtering and text search, paginated lists, edit and deletion, sign-out. Clear loading, empty, error and unconfigured states. No demo data presented as real saved data. Public discovery/sharing and social features are outside this MVP. All users see only their own data.

## Architecture
Supabase Auth and PostgreSQL; isolated repository functions consumed by app screens. Owner-based row level security, composite owner/collection relationships, indexed pagination. Server-managed R2 media stored in a private bucket. A Supabase Edge Function validates the authenticated owner and upload size/type, stores compressed JPEG and thumbnail, and issues short-lived GET URLs. For this small private beta, bounded uploads pass through the function to enforce hard size limits before storage. This adds upload bandwidth to the function, with direct uploads a later optimization. R2 credentials and service-role keys remain server-only. The app includes only the publishable Supabase configuration.

## Limits and lifecycle
Maximum 50 collections and 500 pins per user, enforced transactionally on the server. Image maximum 2 MiB plus thumbnail maximum 200 KiB. One active image per pin. Media replacement is deferred: delete/re-add the pin photo if required by implementation. Deletion removes R2 objects before database metadata; failures remain retryable. Account deletion removes owned objects and account through the authenticated server endpoint. Private image URLs expire after five minutes. Image caching is memory-only on the client.

## Security
.gitignore precedes local secrets. Placeholder-only examples are committed. Include staged-file secret scanning and CI. Native auth sessions use secure device storage, web preview uses sessionStorage. Database access is tested with two users and anonymous access. R2 endpoint authenticates every request and never accepts arbitrary object keys from clients. No public R2 domain. Deployment and hosting require user-owned project/bucket configuration; do not claim live verification without it.

## Verification
Typecheck, meaningful domain and upload-boundary tests, actual database RLS tests in a disposable PostgreSQL-compatible runtime, Expo compatibility check and production web export. Browser smoke check for responsive app entry and unavailable-configuration behavior. Native app store builds and live Supabase/R2 checks require accounts and are reported separately.
