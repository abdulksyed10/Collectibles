# Pin Keeper

A React Native + Expo frontend for a private pin-collection app on Android and iOS, with a responsive web preview. **Current phase: backend integration.** You can explore and edit an isolated demo without API keys. Supabase and Cloudflare R2 source is prepared; the database migrations are live, while media deployment and real-account checks are still pending.

## What you can try now

- Sign-in, signup and recovery screens; real account operations wait for backend setup.
- An explicit demo with six sample pins, three collections, and no service calls.
- Private collections, pin names and notes, search, and paginated galleries.
- Camera/library photos compressed to JPEG with a separate thumbnail.
- Edit pin details and delete pins/collections; account-deletion UI is prepared for integration.
- Repository interfaces ready for the planned private Supabase/R2 backend.
- Clear loading, empty, error and unconfigured states.

**Demo changes are temporary:** they reset on exit or reload. Photos selected in the demo are not uploaded; native image tools may leave temporary files in the device cache. Do not use the demo to store a real collection.

The connected version will be an online-first MVP. It does not include public sharing, a social feed, offline synchronization, or photo replacement. Existing photos can be replaced by deleting and re-adding the pin. A saved pin can have no photo while an upload is pending or being retried.

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
```

Get them from Supabase Project Settings / API Keys or the Connect dialog. A publishable key (or legacy `anon` key) is intended to ship inside the app. Row level security provides data protection. The app refuses recognized server keys. Never put service-role keys, R2 credentials, database passwords, or deployment tokens in `EXPO_PUBLIC_*`.

`npm run web` opens the browser development target. `npm start` displays the Expo connection URL for a device/development client. Use an SDK-compatible Expo Go version where supported; a development build can be made when native modules require it. iOS local builds require macOS/Xcode; EAS supports cloud builds.

## Connect the backend

**Next phase:** start with [the integration plan and database relationships](docs/INTEGRATION-PLAN.md). It covers tables, ownership, credentials, the tested backend retry fix, and live acceptance checks. Start with [Connect services](docs/CONNECT-SERVICES.md); the [backend reference](docs/BACKEND.md) contains migration/API/deployment details. The database migrations are applied; media deployment and live app acceptance remain pending. See [the deployment checkpoint](docs/DEPLOYMENT-CHECKPOINT.md).

Apply the checked-in migration to a new/empty project or review it against your existing schema before applying it. Do not reset a shared Supabase database. The frontend needs the tables and the deployed `media` function; supplying the project URL alone does not install them.

For a small invite-only beta, disable new signups in the hosted Supabase Auth settings and create/invite the initial users. Otherwise the app supports confirmed email signup, while all collections remain private. Configure production email delivery before relying on account email flows.

### Password recovery email

In Supabase Authentication / Email Templates / Reset Password, include the token in the email, for example:

```html
<h2>Reset your Pin Keeper password</h2>
<p>Your recovery code is: {{ .Token }}</p>
<p>Enter this code in the app to choose a new password.</p>
```

The app accepts that code with `verifyOtp(type: 'recovery')`, then asks for a new password. Configure the confirmation email's redirect to a real HTTPS page accessible to your testers; after confirming they can return to the app and sign in. Browser recovery links also work where the Supabase redirect URL points to the web app.

### Photo privacy

R2 public access must remain disabled. The Edge Function checks identity and ownership, validates file sizes and JPEG content, and generates signed GET URLs that expire after five minutes. URLs grant temporary access to anyone holding them, so do not share/log them. Images use memory caching and are cleared on sign-out. Native auth sessions use secure device storage; web preview sessions use sessionStorage.

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

To add your own backend later, keep the repository interface and replace its data calls feature by feature. Supabase Auth/PostgreSQL and the same R2 bucket can remain in use during that transition. The initial server limits are 50 collections and 500 pins per account; change them in a migration after measuring usage.
