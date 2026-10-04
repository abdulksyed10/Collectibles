# Authentication and reliability implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task after the user's go-ahead. Work sequentially in reviewable batches; no delegation is required. Check off steps only with evidence.

**Goal:** Make account access, image retries and the requested Google/Apple sign-in reliable across web, Android and iOS.

**Architecture:** Retain Supabase Auth as the identity authority and existing repository/media boundaries. Isolate platform authentication adapters; share callback validation and error handling. Never add a custom password database or proxy Google login through a WebView.

**Tech stack:** Expo SDK 57, React Native, TypeScript, Supabase Auth/Postgres/Edge Functions, Cloudflare Turnstile, Node tests and Playwright.

**Spec:** `docs/STORE-READINESS-2026-10-04.md`, especially F1–F3, F6–F7 and proposed login scope.

## Global constraints

- Password minimum: 8 characters, at least one uppercase, one lowercase and one digit; symbols optional.
- Preserve existing accounts, item IDs, R2 keys and legacy sharing links. Add forward migrations; never reset production.
- Images only. Keep existing size/count/rate/byte limits and private R2 storage.
- Guest Explore stays available. New items stay private.
- Public keys/configuration can enter Expo builds. R2, database, SMTP, OAuth client secrets, signing credentials and service-role keys cannot.
- No implementation or deployment until the user authorizes the next execution turn. Do not infer a store publication request from permission to implement code.

## Review focus

1. CAPTCHA succeeds, parent rerenders, then token expires: no stale submission or recreation loop (A2).
2. Item metadata commits but photo upload fails or its response is lost: retry preserves exactly one item and its parents (A3).
3. OAuth callback arrives twice or at cold start: exactly one session exchange; foreign/missing-verifier callbacks fail safely (A5).
4. Apple hides email or user uses another address: no email-based takeover or silent collection merge (A6).
5. Provider/R2 outage during deletion: retryable durable work, no false completion or forgotten tokens (A7).

## A1 — Repair the dependency/build baseline

**Modify:** `package.json`, `package-lock.json`, `.gitignore`, `scripts/secret-rules.mjs`, `tests/secrets.test.ts`. **Create:** `docs/DEPENDENCY-REVIEW.md`.

- [ ] Run `git status --short`; preserve user changes. Record HEAD and baseline check results from the review.
- [ ] Run `npx expo install expo@~57.0.26` (or the newer compatible SDK 57 patch recommended at execution time), followed by `npx expo install --check`. Update only required compatible packages.
- [ ] Triage `npm audit --json` and `npm ls braces node-forge uuid --all`. Prefer upstream patch releases. Do not apply `--force`, downgrade Expo/RN, or override a major dependency without API compatibility evidence. Record each remaining advisory, reachable code path, affected runtime/build process, mitigation, and review date.
- [ ] Ignore `credentials.json` and credential-export variants actually used by EAS. Extend filename scanning for EAS credential JSON and arbitrary Google service-account JSON by structure, without printing values. Test `scanFile('credentials.json', fixture)` blocks and public EAS project IDs remain allowed.
- [ ] Run `npm run typecheck`, `npm test`, `npx expo install --check`, `npx expo-doctor`, and the tracked secret scan. Expected: checks green, or a specific documented advisory exception pending owner review. Do not hide compatibility errors with `expo.install.exclude`.
- [ ] Review only the intended diff; commit this batch when implementation is authorized.

## A2 — Stable CAPTCHA on web and native

**Modify:** `src/components/CaptchaChallenge.web.tsx`, `src/components/CaptchaChallenge.native.tsx`, `src/components/CaptchaChallenge.d.ts`, `src/screens/AuthScreen.tsx`, `scripts/serve-preview.mjs` if needed. **Create:** `public/auth/captcha.html`, `public/auth/captcha.js`, `src/auth/captchaMessages.ts`, `tests/captcha-messages.test.ts`, `tests/e2e/captcha.spec.ts`.

**Interfaces:** Preserve `CaptchaChallenge({siteKey,onToken,onError})`. Export `parseCaptchaMessage(value: string, expectedNonce: string): {type:'ready'} | {type:'token';token:string} | {type:'expired'|'error'} | null`. Generate nonces with platform crypto, never as an authentication credential.

- [ ] Add tests: malformed JSON, wrong nonce, wrong event, token length outside 20–4096 => null; valid token => typed message. Test no token after expiry/remount.
- [ ] Add a Playwright stub of the Turnstile API. Assert `render` is called once across input changes and token acceptance, `remove` once on unmount, deliberate reset recreates once, script failure displays Retry. Fail before the fix. Fixture keys/stubs must never enter production builds.
- [ ] On web, store latest callbacks in refs or pass stable callbacks; effect lifetime depends on site key and deliberate reset only. Remove script listeners on cleanup; handle failed loads and bounded timeout. Keep challenges single-use and reset after submission.
- [ ] Host a small standalone HTTPS challenge page at `/auth/captcha.html` with its script in `/auth/captcha.js`. Accept only a site key, nonce and constrained theme from inputs; no secrets, auth tokens, open redirect or arbitrary HTML. Communicate ready/token/expired/error to the native bridge. Challenge dimensions must accommodate interactive mode.
- [ ] Load that page from validated `EXPO_PUBLIC_WEB_URL` in native WebView. Allow the first-party origin, Cloudflare challenge origin and required `about:blank`/`about:srcdoc`; block unrelated navigation/new windows and reject bridge messages from an unexpected top-level origin. Keep the default user agent. Show actionable retry UI on network/load failures.
- [ ] Test page script parses with `node:vm`, allowed navigation rules, expiry while backgrounded and unmount after pending load. In native release builds manually solve managed challenges on Android/iOS; do not automate solving or use production bypass tokens.
- [ ] Verify hosted page is served as HTML, script as JS, and CSP permits exactly the necessary challenge resources. See [Cloudflare mobile implementation](https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/).

## A3 — Retryable item creation and preserved dates

**Modify:** `src/screens/Editors.tsx`, `src/data/repository.ts`, `src/data/demo.ts` if contracts change. **Test:** `tests/e2e/app.spec.ts`, `tests/domain.test.ts`.

**Contract:** `saveItem(draft,id?)` still returns `Item`; use the returned `id`, `collection_id`, `category_id` as the canonical saved placement. `readImages([id])` reconciles uncertain upload completion.

- [ ] Add failing UI cases for General, inline collection, and inline category: first upload returns 503, retry succeeds; assert exactly one draft RPC, no duplicate parent creation, and the same item ID used for upload. Include a server-committed upload whose response is lost.
- [ ] After metadata success, adopt returned placement, clear inline creation flags/names, and add returned/new parent choices or refresh them without discarding the form. Subsequent attempts update only existing metadata and retry/reconcile the photo. If an image already exists after a timeout, show success; do not overwrite a concurrently uploaded photo or repeatedly charge upload reservations.
- [ ] Change date initialization to `item ? item.acquired_on : todayLocalDate()`. Assert editing a cleared date preserves null while a new entry defaults to today.
- [ ] Verify drafts remain accessible after a failed photo, closing refreshes the library, and no image success is claimed while the backend state is unknown. Run relevant browser fixtures against a freshly built fixture export.

## A4 — Hosted auth, rate-limit UX and admission hardening

**Modify:** `src/auth/security.ts`, `src/screens/AuthScreen.tsx`, `src/auth/session.ts`, `supabase/config.toml`, `docs/BACKEND.md`. **Create:** next timestamped migration `*_signup_admission_hardening.sql`, `docs/AUTH-OPERATIONS.md`. **Tests:** `tests/auth-security.test.ts`, `tests/backend/signup-admission.test.ts`.

- [ ] Expand cooldown state by operation (`signin`, `signup`, `recover`, `verify`, `resend`) and enforce corresponding retry deadlines in both the submit handler and button. Use available server Retry-After hints; otherwise use a bounded generic delay. Do not claim this form cooldown prevents direct API attacks.
- [ ] Add explicit validation for missing/null/invalid hook UUID/IP. Preserve idempotency, row locking, default 5/IP/hour, 10/IP/24h, 50/project/24h, pause control and safe errors. Tests cover null fields, concurrent requests, duplicate UUIDs, normalized equivalent IPv6, limit boundaries, and auth-role-only execute permissions.
- [ ] Replace keyed MD5 with actual HMAC-SHA-256 using server-side pgcrypto. Add digest versioning; count both legacy and new digests during the 24-hour transition so deployment does not reset limits. Keep keys private and do not rotate them accidentally with each deployment. Test PGlite extension availability; if unsupported, use local Postgres for the crypto integration test rather than a production-only untested migration.
- [ ] In a disposable/staging environment, configure SMTP, sender DNS (SPF/DKIM/DMARC), confirmation and recovery templates. The recovery UI expects a code; confirm the template includes it. Add an explicit rate-limited resend-confirmation action.
- [ ] Inspect hosted Auth settings and make a narrow configuration change after deployment authorization: enable confirmations (live audit showed auto-confirm on), enforce the stated password rule, verify Turnstile site key matches Supabase secret, attach/enable admission hook, review endpoint-specific rate limits. Avoid blindly pushing an entire local config over unrelated provider settings.
- [ ] Validate server-side rejection of missing/invalid CAPTCHA and weak new passwords using disposable accounts. Verify legitimate email/Google/Apple flows still work and ordinary non-team addresses receive email. Never post real email addresses/passwords/tokens in test logs.

## A5 — Common OAuth callback plumbing and Google

**Create:** `src/auth/oauthCore.ts`, `src/auth/oauth.web.ts`, `src/auth/oauth.native.ts`, `src/auth/oauth.d.ts`, `src/auth/callbacks.ts`, `src/components/SocialSignInButtons.tsx`, `tests/auth-callbacks.test.ts`, `tests/e2e/oauth.spec.ts`. Shared non-platform logic lives in `oauthCore.ts`; imports of `./oauth` resolve to the platform adapter, with matching TypeScript declarations. **Modify:** `src/lib/supabase.ts`, `src/auth/session.ts`, `src/screens/AuthScreen.tsx`, `App.tsx`, app config, example env files, hosting routes.

**Interfaces:** `signInWithProvider(provider:'google'|'apple'): Promise<'completed'|'redirected'|'cancelled'>`; `handleAuthCallback(url:string): Promise<'handled'|'ignored'>`. Platform adapters export the same interface. Supabase is the only source of the authenticated user ID.

- [ ] Install SDK-compatible `expo-auth-session`, `expo-web-browser`, `expo-linking`, and `expo-crypto` when needed. Set Supabase `flowType:'pkce'`; coordinate browser automatic detection versus explicit exchange so each code is exchanged once. Persist the verifier across normal app background/restart using the existing secure storage; do not accept access tokens from arbitrary links.
- [ ] Use exact approved routes: web `https://collectibles-three.vercel.app/auth/callback`; native `<publisher-approved-scheme>://auth/callback`. Keep legacy collection links working. Validate scheme/host/path, require the stored flow context/verifier, deduplicate initial URL and Linking events, clear sensitive callback parameters from browser history, and handle cancelled/expired/error callbacks. Process auth before shared-collection routing.
- [ ] Google web: Supabase `signInWithOAuth`. Native: request OAuth URL with `skipBrowserRedirect:true`, open system auth browser, then exchange returned code. Never use an embedded WebView for Google's sign-in.
- [ ] Google Cloud: create/configure OAuth consent branding and audience, request only identity/email/profile scopes, add testing accounts while unpublished. Create Web OAuth client; enter `https://hoxesktykdwuvunhqnrp.supabase.co/auth/v1/callback` as provider redirect and the app origin where required. Store client ID/secret in Supabase Google provider configuration. The provider callback goes to Supabase; Supabase's redirect allowlist separately contains the app routes.
- [ ] Test success/cancel/denial/missing verifier/duplicate callback/cold start, session refresh and guest return. Test a confirmed email account using Google without creating a second library; follow Supabase identity linking rules, never merge by a client-provided email. Audit earlier auto-confirmed accounts before any linking migration.
- [ ] Document that choosing native Google SDK later adds Android signing fingerprints (including Play App Signing) and iOS client setup; those are not required by the proposed browser-based flow. References: [Supabase Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Expo OAuth](https://docs.expo.dev/guides/authentication/).

## A6 — Apple and safe account linking

**Create:** `src/auth/apple.native.ts`, `src/auth/apple.web.ts`, `tests/apple-auth.test.ts`. **Modify:** social buttons, callback plumbing, app config, `docs/AUTH-OPERATIONS.md`.

- [ ] Install `expo-apple-authentication`; configure plugin and `ios.usesAppleSignIn`. iOS uses the native Apple button/flow when available, a cryptographic raw nonce and the provider-required nonce transformation, then Supabase `signInWithIdToken`. Test nonce mismatch rejection; do not guess hashing behavior—verify SDK and provider contracts together.
- [ ] Web/Android use Apple OAuth through Supabase/system browser using A5. Keep Apple available on these platforms so Hide My Email users can return to the same account.
- [ ] In Apple Developer register the app ID/capability, Services ID for web/Android, associated domains and Supabase callback, signing key and email relay sender. Configure allowed client IDs in Supabase. Keep `.p8` and client-secret JWT server-side. Document secret renewal before expiry for browser OAuth (Apple permits a maximum six-month lifetime).
- [ ] Do not require Apple to send a name on each login. Do not expose relay email/name in Explore. Different email identities remain separate unless the user authenticates and explicitly links them through Supabase; do not offer automatic data merges. If adding an account connections screen, require authentication to both identities, never permit removing the last usable login, and test same-user library continuity.
- [ ] Verify real-device first login, returning login, Hide My Email, cancellation, app restart, web/Android return and provider revocation. Source guidance: [Supabase Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple), [Expo AppleAuthentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

## A7 — Provider-aware account deletion

**Modify:** `supabase/functions/media/service.ts`, `supabase/functions/media/index.ts`, deletion UI and `src/data/repository.ts`. **Create:** `supabase/functions/account-auth/` (authenticated provider-grant handling), next migration `*_provider_revocation_jobs.sql`, provider-specific module and tests, `docs/ACCOUNT-DELETION.md`.

**Interfaces:** `registerAppleGrant({authorizationCode,clientKind})` accepts a current Supabase bearer session and a one-time Apple code; `revokeProviders(ownerId)` is server-only and idempotent. Jobs have `pending`, `complete`, or `needs_attention`, retry count and sanitized error code. Client never sends an authoritative owner ID/provider subject.

- [ ] Determine whether the selected hosted OAuth flow exposes a usable Apple provider token. For native login, exchange the Apple authorization code server-side and verify signed identity, issuer, approved audience and subject against the session's Apple identity before storing a revocable grant. Do not assume deleting a Supabase user revokes Apple.
- [ ] Prove grant registration and revocation in a disposable end-to-end vertical slice before enabling Apple for users. A6's login UI can be developed behind a disabled public feature flag meanwhile. If the hosted browser flow does not supply the required grant, record that blocker and implement a tested provider reauthorization/revocation path before enabling it; do not silently ship an Apple account that cannot complete deletion.
- [ ] Store required provider revocation material encrypted at rest in a private table with server-only encryption key and version; no client read policies or logging. Delete it after successful revocation. Never store raw passwords or unneeded profile scopes.
- [ ] Integrate deletion with the existing owner freeze, R2 retirement and Auth delete. Persist provider revocation work before deleting the identity that binds it. Handle revoked/expired grants, provider outage, R2 failure and duplicate requests. A retry job must remain authorized to complete after Auth deletion without leaving the app account accessible.
- [ ] Show pending versus completed deletion accurately; make support escalation available. Add appropriate recent identity proof where supported without requiring a nonexistent password from Google/Apple-only users. Never treat a refreshed JWT's `iat` alone as proof of recent reauthentication.
- [ ] Test all login methods deleting disposable accounts, removal from every public projection, denied old sessions and inaccessible objects. Test provider outage/retry and purge of encrypted grant after success. Keep private operational tombstone retention documented by Plan B.

## Batch completion record

After each batch update `docs/IMPLEMENTATION-PROGRESS.md` with commit, checked tasks, exact commands/results, service changes (if authorized), unresolved publisher inputs and next task. Keep credentials out. At final handoff, rerun relevant tests, inspect the diff and stop before store publication.
