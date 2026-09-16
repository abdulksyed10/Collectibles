# Connect Supabase and Cloudflare R2

## 1. Fill the ignored local configuration

The frontend's `.env.local` already has the Supabase URL and publishable key. Leave `EXPO_PUBLIC_ENABLE_BACKEND` disabled until the schema and function are ready.

In `supabase/.env.local`, fill:

| Field | Where to find it |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account ID (not the bucket name) |
| `R2_BUCKET_NAME` | Name of the existing private bucket |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 S3 API credentials from a token restricted to object read/write in this bucket |
| `MEDIA_DATABASE_URL` | Supabase **Connect → Transaction pooler → URI**, with your database password substituted |
| `MEDIA_ALLOWED_ORIGINS` | Exact browser origins; local defaults are included |

The database URI is server-only. URL-encode special characters in its password; do not paste it into chat or shell command arguments. Native Android/iOS requests do not need a browser origin. The public mobile key cannot deploy migrations or replace database credentials.

Run `npm run check:backend-config` to see which entries are present without displaying values. Both local files are ignored by Git. Hosted Supabase supplies the Auth admin credentials automatically; never put them or the R2 keys in the mobile environment.

## 2. Sign into the installed CLI

In the project terminal:

```powershell
npx supabase login
```

Complete the browser sign-in. This grants the CLI access to manage your Supabase project. Do not send the login token in chat.

## 3. Apply the database migrations

The target project reference is `hoxesktykdwuvunhqnrp`. Inspect its existing tables and migration history first; preserve unrelated data. There is no need to reset the project.

```powershell
npx supabase link --project-ref hoxesktykdwuvunhqnrp
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Apply the files in timestamp order. The initial migration creates tables, relationships, indexes, owner policies and quotas; the follow-up migration supports isolated photo-upload attempts. Prefer the CLI so migration history is recorded. Review any pre-existing table-name conflicts before applying.

## 4. Configure R2 privacy and browser access

Keep **Public Development URL (`r2.dev`) disabled** and remove any public custom-domain access for this private bucket. The app reads images with temporary signed URLs.

Add this bucket CORS policy for local development, retaining any intentionally shared bucket configuration after review:

```json
[
  {
    "AllowedOrigins": ["http://localhost:8081", "http://127.0.0.1:4173"],
    "AllowedMethods": ["GET", "HEAD"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add the real web origin before hosting a browser version, and keep it in `MEDIA_ALLOWED_ORIGINS` too. Mobile app requests do not need CORS. Uploads pass through the authenticated media function, so direct browser PUT permission is unnecessary.

## 5. Deploy the media function

After local tests and migration checks pass:

```powershell
npx supabase secrets set --env-file supabase/.env.local --project-ref hoxesktykdwuvunhqnrp
npx supabase functions deploy media --project-ref hoxesktykdwuvunhqnrp --use-api
```

The function validates user sessions itself and rejects unauthenticated requests. It handles photos, signed read URLs, deletions and account cleanup. `--use-api` bundles on Supabase, so deployment does not require a running local Docker stack.

## 6. Configure Auth and test live behavior

- Configure signups/invites, email confirmation, a real confirmation redirect and email delivery for testers.
- Use the recovery-code email template in the root README. Match the hosted password minimum to the app's validation (at least eight characters).
- Verify with two disposable test accounts: each can manage its own collection and cannot read/edit/sign/delete the other's records or photos.
- Check JPEG uploads, expired URLs, failed-upload retries, collection/account deletion and cleanup of abandoned attempts.
- Schedule the cleanup script from a trusted server job runner, using server secrets. See `BACKEND.md`.
- Generate client database types after migrations, enable `EXPO_PUBLIC_ENABLE_BACKEND=true` locally, and restart with `npx expo start --clear`.

Then test installed Android/iOS development builds, camera permissions and session persistence. Store publication follows after native testing, developer accounts, signing, icons, privacy/support pages and review.

Provider references: [Supabase CLI migrations](https://supabase.com/docs/reference/cli/supabase-db-push), [function deployment](https://supabase.com/docs/guides/functions/deploy), [server secrets](https://supabase.com/docs/guides/functions/secrets), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).
