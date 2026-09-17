# Collectibles

A React Native + Expo app for private collectibles on Android and iOS, with a responsive web preview. The Supabase schema and both private R2 media functions are deployed. Live account and device acceptance checks remain before inviting testers.

## What you can try now

- Sign-in, signup and recovery screens backed by Supabase once you create an account.
- An explicit demo with six sample items across Pins, Pokémon Cards, and Bottle Caps, with no service calls.
- Custom categories for any collectible type, collections within each category, and items within each collection.
- Create and rename categories, move collections between categories, and delete empty categories.
- A private workspace for your own collections plus a paginated Public tab for collections people choose to share.
- Collections start private. Explicitly make one public to share a read-only link; notes and acquired dates stay private.
- Collection acquired dates default to today and can be changed.
- Camera/library photos compressed to JPEG with a separate thumbnail.
- Edit item details and delete items/collections; account-deletion UI is prepared for integration.
- Repository interfaces for Supabase/R2, with isolated demo data.
- Clear loading, empty, error and unconfigured states.

**Demo changes are temporary:** they reset on exit or reload. Photos selected in the demo are not uploaded; native image tools may leave temporary files in the device cache. Do not use the demo to store a real collection.

The connected version will be an online-first MVP with collection sharing. It does not include a social feed, public discovery, offline synchronization, or photo replacement. Existing photos can be replaced by deleting and re-adding the item. A saved item can have no photo while an upload is pending or being retried. Public links require the hosted web app and deployed services; the demo provides a local read-only preview.

## Run locally

Use Node 22.13.1 or newer and npm.

```sh
npm ci
npm run setup:hooks
npm start
```

Open the app and choose **Try the demo**. No `.env.local` is required. `npm run web` starts the browser target. Backend calls are disabled by default even if public keys are already present locally. After changing environment settings, restart development with `npx expo start --clear`; the production web build script clears Metro automatically to avoid reusing an earlier configuration.

For later integration, copy `.env.example` to `.env.local` (`Copy-Item .env.example .env.local` in PowerShell), preserving any existing file. Set only these **client-safe** values after completing the backend checklist:

```dotenv
EXPO_PUBLIC_ENABLE_BACKEND=true
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
EXPO_PUBLIC_WEB_URL=https://YOUR_HOSTED_WEB_APP
```

Get them from Supabase Project Settings / API Keys or the Connect dialog. A publishable key (or legacy `anon` key) is intended to ship inside the app. Row level security provides data protection. The app refuses recognized server keys. Never put service-role keys, R2 credentials, database passwords, or deployment tokens in `EXPO_PUBLIC_*`.

`npm run web` opens the browser development target. `npm start` displays the Expo connection URL for a device/development client. Use an SDK-compatible Expo Go version where supported; a development build can be made when native modules require it. iOS local builds require macOS/Xcode; EAS supports cloud builds.

## Connect the backend

The initial integration is deployed. [Connect services](docs/CONNECT-SERVICES.md) records the remaining R2 browser-CORS and Auth settings; the [backend reference](docs/BACKEND.md) explains the API and limits. See the [deployment checkpoint](docs/DEPLOYMENT-CHECKPOINT.md) for completed checks and remaining live acceptance.

Apply the checked-in migration to a new/empty project or review it against your existing schema before applying it. Do not reset a shared Supabase database. The frontend needs the tables and the deployed `media` function; supplying the project URL alone does not install them.

For a small invite-only beta, disable new signups in the hosted Supabase Auth settings and create/invite the initial users. Otherwise the app supports confirmed email signup. Collections remain private until their owner explicitly saves Public visibility. Configure production email delivery before relying on account email flows.

### Password recovery email

In Supabase Authentication / Email Templates / Reset Password, include the token in the email, for example:

```html
<h2>Reset your Collectibles password</h2>
<p>Your recovery code is: {{ .Token }}</p>
<p>Enter this code in the app to choose a new password.</p>
```

The app accepts that code with `verifyOtp(type: 'recovery')`, then asks for a new password. Configure the confirmation email's redirect to a real HTTPS page accessible to your testers; after confirming they can return to the app and sign in. Browser recovery links also work where the Supabase redirect URL points to the web app.

### Photo privacy

R2 public access must remain disabled. The Edge Function checks identity and ownership, validates file sizes and JPEG content, and generates signed GET URLs that expire after five minutes. URLs grant temporary access to anyone holding them, so do not share/log them. Images use memory caching and are cleared on sign-out. Native auth sessions use secure device storage; web preview sessions use sessionStorage.

Photo uploads are server-limited to 100 active photos per account, 20 attempts per hour and 50 per day per account, and 200 upload attempts per app per day. A 250 MiB lifetime allowance per account and a 1 GiB lifetime allowance for the app include failed or deleted uploads, so storage use cannot silently grow through retries. Anonymous shared-photo views are capped at 10,000 per day. An operator can pause owner uploads or public-photo reads in the private `media_limits` table. These limits are deliberately conservative for a small beta; see [the backend reference](docs/BACKEND.md#upload-and-read-budgets) before raising them.

Public collection readers use a separate `public-media` endpoint. It checks visibility on every request, returns image bytes with no-store headers, and never gives visitors an R2 URL. Making a collection private blocks new public reads; it cannot remove screenshots or copies already downloaded. Shared metadata includes collection name, description, category name, and item names/photos. Item notes, acquired dates, owner IDs and storage keys are excluded. See [sharing setup](docs/COLLECTION-SHARING.md).

## Verification

See [verification results and remaining acceptance checks](docs/VERIFICATION.md).

```sh
npm run typecheck
npm test
node scripts/check-secrets.mjs --all
npx expo install --check
npm run build:web
npx playwright install chromium
npm run test:e2e
```

The default browser check tests the demo, including no service calls and reset on exit. To also run connected UI regressions, build with fixture configuration and enable that test group:

```sh
EXPO_PUBLIC_ENABLE_BACKEND=true EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_fixture_not_a_secret npm run build:web
PLAYWRIGHT_BACKEND_FIXTURE=true npm run test:e2e
```

In PowerShell set those process environment variables with `$env:NAME='value'` before building, then remove them afterward. The browser suite intercepts Auth, database and media network requests: it tests UI behavior, not live service authorization. Backend tests execute the actual migration/policies in PGlite with a test Auth shim and exercise the media lifecycle. They do not replace two-account verification on the real services.

The Deno backend has its own check:

```sh
deno task --config supabase/functions/media/deno.json check
```

To preview the production web export: `npm run preview`, then visit `http://127.0.0.1:4173`.

## Git and secrets

- `.env.local`, `supabase/.env.local`, credentials, native signing files, logs and build outputs are ignored.
- Only empty configuration templates are checked in.
- `npm run setup:hooks` installs this repository's staged-file secret check as the local pre-commit hook.
- GitHub Actions checks all tracked files, types, backend/domain tests, the web build and browser flows.
- Secret scanning is an additional check, not a guarantee; inspect staged changes before pushing. If a real secret is ever published, rotate it immediately, then clean the Git history.

## App-store builds

The repository contains an EAS build skeleton. Before the first store build, choose unique Android package/iOS bundle identifiers, set them in `app.json`, associate your Expo project, and configure the public client values and backend opt-in flag in the appropriate EAS environment after integration. Supply store signing credentials through EAS/provider tooling, never Git.

```sh
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform all --profile production
```

Store publication is separate from this source-code MVP: it needs developer accounts, app icons/screenshots, privacy/support URLs, native-device testing, and store review. Source verification alone does not verify a signed native binary.

## Structure and growth

- `src/screens`: app screens and editors.
- `src/data`: injectable repositories, disposable demo data and gallery state; screens do not construct Supabase queries.
- `src/auth`, `src/lib`: sessions, client configuration and photo preparation.
- `src/domain`: app types and validation.
- `supabase`: migration, authenticated photo endpoint and cleanup script.
- `tests`: domain, real SQL policy/media tests, and browser flows.

The hierarchy is **category → collection → item**. Categories describe collectible types and are customizable: **Pins → Travel souvenirs → Yosemite pin**, **Pokémon Cards → First editions → Charizard**, or **Boots → Vintage → Desert boots**. Each account starts with a Pins category and can rename or remove it. Collections have one required category, and items have one required collection. Moving a collection preserves its items and photo keys.

To add your own backend later, keep the repository interface and replace its data calls feature by feature. Supabase Auth/PostgreSQL and the same R2 bucket can remain in use during that transition. The initial server limits are 20 categories, 50 collections and 500 items per account; change them in a migration after measuring usage.
