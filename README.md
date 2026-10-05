# Collectibles

Collectibles is a private-by-default catalog for the things people collect. It is built with Expo/React Native for web, Android, and iOS, Supabase for identity and data, and a private Cloudflare R2 bucket for images.

## Sharing and safety

- Entries stay private until their owner makes each entry public.
- Public entries appear in Explore immediately. Five reports from distinct signed-in members hide an entry or collection and send it to the protected admin review queue.
- Guests can browse Explore and block a collector on their device; signing in is required to report.
- Basic server-side profanity screening applies only to public titles, collection names, and category names. Private notes and private entries are not scanned.

See [Moderation](docs/MODERATION.md) for the review process and [Backend setup](docs/BACKEND.md) for deployment and service configuration.

## Local setup

Copy `.env.example` to `.env.local` and `supabase/.env.example` to `supabase/.env.local`. Both local files are ignored by Git. Never add service-role, database, R2, or Turnstile secret values to `EXPO_PUBLIC_*` variables.

`EXPO_PUBLIC_SUPPORT_EMAIL` must be set before sharing the support and deletion pages with beta users or store reviewers.

```powershell
npm ci
npm run typecheck
npm test
npm run web
```

## Deploying the backend

Apply migrations forward only. Do not reset the hosted database. Deploy the Edge Functions after applying the migrations, then grant the initial administrator through the ignored local environment:

```powershell
npx tsx supabase/scripts/grant-admin.ts abdulksyed10@gmail.com
```

Use [MODERATION.md](docs/MODERATION.md) for the exact release order and operational checks.

## Native builds

```powershell
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile preview
```