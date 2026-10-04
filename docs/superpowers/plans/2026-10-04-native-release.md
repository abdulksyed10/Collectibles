# Native release preparation implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` after the user's go-ahead. Work sequentially; keep release evidence and unresolved external steps explicit.

**Goal:** Produce tested Android and iOS release candidates and an accurate store submission package.

**Architecture:** Same Expo app and Supabase/R2 services on all three platforms. EAS compiles/signs native artifacts; Vercel continues serving the web client and public support/CAPTCHA pages. Provider credentials remain outside the bundle.

**Tech stack:** Expo SDK 57, EAS Build/Submit, Apple Developer/App Store Connect, Google Play Console, existing CI and browser fixtures.

**Spec:** `docs/STORE-READINESS-2026-10-04.md`, F8–F9 and product constraints. Depends on the relevant checks in Plans A and B before distributing an external beta.

## Global constraints

- Preserve existing accounts, item IDs, R2 keys and legacy sharing links. Add forward migrations; never reset production.
- Images only; private by default; guest Explore remains available.
- Keep clean mobile-first copy and existing themes. Native functionality requires physical-device checks, not just web responsiveness.
- Select permanent identifiers with the publisher; never submit `com.example.*` or a guessed identity.
- Never include private credentials in a public environment variable, native binary, source map or committed file.
- A successful export or EAS upload is not store approval. Record unknown/blocked checks honestly.

## Review focus

1. Production build gets no local `.env.local`: fail early instead of shipping disabled login (C1).
2. Android photo picker grants only one photo and camera is denied: app remains usable without broad permissions (C2).
3. System dark theme changes while an editor is open: readable fields and retained draft (C2/C3).
4. Device backgrounds during upload or cold-starts from an auth URL: correct session/navigation and recoverable state (C3).
5. Old installed app talks to newly migrated backend: privacy and core reads remain intact (C4).

## C1 — Permanent identity, assets and EAS environments

**Modify:** `app.json` (use `app.config.ts` only if environment-driven config is needed), `eas.json`, `.env.example`, `.gitignore`, build scripts, `.github/workflows/verify.yml`. **Create:** approved icon/adaptive-icon/splash assets, `scripts/check-release-config.ts`, `tests/release-config.test.ts`, `docs/RELEASE-IDENTITY.md`.

- [ ] Get public identifiers: Expo owner, EAS project UUID, publisher-approved Android package/iOS bundle ID, Apple team, selected custom scheme. Prefer matching reverse-domain app IDs where available. Keep existing `collectibles://` share links working if a more unique auth scheme is added. Do not create duplicate EAS projects if one is already linked externally.
- [ ] Configure app version and EAS remote build-number/versionCode auto-increment. Preserve existing plugins. Add owned icon, Android adaptive assets and configured splash screen; produce any artwork only when authorized. No borrowed collectible trademarks as the app identity.
- [ ] Keep explicit preview (Android APK/internal) and production (store AAB/IPA) profiles with `environment` set intentionally. A separate development profile uses `expo-dev-client` if needed for native testing. Production/TestFlight share the production profile. Set submission IDs after store records exist.
- [ ] Populate EAS production/preview variables independently of Vercel: `EXPO_PUBLIC_ENABLE_BACKEND=true`, Supabase HTTPS URL and publishable key, `EXPO_PUBLIC_WEB_URL`, Turnstile public site key and any agreed public provider flags. EAS plain-text/config visibility is appropriate for public values; labels cannot make bundled values secret.
- [ ] Implement a release-only prebuild/export validator that rejects disabled backend, absent/placeholder keys, non-HTTPS hosted URLs, missing Turnstile configuration when required, placeholder app IDs and missing assets. Run it from both production EAS build hook and web production build. Fixture/demo CI has an explicit separate mode; never infer it from absent credentials in a release.
- [ ] Test validators with synthetic config; print names/reasons only. Build with `EXPO_NO_DOTENV=1` and deliberately missing fields; assert hard failure. Positive fixture and production-shape cases pass. Do not print resolved full Expo config if it contains keys.
- [ ] Run EAS project/config checks; inspect build archive file list for ignored secret files without dumping contents. Update `.easignore` only if necessary and preserve all `.gitignore` secret exclusions.

## C2 — Native permissions, appearance and SDK privacy

**Modify:** app config/plugins, `src/theme/theme.tsx` if needed, `src/components/ui.tsx`, specific affected screens. **Create:** `docs/NATIVE-PERMISSIONS.md`, `docs/PRIVACY-DATA-INVENTORY.md`.

- [ ] Set automatic interface appearance and install SDK-compatible `expo-system-ui` if required on Android. Verify Classic/Fun/Dark/System and status/navigation bars on actual native builds; do not reset form state just to rerender a theme.
- [ ] Generate native projects in an ignored temporary/isolated build location or inspect EAS artifacts. Check merged Android manifest for camera and system-picker behavior; remove unused broad `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, audio, legacy storage and ad-ID permissions where present and not required. Recheck older supported Android picker fallback before blocking a permission. Do not assume plugin configuration equals final manifest.
- [ ] Review iOS photo/camera descriptions, Apple sign-in entitlement and privacy manifests contributed by SDKs. Set required-reason declarations only for APIs actually used with a truthful allowed reason; do not paste every reason code. Confirm privacy-manifest aggregation in the built app. [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/).
- [ ] Check 16 KB page-size compatibility of every Android native library in the actual AAB, including photo/WebView/React Native dependencies; run a 16 KB emulator/device smoke test. Play requires this for applicable new apps/updates targeting Android 15+; using a current Expo version alone is not artifact-level evidence. [Android page-size guide](https://developer.android.com/guide/practices/page-sizes).
- [ ] Validate app-export encryption declaration against actual SDK use. HTTPS/auth/Keychain use does not mean the app implements custom encryption, but adding encrypted provider-token storage on the server does not justify guessing client export answers. Record the rationale for the chosen App Store answer.
- [ ] Inventory data by platform: email/user ID, collection/item content/photos, report details, provider identity, IP/security processing, diagnostic logs, optional web analytics; purposes, processors, public/optional status, retention and deletion. Use this to fill Apple App Privacy and Google Data safety. Do not mark “no collection” because images are in someone else's cloud.
- [ ] Treat iPad support as an explicit commitment (`supportsTablet:true` currently). Test and supply its assets/screenshots, or obtain a scope decision to defer before first submission. Do not remove tablet support as an unannounced workaround.

## C3 — Web-only analytics and native/device acceptance

**Modify:** `App.tsx`, existing tests and any demonstrated platform bugs. **Create:** `src/components/AppAnalytics.web.tsx`, `src/components/AppAnalytics.native.tsx`, a declaration file if TS resolution needs it, `docs/DEVICE-ACCEPTANCE.md`.

- [ ] Replace the currently unused direct Analytics import with one platform component. Web mounts `@vercel/analytics/react` only if analytics is approved; native returns null. Strip auth callback URLs/query/fragment and collection identifiers from tracked URLs/events; no private title, email, notes, signed URL or token. Test the sanitized event payload and zero native browser-analytics initialization. Vercel analytics is not mobile crash reporting.
- [ ] Run fresh fixture builds and `npm run test:e2e`, plus the credential-free demo path from CI. Include CAPTCHA lifecycle, failed-upload retry, cleared acquired date, policy acceptance, reporting and public removal cases.
- [ ] Run typecheck, all unit/SQL tests, secret scan, Expo compatibility/doctor, Deno checks from CI and `npx expo export --platform all --clear --max-workers 2`. Export success is a compile check only.
- [ ] Test the signed candidate on Android phone and iPhone, plus iPad/Android tablet if supported. Record device, OS, build ID/number, commit, environment, expected/actual result and evidence. Include older supported OS and latest available OS, keyboard/safe areas/large text/screen reader/touch targets, Android Back, date picker, image detail and sharing.
- [ ] Auth matrix: confirmed email signup, resend, wrong password and throttling, recovery code, Google and Apple first/return/cancel login, cold-start callbacks, session after force close and expiry, account switching, sign-out/cache clearing, every provider deleting its account. No production CAPTCHA bypass.
- [ ] Media matrix: denied/limited photo permission, camera denial, cancellation, HEIC/rotated/large images, PDF/video rejection, slow/offline upload, background/resume, server success with lost response, quotas, no duplicate items, existing-image behavior, EXIF handling and private/public transitions.
- [ ] Privacy matrix on disposable A/B accounts and guest: foreign read/write/sign/delete denied; private sibling omitted; public item appears only after approval; block/report works; removal affects links/covers/images; sign-out does not show cached private images to another user. Keep old live user data untouched.

## C4 — Deployment ordering and signed beta release

**Modify:** operations/deployment docs, store listings outside Git when later authorized. **Create:** `docs/RELEASE-CANDIDATE.md`.

- [ ] Freeze a reviewed candidate commit and record live migration versions/function versions. Take a verified backup. Deploy additive schema changes and compatible backend code before dependent UI; verify old clients still fail safely if new acceptance requirements apply. Communicate public-review transition; do not rewrite historical migrations or disable privacy gates to make old UI work.
- [ ] Deploy first-party CAPTCHA/legal/support pages, exact CORS/Auth redirect settings, then web and native clients. Smoke-test current public services and approved disposable flows. Mark dashboard-only configuration separately from checked-in code.
- [ ] Build Android production AAB and iOS production IPA using EAS. Confirm generated Android target >=36 and Apple build uses Xcode/iOS SDK >=26 at the October 2026 policy baseline; check current policy again on submission day. Record actual minimum supported OS from artifacts separately.
- [ ] Upload to Play internal testing and TestFlight after user authorizes store upload. Complete reviewer access, privacy forms, screenshots and content ratings; use the dedicated publishing runbook. Verify installation from those channels, not only direct APK/Expo Go.
- [ ] Move to closed/external beta only when auth, publication safety, deletion and device checks pass. Public production release is a separate owner decision after tester feedback and any Play eligibility requirements.
- [ ] Record rollback: keep compatible backend schema, turn off uploads/public publication if necessary, redeploy previous safe web build, and ship native hotfix with incremented build number. Installed binaries cannot be recalled by a Git revert; no EAS Update capability exists until deliberately configured and tested.

## Exit criteria

Every blocker in the readiness review has passing evidence or an explicit publisher decision that removes the affected feature from release scope. The reviewer can use the app without access to private developer accounts. There are no secrets in Git or binaries, live services are monitored, and the same accepted build is the one selected in each store. Update `docs/IMPLEMENTATION-PROGRESS.md` with next steps without claiming publication before it occurs.
