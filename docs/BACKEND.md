# Private backend

**Integration in progress.** The frontend and backend source are prepared; the user has created Supabase and R2 resources. The upload-retry race is fixed and locally tested. Hosted database migrations are applied and their schema/policies verified. Function deployment and real-account verification still need completion. Start with [Connect services](CONNECT-SERVICES.md).

This backend requires a user-owned Supabase project and a **private** Cloudflare R2 bucket. Source and local tests do not provision or verify either service.

## Deploy

1. Create a Supabase project. Link the Supabase CLI, review `supabase db push --dry-run`, then run `supabase db push`. Apply `202609150001_private_pins.sql`, `202609160001_media_attempts.sql`, then `202609160002_collectibles_hierarchy.sql`. The last migration preserves existing records, renames pin tables/columns to generic items, and places existing collections under their owner's Pins category. Deploy the matching item-based function and cleanup code after migration; the old pin-based API is incompatible. When upgrading an existing deployment, pause media traffic until the migration, updated function and cleanup script are all in place.
2. In Authentication, configure the production app/site redirect URLs and email delivery. Keep email confirmation enabled. For an invite beta, disable public signup and invite users through the dashboard. The checked-in local config permits signup; hosted dashboard settings must be configured separately.
3. Create an R2 bucket. Disable its `r2.dev` URL and all public custom domains. Create an R2 API token with object read/write permission restricted to this bucket. Do not give these credentials to the app.
4. Copy `supabase/.env.example` to ignored `supabase/.env.local` and fill in the server configuration. Set Edge Function secrets from that file: `supabase secrets set --env-file supabase/.env.local`. Never pass secrets in a committed command or paste them into a task.
5. Deploy `supabase functions deploy media`. JWT verification is performed inside the function with Supabase Auth `getUser(token)`; `verify_jwt=false` avoids the legacy gateway verifier rejecting new asymmetric JWTs. It does **not** permit unauthenticated actions.
6. Configure the mobile app with only the Supabase URL and publishable/anonymous key described in the root README.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically supplied to hosted Edge Functions. `SUPABASE_DB_URL` is also supplied by hosted Supabase. Set `MEDIA_DATABASE_URL` to the project's transaction pooler URL if its default direct connection is unavailable or unsuitable. The database connection must be server-only. Postgres.js disables prepared statements for transaction pooling and keeps one connection per isolate. Hosted connections verify TLS. Local development must explicitly set `MEDIA_ALLOW_LOCAL_DATABASE=true` with a loopback database hostname.

The default database credential is powerful. For narrower production access, create a dedicated login role with the grants documented at the bottom of the migration and use its pooler URL as `MEDIA_DATABASE_URL`. The Auth admin key remains necessary only to validate sessions and delete the authenticated account.

## HTTP interface

POST `/functions/v1/media` with `Authorization: Bearer <user access token>` and `Content-Type: application/json`. Browser origins must match `MEDIA_ALLOWED_ORIGINS` exactly; native requests can omit Origin. All responses use `Cache-Control: no-store`.

| Request JSON | Success JSON |
| --- | --- |
| `{ "action":"upload", "itemId":"<uuid>", "imageBase64":"<raw JPEG base64>", "thumbnailBase64":"<raw JPEG base64>" }` | `{ "ok":true }` |
| `{ "action":"read", "itemIds":["<uuid>"] }` | `{ "images":[{ "itemId":"<uuid>", "url":"<signed GET>", "thumbnailUrl":"<signed GET>", "expiresAt":"<ISO timestamp>" }] }` |
| `{ "action":"delete-item", "itemId":"<uuid>" }` | `{ "ok":true }` |
| `{ "action":"delete-collection", "collectionId":"<uuid>" }` | `{ "ok":true }` |
| `{ "action":"delete-account" }` | `{ "ok":true }` |

Requests cannot provide object keys or owner IDs. Read accepts at most 100 IDs; missing, foreign and photo-less items are omitted. Signed URLs expire after 300 seconds and are bearer capabilities during that time. Never log or persist them. Upload accepts raw base64 (no data URL prefix), one JPEG up to 2 MiB and one JPEG thumbnail up to 200 KiB. Full images are limited to 4096 pixels per side and 6 megapixels; thumbnails to 512 pixels per side and 0.3 megapixels. The decoder has an additional 64 MiB memory ceiling. Images are decoded for format validation. Metadata/exif stripping is the client's image export responsibility.

Failures are JSON `{ "error":"<safe message>", "code":"<stable code>" }`. Typical statuses: 400 invalid input, 401 invalid session, 403 blocked Origin, 404 missing owned target, 409 photo already exists/account deletion in progress, 413 oversized body/image, 415 non-JSON, 503 storage/database failure. Retry a failed deletion. A photo cannot be replaced: delete the item and add it again. A failed upload without a committed `item_images` row can be retried. A lost successful upload response can produce 409 on retry; refresh the item to confirm its photo.

## Ownership, quotas and serialization

Client `categories`, `collections` and `items` inserts default `owner_id` to `auth.uid()`. Clients can read their own categories, collections, items and image metadata, edit permitted text/parent columns, and insert their own metadata. Anonymous users have no table privileges. RLS and composite foreign keys reject foreign parents and ownership reassignment. Only the server can write image rows or delete collections/items. Clients can delete empty categories; the foreign key blocks deleting a category containing collections. Every new Auth user gets a starter Pins category, which can be renamed or deleted.

Each user has a private counter/lock row. Database triggers atomically enforce **20 categories, 50 collections and 500 items**, including direct REST inserts and concurrent requests. Client inserts and edits lock that row before acquiring metadata row locks; server media operations take locks in the same order and hold them across storage work. Reassigning an item to an owned collection therefore cannot race collection deletion. The server never trusts a supplied owner ID.

Each upload request reserves separate keys containing a new attempt UUID in a durable private inventory transaction **before** putting objects. A late completion of an earlier failed request cannot overwrite the keys used by a successful retry. Legacy image keys remain readable. It then holds the owner lock, rechecks ownership/photo absence, uploads both objects, and commits image metadata. Two simultaneous uploads cannot both succeed. Failed puts retain the reservation, so retry/deletion can find partial objects. Deletion enumerates every attempt and removes its full/thumbnail keys before deleting metadata; storage failures roll back metadata deletion. Missing owned delete targets return success so normal retries are idempotent. Account deletion first removes all owned media and freezes further writes, then calls Supabase Auth to delete that same user. If Auth fails, the account remains frozen and the delete-account action can be retried.

## Crash cleanup

R2 and PostgreSQL do not share a transaction. If a process is killed while a PUT is in flight, the remote PUT can finish after the database lock is released. Durable inventory tombstones cover that failure window; they deliberately survive item/account deletion and prevent retired item IDs being reused. They contain only owner/item/attempt UUIDs, object keys and timestamps.

Run the bundled operator cleanup script from a trusted environment with the same R2 and database secrets, for example every day:

```sh
deno run --env-file=supabase/.env.local --allow-env --allow-net --config=supabase/functions/media/deno.json supabase/scripts/cleanup-media.ts
```

It removes retired keys after a 15-minute settling interval and abandoned partial uploads after a day, using the same owner lock. It skips the exact keys referenced by a committed active image while still cleaning abandoned attempts belonging to that same item. Tombstones stay for future sweeps and ID retirement. Schedule this command in the operator's existing job runner; source alone does not install a schedule. Monitor failures. The app's delete actions also retry ordinary storage failures immediately; the sweep covers abnormal termination. Do not purge inventory rows without reconciling the private bucket.

## CORS and storage

`MEDIA_ALLOWED_ORIGINS` is a comma-separated exact list, such as `http://localhost:8081,https://items.example.com`. Configure the R2 bucket CORS rule to allow only those web origins, methods `GET` and `HEAD`, and response header `ETag`. Uploads go through the function, so R2 does not need browser PUT permission. CORS is a browser boundary; Auth and RLS enforce ownership. Signed responses and uploaded objects use private/no-store caching directives. Client image components must use memory-only caching.

See [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) and [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/) for provider setup details.

## Verification

`npm test` runs actual migration/RLS/grant/quota tests in PGlite with stub Auth users and roles, plus request limits, JPEG validation and media lifecycle tests. PGlite is a local PostgreSQL-compatible engine, not a live Supabase deployment or a multi-connection concurrency test. `deno task --config supabase/functions/media/deno.json check` checks server TypeScript separately from Expo.

Before inviting users, verify on the real services with two accounts: A cannot read/update/sign/delete B's item; anonymous requests fail; foreign collection reassignment fails; oversized and invalid images fail; duplicate uploads produce one image; upload versus collection/account deletion stays serialized; R2 errors leave deletions retryable; deleted keys return 404; bucket public access is disabled; signed URLs expire; account deletion removes Auth and metadata; the cleanup job runs successfully. Never use production user data for these checks.
