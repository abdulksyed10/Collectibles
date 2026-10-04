# Collectibles: store readiness review and implementation specification

Reviewed October 4, 2026 against commit `67dd19d` on `codex/private-pin-mvp`. This document supersedes older launch checklists where they disagree. **Status: working web app; not yet ready for public App Store / Google Play submission.** No application code, hosted settings, user records, or dependencies were changed during this review.

## Evidence and limits

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 82 passed, 0 failed |
| `node scripts/check-secrets.mjs --all` | Passed for 121 tracked files; this checks the index, not all Git history or external dashboards |
| `npx expo install --check` | Failed: installed Expo `57.0.25`; recommended patch `~57.0.26` |
| `npx expo-doctor` | 20/21 checks passed; same patch mismatch |
| `npm audit` | 24 affected packages: 17 high, 7 moderate, 0 critical; three underlying advisories propagated through dependencies |
| Native CAPTCHA script parsing | Reproduced `SyntaxError: Unexpected token ')'` by extracting its HTML template, substituting dummy values, and parsing the inline script with `node:vm` |
| Live public topics | Supabase RPC returned HTTP 200 and eight groups |
| Live public thumbnail | `public-media` returned HTTP 200, valid JPEG bytes, `image/jpeg`, and `private, no-store, max-age=0` |
| Live public Auth settings | Email provider enabled; `mailer_autoconfirm: true`; signup enabled; Google/Apple not enabled |

The thumbnail confirms that the deployed public media path works; current source reads those bytes from R2. R2 is connected. This does **not** newly verify bucket public-access settings, upload credentials, deletion, or ownership isolation against live accounts. Those require the release acceptance checks below. The review did not create accounts, send email, run attack/load tests, run signed native builds, or repeat browser fixture tests. Automated backend tests use PGlite and fake storage, not the hosted production database. SMTP, CAPTCHA enforcement, server password composition, signup-hook activation, schedules, and billing settings remain unverified in the dashboards.

## Findings, in implementation order

### F1 — Native CAPTCHA is broken; web challenge lifecycle is unstable (release blocker)

- `src/components/CaptchaChallenge.native.tsx:10`: both error callbacks omit the closing object brace inside `JSON.stringify`. TypeScript cannot catch syntax embedded in a string. The parse failure is reproduced.
- Native HTML currently loads without a real hosted HTTPS page. Use a first-party hosted challenge page and the WebView setup supported by [Cloudflare's mobile guide](https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/). Test allowed origins, challenge expansion, expiry, cancellation, and app resume on physical devices.
- `src/components/CaptchaChallenge.web.tsx:45` depends on callback identities; `src/screens/AuthScreen.tsx:83` creates those callbacks inline. Typing or accepting a token rerenders the parent and removes/recreates the widget. This is a source-level finding; no live challenge was solved during this audit.
- Keep one widget per deliberate challenge cycle. Add actionable loading/failure/retry states. Never bypass server CAPTCHA to make tests pass.

### F2 — Live email verification differs from source (release blocker)

The live Auth settings endpoint returned `mailer_autoconfirm: true`, which means email signup is currently auto-confirmed. `supabase/config.toml:21` says confirmations should be enabled. Repository configuration is not proof of hosted configuration.

Configure and verify custom SMTP before requiring email confirmation. Then enable confirmations, validate server password rules (8+ characters, uppercase, lowercase, digit; no symbol requirement), and test confirmation/recovery with ordinary non-team addresses. The default Supabase email service is restricted and unsuitable for general beta users. See [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp) and [password settings](https://supabase.com/docs/guides/auth/password-security).

Do not retroactively delete or invalidate existing accounts. Turning on confirmations does not establish that earlier users proved email ownership. Do not silently merge legacy email accounts into social accounts without checking their provenance; require proof before any manual link.

### F3 — Upload retry can become stuck after inline collection/category creation (important functionality bug)

`src/screens/Editors.tsx:100` remembers the saved item ID but does not adopt its returned collection/category IDs or clear inline-creation state. On a photo failure, retry uses the update branch in `src/data/repository.ts:103`, which rejects a missing collection ID or any new collection/category name. General and newly created placements are affected. Save the canonical returned placement before attempting the photo, refresh selector options, and test retry after both a failed upload and a lost success response. A retry must not create another item or duplicate parents.

`src/screens/Editors.tsx:70` also replaces an existing intentionally empty acquired date with today when editing. Default only new items to today; preserve `null` on existing items.

### F4 — Explore lacks content safety controls (public-store blocker)

There are no report, block, moderation queue, or removal workflows. Public photo sharing is user-generated content even without comments or messaging. [Apple guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) and [Google's UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en) require safeguards for these experiences.

Recommended small-beta design: public submissions enter a human review queue before becoming visible; reporting and blocking remain available after approval. Keep private entries private and outside the public moderation queue. Use server-side approval/removal rules across entries, grouped topics, shared links, counts, covers, and photo bytes. Do not mistake hiding a card in React for removing its public availability. Supply a monitored contact and clear community rules.

This is a proposed change in public-publishing behavior: the owner chooses Public, sees “Pending review,” and the entry appears in Explore after approval. Existing public entries need a one-time review; do not silently grandfather them or delete them.

### F5 — Legal/support/deletion surfaces are incomplete (public-store blocker)

In-app account deletion already exists; build on it. Add public `/privacy`, `/terms`, `/community`, `/support`, and `/delete-account` pages and in-app links. Google requires an external account-deletion route as well as an in-app path. The web page must actually let people request deletion without reinstalling. [Google deletion rules](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Audit retained `private.media_inventory` tombstones, budget counters, signup event digests, backups, auth/audit logs and their retention. The current deletion text promises every photo is deleted, but late uploads and storage outages require retries/cleanup. Explain the actual deletion lifecycle and narrowly retained operational records. When Apple login is added, revoke Apple's authorization as part of account deletion. [Apple deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

### F6 — Auth abuse controls need server verification and small repairs (before unrestricted signup)

- Five failed credentials pause the current form for 60 seconds. This is a UX cooldown, not an account lock and not resistant to restarting or direct API calls. A forced one-hour email-based account lock also lets an attacker lock out someone else; prefer CAPTCHA, server rate limits, and controlled admission.
- Current cooldown enforcement only applies to sign-in, even when signup/recovery gets a rate-limit error. Apply retry delays to the operation that was throttled, including verification/resend; use server hints where available.
- Signup admission is disabled by default in its migration. Verify the hook is attached and enabled, with a real server-only key. Add explicit checks for missing/null metadata; SQL casts of NULL do not enter the current exception handler.
- `hmac_key` currently feeds keyed MD5, not HMAC. Upgrade to HMAC-SHA-256 with a versioned digest migration and preserve the rolling admission window during rotation. This is hardening, not evidence that passwords are exposed.
- Keep 5/IP/hour, 10/IP/24h, 50/project/24h as initial reviewable admission limits. Shared networks can hit these; IP limits do not identify people. Social signup must use the same server admission controls.

### F7 — Dependencies need a controlled update (build gate)

Update Expo to its supported SDK 57 patch, regenerate the lockfile, rerun compatibility checks and builds. Do not run `npm audit fix --force`: it currently suggests downgrades to Expo 44 and React Native 0.72.

The three underlying findings are [braces <=3.0.3](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge <=1.4.0](https://github.com/advisories/GHSA-86w9-cpqp-85rv), and [uuid <11.1.1](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Installed chains are Expo CLI/Metro/config tools. Determine whether each vulnerable function is reachable in CI/build/signing versus shipped runtime; prefer supported upstream updates. A documented tooling-only exception may be necessary if no compatible fix exists. Do not describe 24 affected package nodes as 24 independent exploitable app vulnerabilities.

### F8 — Store identities, assets and native verification are missing (native build gate)

`app.json` has no Android package, iOS bundle ID, EAS project association, app icon, adaptive icon or splash assets. `eas.json` lacks explicit environment selection. Identifiers must be chosen by the publisher before first upload. The current preview profile creates an Android APK / iOS ad-hoc build; TestFlight needs a store-distribution build.

`userInterfaceStyle: light` conflicts with the offered System theme on native. Set up automatic appearance and verify system UI with the SDK's required plugin/dependency. Inspect generated manifests for unnecessary broad photo/video, microphone, storage and advertising permissions. Keep system photo selection; do not request all-device photo access for picking individual items. [Google photo permissions](https://support.google.com/googleplay/android-developer/answer/14115180?hl=en-CA).

As of this review, new Play apps target Android 16/API 36 or newer; Apple uploads use Xcode 26+ and an iOS 26+ SDK. These are build/target requirements, not the minimum OS users must run. Check generated artifacts. [Google target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en), [Apple SDK requirement](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).

### F9 — Operations and privacy disclosures need release evidence

The cleanup script and signup purge function exist; no scheduled execution is defined in this repository. External schedules may exist but were not verified. Schedule them in a trusted runner and alert on failures. Retain the existing upload budgets, daily read cap, and emergency switches. These do not cap function invocations, database traffic, email, or all provider spending; Vercel firewall rules do not protect calls made directly to Supabase.

Verify private bucket access, bucket-scoped credentials, provider account MFA, usage alerts, backup/restore, recovery email, two-account isolation and deletion against disposable data. Maintain redacted error diagnostics and a support owner. Browser-only Vercel Analytics is currently imported at `App.tsx:23` but never mounted. Isolate it to a `.web` component if enabled, omit tokens/IDs/private URLs, and keep a native no-op. Recheck actual data sent before completing privacy forms; do not claim “no data collected.”

## Approved product constraints to preserve

- Product name Collectibles; collections contain optional categories and items.
- Item visibility is independent; new items are private. Collection/category membership never grants public access.
- Guest Explore stays available. Entries open item details; collection/topic views remain grouped discovery.
- No predefined user collection except lazily created General when needed. Acquired date belongs to items; new defaults to today, cleared dates stay empty.
- Images only. Keep existing size/count/rate/byte limits and private R2 storage.
- Password minimum: 8 characters, at least one uppercase, one lowercase and one digit; symbols optional.
- Preserve existing accounts, item IDs, R2 keys and legacy sharing links. Add forward migrations; never reset production.
- Use Expo/React Native and existing Supabase/R2 architecture. No Apache, custom password server, new social feed algorithm, videos, payments or comments in this scope.
- Keep clean mobile-first copy and existing themes. Native functionality requires physical-device checks, not just web responsiveness.

## Proposed login scope

Ship existing email/password plus Google and Apple. Google uses Supabase browser OAuth/PKCE on web and native system browser. Apple uses native iOS authentication and Supabase OAuth on web/Android so Apple users can use other devices. Do not embed Google login in the CAPTCHA WebView. Apple supplies the privacy-preserving login option needed when adding Google on iOS. [Apple login guideline](https://developer.apple.com/app-store/review/guidelines/#login-services).

Keep Microsoft, Facebook, GitHub, phone/SMS and email magic-link login for later demand; they add provider review, support and/or messaging costs. Email/password already satisfies the email option. Password recovery codes remain supported. Use the same Supabase user ID across linked identities; never reassign collection ownership based on an email typed by a client.

## Execution sequence / handoff

1. [Plan A: reliability and authentication](superpowers/plans/2026-10-04-auth-and-reliability.md): dependency patch, CAPTCHA, retries, hosted email/security settings, social login, provider-aware deletion.
2. [Plan B: public safety and privacy](superpowers/plans/2026-10-04-public-safety.md): moderation, reports, blocking, terms, legal/support/deletion pages, operational retention.
3. [Plan C: native release](superpowers/plans/2026-10-04-native-release.md): identifiers/assets/environments, permissions, analytics boundaries, tests, signed beta artifacts.
4. Follow [the complete publishing runbook](STORE-PUBLISHING.md). Internal device tests can start earlier; public/external testing waits for the applicable safety and auth gates.

These are plans, not implementation authorization. For the next model, start with Plan A tasks A1–A3; complete a reviewable batch, record evidence and the next unchecked task. Social login and new public-review behavior should be confirmed as part of the user's implementation go-ahead.

## Publisher inputs needed at execution time

Expo owner/project, Apple/Google account types and IDs, permanent application ID prefix, support email/domain, SMTP provider, countries/age audience, and whether iPad remains supported (`supportsTablet` is currently true). Also confirm a person can monitor the proposed human review queue. Enter credentials in provider dashboards, EAS credentials, or ignored local files; share only public identifiers and preferences in chat. Do independent code work while these are being supplied.
