# Release configuration

`npm run build:web` now validates **production** configuration before exporting to `dist`. Set these in Vercel as Config/public build values and redeploy:

- `EXPO_PUBLIC_ENABLE_BACKEND=true`
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (real site key, never its secret)

`EXPO_PUBLIC_WEB_URL` is optional for web builds. Leave it blank to use the current browser origin for authentication redirects and sharing. If supplied, it must be a public HTTPS origin such as `https://collectibles-three.vercel.app`, without a path, query or credentials. Register the site's URL in Supabase Auth's URL settings and its hostname in Turnstile. Never put a Supabase project URL here.

Publisher defaults supplied by the owner: Abdul Syed / abdulksyed10@gmail.com. Optional overrides: `EXPO_PUBLIC_PUBLISHER_NAME`, `EXPO_PUBLIC_SUPPORT_EMAIL`. Optional sanitized web analytics uses `EXPO_PUBLIC_ENABLE_WEB_ANALYTICS=true`; default is off and native builds never mount it.

## Native identity

`app.config.js` reads the following public build-time identifiers. Choose permanent identifiers before the first submission; none have been guessed or registered:

- `APP_ANDROID_PACKAGE`
- `APP_IOS_BUNDLE_IDENTIFIER`
- `EXPO_OWNER`
- `EAS_PROJECT_ID` (existing EAS project UUID)

Set client config separately in **EAS preview and production** environments. Vercel variables do not carry into EAS. The preview profile builds an internal APK. Production builds signed AAB/IPA and auto-increments remote build numbers. `eas-build-post-install` runs the native release validator before compilation.

Android and iOS **require** `EXPO_PUBLIC_WEB_URL=https://collectibles-three.vercel.app` in both EAS environments. Native apps do not have a browser origin; this URL hosts their CAPTCHA page and shared collection links. The web-only fallback does not relax native validation.

Splash artwork is configured through the SDK-compatible `expo-splash-screen` plugin, as recommended in [Expo's splash-screen documentation](https://docs.expo.dev/versions/latest/sdk/splash-screen/). `app.config.js` extends Expo's resolved `config`, including `app.json`. CI runs the pinned Expo Doctor version as well as dependency compatibility and all-platform bundle exports.

## Social login

Leave `EXPO_PUBLIC_ENABLE_SOCIAL_LOGIN=false` until provider dashboards and disposable-account tests pass. Native iOS Apple additionally uses `EXPO_PUBLIC_APPLE_NATIVE_CLIENT_ID`, matching the bundle ID. Google uses Supabase PKCE OAuth.

Apple web/Android OAuth is independently disabled by `EXPO_PUBLIC_ENABLE_APPLE_BROWSER_LOGIN=false`. Enable it only after confirming that your Supabase Apple flow returns a usable `provider_refresh_token`, which is registered and identity-verified server-side. Missing token fails sign-in safely; it is not silently accepted without a revocable grant. `EXPO_PUBLIC_APPLE_SERVICE_ID` must match the web Services ID. See OAUTH-SETUP.md and OPERATIONS.md.

## Local and CI fixture exports

Fixture/demo builds must opt in explicitly with `COLLECTIBLES_BUILD_MODE=fixture` or `demo`. CI also uses `EXPO_NO_DOTENV=1` and synthetic values. Do not set fixture/demo mode in Vercel or EAS release environments. The normal production export rejects absent/placeholder credentials, disabled backend, insecure hosted URLs and missing/test CAPTCHA keys. Native releases additionally reject missing/permanent app IDs and EAS UUIDs.

Secret files remain excluded by `.gitignore`; no `.easignore` overrides them. Before a store build, inspect the EAS archive file list (not secret contents) and verify no `.env.local`, Supabase private env, signing keys, service account JSON or credentials files appear.

A passing configuration check means values have the expected shape. It does not confirm provider setup, a successful native build, store approval or on-device behavior.
