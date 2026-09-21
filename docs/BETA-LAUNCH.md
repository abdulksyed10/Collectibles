# Collectibles beta launch

Readiness review: September 21, 2026. Target: a small invited group on Android phones/tablets, iPhone/iPad, and mobile/desktop browsers. Native installation has not been verified. The browser version covers Windows/macOS/Linux; dedicated desktop apps are outside this beta.

## What is already implemented

- Custom categories → collections → items, photos, acquired dates, editing, deletion and search.
- Private defaults, owner-only database policies, public collection catalog and read-only share links. Public responses omit owner details, notes, acquired dates and storage keys.
- Supabase schema and both media functions were deployed in the preceding integration work; R2 stays private. The user has tested real accounts/uploads. These services do not need to be created again or reset.
- Server-enforced photo count, upload attempts and byte reservations; app-wide emergency switches and public-photo read limits. In-app account deletion and a cleanup script exist.
- Automated SQL/privacy/quota tests and browser fixtures. Fixtures are not evidence of live email delivery, native installation or device permissions.

## Stage 1 — stable web beta and service operations

1. Require a green GitHub `Verify app` run, including the connected fixtures and credential-free demo. Run the dependency compatibility check before native builds. Review the existing moderate `xcode` → `uuid` tooling advisory; do not apply npm's suggested major Expo downgrade blindly.
2. Choose the HTTPS web origin and deploy the static Expo web export. Set `EXPO_PUBLIC_ENABLE_BACKEND=true`, the Supabase URL/publishable key, and `EXPO_PUBLIC_WEB_URL` in the hosting/build environment. Never put database, R2, service-role or signing credentials there.
3. Add that exact origin to server `MEDIA_ALLOWED_ORIGINS` and private R2 GET/HEAD CORS, and update Supabase Auth site/redirect URLs. Existing local origins alone will not support the hosted browser app. Verify a shared link in a signed-out browser and from the installed mobile app.
4. Verify hosted Auth settings separately from `supabase/config.toml`. Confirm email verification, a 10-character password minimum, rate limits, and recovery email containing the OTP expected by the app. Configure custom SMTP with a verified sender and test delivery to ordinary testers. Supabase's default mail service is limited to project-team recipients and is unsuitable for a beta audience. See [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
5. Schedule `supabase/scripts/cleanup-media.ts` in a trusted runner using server-only secrets; monitor failures. Prove a failed upload and a deleted disposable account leave no retrievable objects after cleanup. Check signed URL expiry and two-account ownership isolation on the live services.
6. Start with a controlled tester cohort. Verify enrollment restrictions on the server, or complete CAPTCHA support before opening signups broadly. Configure usage/billing alerts for Supabase, R2 and email, and document how to disable uploads/public image reads. The current 1 GiB lifetime app reservation and 200 uploads/day are conservative beta limits; deleted/failed attempts do not refund reservations. These counters are not provider-wide billing caps.
7. Add error/crash reporting with token and photo-data redaction, a monitored support contact, and a tested backup/restore procedure. Record a build version with each beta issue.

Acceptance: a new tester can confirm email, sign in, reset a password, upload a private photo, share it, revoke sharing, and delete their account using the hosted app. No stage is complete solely because the source exists.

## Stage 2 — public sharing and store preparation

The current Public tab exposes user-generated photos. There is no report/block/moderation workflow yet. Before distributing this experience through store review:

- Implement reporting for collections/items and their publishers, blocking publishers, filtering/review of objectionable content, and an operator process to handle reports and remove content promptly. Enforce removals in the catalog, share links and image proxy as well as the UI; preserve owner privacy. Include abuse tests and bounded reporting rates.
- Publish community rules/terms with acceptance before contributing public content, an accurate privacy policy, and support/contact information. Explain private defaults and optional public visibility without promising that shared images cannot be copied.
- Verify the existing in-app deletion flow against real disposable data. Provide an external account-deletion request page and complete store privacy/data-safety disclosures based on actual SDKs, data retention and processor behavior.
- Prepare app icon, splash assets, phone/tablet screenshots, age/content rating, store description, reviewer access, and beta feedback instructions.

These are concrete gaps for the current public-content feature: [Apple user-generated-content rules](https://developer.apple.com/app-store/review/guidelines/#user-generated-content), [Google Play UGC rules](https://support.google.com/googleplay/android-developer/answer/9876937), and [Google account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

## Stage 3 — signed Android and iOS beta builds

1. Link an Expo/EAS project owned by the publisher. Choose stable, unique `android.package` and `ios.bundleIdentifier` values; neither is configured yet. Keep signing credentials in provider tooling, never Git.
2. Configure explicit EAS build environments containing only client configuration. Local ignored `.env.local` is not a deployment strategy. Validate production exports do not quietly fall back to the demo.
3. Use the existing `preview` APK profile for initial Android device checks. For Play distribution, build an AAB and upload to internal testing; promote to closed testing when ready. For newer personal developer accounts, production access requires at least 12 opted-in closed testers for 14 continuous days. This does not prevent starting internal testing. See [Google testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).
4. Use a store-distribution iOS build for TestFlight, backed by Apple Developer/App Store Connect access. The first external TestFlight build requires beta review. The existing EAS `preview` profile instead uses ad hoc provisioning and registered devices; it is not a TestFlight build. See [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/) and [Apple external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).
5. Confirm supported OS versions from the actual generated native projects/build logs. Do not claim support for every OS version based on successful JavaScript exports.

## Device acceptance checklist

Run the same release candidate on a physical Android phone, iPhone, and tablet/iPad; also check Safari, Chrome, Firefox and Edge at phone/tablet/desktop widths. Record device, OS, build, date, result and issue link.

- Fresh install, signup/confirmation, sign-in, recovery, session after restart/background, sign-out and delete account.
- Photo library with limited/denied access, camera grant/denial, cancellation, large/rotated/HEIC photos and thumbnail quality. Confirm image conversion and upload limits on device.
- Keyboard covering fields, scrolling at small widths, safe areas, Android Back, native date picker, large text, screen-reader labels and touch targets.
- Slow/offline connections, expired session/URLs, failed/retried uploads, quota errors and recovery without duplicate or lost items.
- Two accounts: owner can edit; others can only view public collections. Anonymous link access, public-to-private revocation, publisher blocking and moderation removal affect both metadata and photos.
- Existing content survives app upgrades. No unexpected permissions, secret values or private photos appear in logs/crash reports.

## Information needed to proceed

- Expo account/organization and access to its project.
- Apple Developer and Google Play Console account availability (and personal/organization account type for Google).
- Publisher identity/application identifier prefix, support email, and preferred beta web domain/hosting account.
- Email provider/sender domain and an initial tester list/device coverage.

Share identifiers and preferences only. Enter passwords/tokens/signing keys in the relevant CLI, dashboard or ignored local configuration.

The next implementation milestone is Stage 1: a working HTTPS web beta and tested account lifecycle, while Stage 2 moderation work proceeds before store distribution. Native build generation alone is not the launch gate.
