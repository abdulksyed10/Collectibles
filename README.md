# Collectibles

Collectibles is a React Native + Expo app for recording personal collections. It runs on Android, iOS, and the web.

Each account has collections such as Pins, Bottle caps, or Cards. A collection can contain optional categories, and each item can be private or submitted for public Explore independently of its collection or category.

## Product behavior

- New items are private by default. Notes and acquired dates always stay private.
- An item can be submitted to Explore only after the owner accepts the public-sharing rules. Public submissions require review before they appear.
- A later title, collection, or photo change sends a public item back for review.
- Guest Explore works without an account. Signed-in viewers can report public entries or collections and block a collector from their own Explore view.
- Images only: no videos are accepted. Photos remain in a private Cloudflare R2 bucket and are served through controlled endpoints.
- Items can be added to an existing collection, a new collection/category created during upload, or a lazy General collection.

## Local development

Use Node 22.13.1 or newer.

```sh
npm ci
npm run setup:hooks
npm start
```

The demo works without any services. To run the connected app, copy `.env.example` to the ignored `.env.local` file and configure only client-safe values:

```dotenv
EXPO_PUBLIC_ENABLE_BACKEND=true
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
EXPO_PUBLIC_WEB_URL=https://YOUR_HOSTED_WEB_APP
EXPO_PUBLIC_SUPPORT_EMAIL=support@YOUR_DOMAIN
```

Never add service-role keys, R2 credentials, database passwords, signing keys, or deployment tokens to an `EXPO_PUBLIC_*` variable or Git.

## Public web pages

The web app exposes these static routes once Vercel deploys the current build:

- `/privacy`
- `/terms`
- `/community`
- `/support`
- `/delete-account`

`EXPO_PUBLIC_SUPPORT_EMAIL` must be set before sharing the support and deletion pages with beta users or store reviewers.

## Services and database

The app uses Supabase Auth/PostgreSQL plus private Cloudflare R2 media storage. R2 has previously been confirmed reachable through the deployed public-media endpoint; that does not replace ongoing ownership, deletion, and budget acceptance tests.

Apply migrations forward only. Do not reset the hosted database. The public-safety migrations deliberately move existing public items to a review queue, so follow [the moderation runbook](docs/MODERATION.md) before applying them.

- [Service setup](docs/CONNECT-SERVICES.md)
- [Backend limits and media lifecycle](docs/BACKEND.md)
- [OAuth setup](docs/OAUTH-SETUP.md)
- [Release configuration](docs/RELEASE-CONFIGURATION.md)
- [Operations runbook](docs/OPERATIONS.md)
- [Device acceptance checklist](docs/DEVICE-ACCEPTANCE.md)
- [Implementation and external setup status](docs/IMPLEMENTATION-PROGRESS.md)
- [Store publishing runbook](docs/STORE-PUBLISHING.md)

## Verification

```sh
npm run typecheck
npm test
npm run check:secrets -- --all
npx expo install --check
npm run build:web
```

The backend tests execute migrations and policies in PGlite. They do not replace real Supabase/R2 tests or signed-device tests.

## Store builds

Before the first signed build, choose an Android package name and iOS bundle identifier, configure the Expo project, configure production environment values in EAS, and set up the Apple and Google publisher accounts. The included icon, adaptive icon, splash artwork, automatic appearance, and native plugins are ready for build configuration; identifiers and credentials are intentionally absent.

```sh
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform all --profile production
```

See [release configuration](docs/RELEASE-CONFIGURATION.md) and [store publishing](docs/STORE-PUBLISHING.md) for the required dashboard and device-test sequence.
