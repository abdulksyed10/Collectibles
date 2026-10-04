# Publish Collectibles on Android and iOS, from this Windows project

Prepared October 4, 2026. Follow this after the release blockers in `STORE-READINESS-2026-10-04.md` are fixed. Commands below are instructions for a later execution; none of the builds, accounts or submissions in this guide were created during the review. Dashboard labels can change; use each app's setup checklist as the final authority.

## 1. Understand what is being published

| Component | Where it runs | How changes reach users |
| --- | --- | --- |
| Website | Vercel | Web build/deployment |
| Authentication, database, media APIs | Supabase | Auth settings, migrations and Edge Function deployment |
| Private images | Cloudflare R2 | Existing server-side media service |
| Android app | User's device | Signed AAB uploaded to Google Play |
| iOS app | User's device | Signed IPA uploaded to App Store Connect/TestFlight |

You are compiling the React Native app, not uploading the website URL as an app. Android/iOS share the existing backend and much of the UI, but need platform-specific authentication, permissions, signing and testing. No Apache or separate always-running application server is needed for this architecture. Keep Vercel online for the website, hosted CAPTCHA and support/legal pages.

Use EAS cloud builds and submission from Windows. A Mac is needed for a local iOS simulator/Xcode build, but not for the cloud build/submission route. You still need access to a real iPhone for acceptance testing. [EAS iOS submission](https://docs.expo.dev/submit/ios/).

## 2. Create the publishing accounts

### Google

1. Use the Google account that should own the app and visit [Google Play Console](https://play.google.com/console/).
2. Choose Personal or Organization based on the real publisher. Complete identity/contact verification and payment; the registration fee is currently **US$25 once**.
3. Complete any requested device verification with the Play Console Android app. Organization verification may require additional business information; do not choose an account type only to evade testing requirements.
4. Enable MFA and keep account recovery details accessible to the publisher. [Google registration instructions](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).

### Apple

1. Create/use an Apple Account with two-factor authentication.
2. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/). Membership is normally **US$99/year or local equivalent**. Individual membership publishes under the individual's legal identity; an organization needs its eligible legal entity and verification, typically including a D-U-N-S number.
3. Wait for enrollment to finish and accept current agreements in Apple Developer and [App Store Connect](https://appstoreconnect.apple.com/).
4. Keep Team ID and account ownership documented. Do not share account passwords or private signing keys in chat/Git.

### Expo

Create an [Expo account](https://expo.dev/) or use your existing organization. It will own the EAS project and build credentials. EAS has a free tier and paid options; check its current build allowance before queuing builds. Supabase, R2, email and hosting usage remain separate costs. [EAS setup](https://docs.expo.dev/build/setup/).

## 3. Choose permanent identity before the first upload

Decide these with the publisher and record them in `docs/RELEASE-IDENTITY.md`:

- Display name: **Collectibles** (store name availability still needs checking).
- Android package: your stable reverse-domain identifier, for example `com.yourpublisher.collectibles`.
- iOS bundle identifier: normally the same text, registered with Apple.
- Expo owner and generated EAS project ID.
- URL scheme for authentication and existing share links.
- Initial marketing version, for example `1.0.0`; build/versionCode increments are separate.
- Countries, actual target age audience, phone/tablet coverage and monitored support email.

The example identifiers are placeholders, not values to copy unchanged. Changing package/bundle identity after publication usually means a different app. In Apple Developer → Certificates, Identifiers & Profiles → Identifiers, register the selected explicit App ID and enable Sign in with Apple if included. EAS can assist with capability/signing setup, but the registered ID must match the source.

## 4. Prepare the repository and link EAS

Open PowerShell in the repository:

```powershell
Set-Location 'C:\Users\syedz\Desktop\Web Dev\Josh-pin-collection'
git status --short
npm ci
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

If not already associated with the correct project, run:

```powershell
npx eas-cli@latest init
npx eas-cli@latest build:configure
```

Choose the publisher's project/organization. Review the generated changes; preserve the repository's existing plugins and build profiles. `init` supplies the real `extra.eas.projectId`. Do not create another project if the correct one already exists. [EAS CLI reference](https://docs.expo.dev/eas/cli/).

After the implementation plan, app config must contain the chosen `android.package`, `ios.bundleIdentifier`, EAS association, real icon/splash/adaptive-icon assets, appropriate appearance and permissions, and Apple capability/plugin where applicable. Keep secrets out of app config.

The desired profile structure is:

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "preview": {
      "distribution": "internal",
      "environment": "preview",
      "android": { "buildType": "apk" }
    },
    "production": {
      "distribution": "store",
      "environment": "production",
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

Merge this with any profiles added during implementation. The existing remote-version policy lets EAS increment native build numbers; do not reuse a versionCode/build number already uploaded. [EAS configuration](https://docs.expo.dev/eas/json/).

## 5. Configure the native build environment

Vercel variables are **not copied to EAS automatically**. Local ignored environment files are not a reliable cloud-build configuration.

In the EAS project dashboard, create these values for production, and separately for preview:

| Name | Value/source |
| --- | --- |
| `EXPO_PUBLIC_ENABLE_BACKEND` | Literal string `true` |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://hoxesktykdwuvunhqnrp.supabase.co` for current production |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Current project's publishable key, never service-role key |
| `EXPO_PUBLIC_WEB_URL` | `https://collectibles-three.vercel.app` until a chosen custom domain replaces it |
| `EXPO_PUBLIC_TURNSTILE_SITE_KEY` | Public site key for the configured hosted challenge domain |
| Any new public provider flags/config | Only those introduced and documented by Plan A |

Alternatively create variables interactively, repeating for each one:

```powershell
npx eas-cli@latest env:create --environment production
```

Use plain-text visibility for intentional public client configuration. A “secret” label does not protect anything embedded in a distributed app. **Do not add** R2 keys, database URL/password, Supabase service role, Turnstile secret, SMTP password, Google client secret, Apple private key, or submission credentials to `EXPO_PUBLIC_*`. Server secrets stay with Supabase/trusted jobs; store credentials stay in EAS/provider credential tooling. [EAS environment guidance](https://docs.expo.dev/eas/environment-variables/).

Configure preview deliberately—prefer a separate staging backend/bucket for destructive tests. If temporarily using production for trusted beta tests, use disposable accounts and conservative limits; never run database resets or broad test cleanup there.

## 6. Finish hosted service configuration

Use Plan A's auth checklist and Plan B's service acceptance:

1. Supabase: current migrations and functions deployed, email confirmation enabled after custom SMTP verification, correct password requirements, rate limits, admission hook and CAPTCHA.
2. Auth redirect allowlist: exact web callback and chosen native callback, plus supported confirmation/recovery/share routes. The provider callback configured in Google/Apple is the Supabase `/auth/v1/callback`, not your native custom scheme. Use HTTPS callback hosting with direct-load routing.
3. Google/Apple: consent branding and provider configuration complete; test accounts allowed while providers are in testing; browser OAuth not limited to your developer account at public launch. Apple relay email and browser client-secret renewal documented.
4. R2: private bucket, scoped server token, only required browser GET/HEAD CORS origins. `MEDIA_ALLOWED_ORIGINS` includes the current website; no credentials inside the mobile app.
5. Public CAPTCHA, privacy, terms, community, support and deletion pages are deployed and usable without signing in.
6. Cleanup/purge jobs, human content review, reporting, alerting and backup/restore operate with assigned owners.

The October 4 audit confirmed public R2-backed reads work, but found email auto-confirmation enabled. Do not assume saving source configuration changes this hosted setting.

## 7. Run the release checks and build Android

From a clean, reviewed candidate commit:

```powershell
npm run typecheck
npm test
node scripts/check-secrets.mjs --all
npx expo install --check
npx expo-doctor
npx expo export --platform all --clear --max-workers 2
```

Run the release validator, Deno checks and browser fixture/demo checks added or retained by the plans/CI. Do not run Playwright against a production-connected export expecting fixture data; use the exact isolated CI configuration. Inspect the archive to ensure local credential files are excluded.

For a first direct Android device check:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Download/install the APK on a trusted test device. This tests installation but is not the store artifact. For Play:

```powershell
npx eas-cli@latest build --platform android --profile production
```

Let EAS generate/manage the Android upload keystore, or use the existing keystore if the app was already published. Keep a secured backup/recovery procedure; never commit credentials. Download the resulting **`.aab`**. As of October 4, 2026 new phone/tablet app submissions must target **API 36+**. Check the artifact/build output and Play preflight findings. [Target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en). Also verify 64-bit native libraries and **16 KB memory-page compatibility**, including a 16 KB device/emulator smoke test. [Android compatibility guide](https://developer.android.com/guide/practices/page-sizes).

## 8. Create the Google Play listing and upload the AAB

1. Play Console → All apps → Create app. Enter name/default language, choose App, choose the intended pricing model, and complete declarations. Use Free for this beta if that is the publisher's decision; it has no billing implementation.
2. Complete Dashboard setup/App content tasks: privacy URL, App access instructions, content rating, target audience, ads declaration, Data safety, account-deletion URL and any applicable permissions/category-specific declarations. Answer based on actual functionality and SDKs, not desired marketing claims. [Create an app](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).
3. Add app category/tags, monitored contact and website. Prepare a clear description, short description, **512×512** store icon, **1024×500** feature graphic and real Android screenshots. Add tablet screenshots if supporting/promoting tablet layouts. Use images you have permission to publish. [Google asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).
4. Supply a dedicated reviewer account with representative disposable collections and full instructions under App access. It must not require the reviewer to contact you for a code; make the documented supported login path work. Do not hardcode a CAPTCHA/auth bypass or place these credentials in Git.
5. Test and release → Testing → Internal testing → Create release. Enroll in Play App Signing and upload the production AAB. Resolve all manifest, target SDK, signing and version warnings before rollout.
6. Add release notes, select testers via an email list/Google Group, save/review, then roll out to the internal track when authorized. Share the opt-in link; testers must use an included Google account. Verify installation from Google Play itself and collect its pre-launch report.

Manual first upload is a straightforward route and avoids setting up a service account immediately. Current EAS also documents first-time automated submission; if using it, configure an appropriately scoped Google service-account key in EAS and a submission profile targeting `internal` (or `draft`). Do not assume every old tutorial's “first upload must be manual” restriction still applies. [Current EAS Android submission](https://docs.expo.dev/submit/android/).

For later automated uploads after credential setup:

```powershell
npx eas-cli@latest submit --platform android --profile production
```

Choose the exact candidate build in the prompt. A successful upload does not fill out every policy form or mean the app has been publicly approved.

## 9. Complete Google's required testing before public release

For **personal developer accounts created after November 13, 2023**, run a **closed test with at least 12 opted-in testers continuously for 14 days** before applying for production access. Internal testing does not satisfy that closed-test condition. Recruit more than 12 so normal dropouts do not restart your effective window; ask them to use the app and keep a record of feedback/fixes.

When eligible, use Dashboard → Apply for production, answer the testing/readiness questions and wait for Google's decision. It is not automatic approval on day 14. Other account types still need their applicable verification/review and should test thoroughly. [Google testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB).

Once approved, complete the production release, countries/availability and review steps. Use managed publishing/manual release timing if desired. For first launch, limit availability/cohort deliberately; staged percentage rollouts are primarily an update tool and should not be assumed available for a brand-new app.

## 10. Create the Apple app record and build iOS

1. App Store Connect → My Apps/Apps → `+` → New App.
2. Choose iOS, name, primary language, the registered matching Bundle ID, a private unique SKU, and user access. SKU is your internal reference, not a secret or a login credential. Record the numeric **Apple ID** of this app; that is EAS `ascAppId`. [Create an Apple app record](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/).
3. Ensure Sign in with Apple is configured for this bundle when included. Generate/update the provisioning profile after adding entitlements.
4. Build a store-distribution IPA:

```powershell
npx eas-cli@latest build --platform ios --profile production
```

Sign into Apple when EAS prompts; select the correct team and allow it to manage the distribution certificate/provisioning profile, or provide the publisher's existing credentials. Never paste Apple authentication codes/keys into Git.

The current `preview` internal profile is ad-hoc distribution, requiring registered devices; **it is not the TestFlight profile**. Use `production` for TestFlight. [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).

Verify the EAS build image uses **Xcode 26+ and iOS 26+ SDK**, required since April 28, 2026. A newer SDK can still support older iOS versions; inspect the actual deployment target before advertising compatibility. [Apple minimum build requirement](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).

## 11. Upload to App Store Connect and test with TestFlight

Merge the real numeric ID into `eas.json` after the app record exists:

```json
{
  "submit": {
    "production": {
      "ios": { "ascAppId": "REPLACE_WITH_NUMERIC_APPLE_APP_ID" }
    }
  }
}
```

Configure submission credentials interactively, then upload:

```powershell
npx eas-cli@latest credentials --platform ios
npx eas-cli@latest submit --platform ios --profile production
```

Use EAS's App Store Connect API-key setup or supported Apple credential flow; choose the exact IPA/build. Wait for processing and resolve export-compliance questions. Uploading places a build into App Store Connect/TestFlight; it does not publish it. [EAS iOS submission](https://docs.expo.dev/submit/ios/).

In TestFlight:

1. Add internal testers who have appropriate App Store Connect access. Verify installation on iPhone and iPad if supported.
2. For friends/community testers, create an external tester group, add the build, fill in beta description, contact/review access and What to Test, then submit for Beta App Review when required. External testers are distinct from store-account team members.
3. After approval, invite testers by email or an appropriate public link, collect crash/feedback reports, and upload fixed builds with higher build numbers. [Apple external testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).

## 12. Complete the App Store listing and submit for review

In the app's App Store tab, create/select the version matching the release candidate, then complete:

- App name/subtitle, description, keywords, category, copyright, support URL, privacy policy URL and website as applicable.
- Screenshots of the actual app for supported device families. Follow the current accepted iPhone screenshot sizes; provide iPad screenshots while iPad is supported. Prepare a high-quality 1024×1024 app icon in the build and follow Apple's icon requirements. [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
- Age-rating questionnaire and content rights for public UGC; report/moderation/blocking instructions and a functioning contact.
- App Privacy disclosures for your own processing and SDK/service partners, linked identifiers/photos/content, purposes, optional analytics/diagnostics and retention. Privacy manifests in the binary and App Privacy labels are separate obligations. [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/).
- Pricing/availability, countries, publisher/trader details and agreements required for your chosen markets. Do not select children's distribution categories unless the app meets their additional requirements.
- App Review contact, dedicated test credentials and clear notes: guest Explore, collection/item creation, public approval behavior, report/block and Settings → account deletion. Ensure pending-review content and demo data do not prevent reviewers from testing the real flows.
- Select the processed production build, answer encryption/export questions truthfully, and choose manual or automatic release after approval.

Submit for App Review and respond to issues with evidence/fixes. Keep Supabase, R2, email and support URLs available throughout review. For manual release, use Release This Version only when you want it public. TestFlight approval and production approval are separate.

## 13. Data disclosures and deletion checklist for both stores

Use `docs/PRIVACY-DATA-INVENTORY.md` from Plan C, not generic answers copied from another app. Collectibles sends account identity, item metadata and photos off-device. Review whether each provider is acting as a service processor and whether each store's definition treats a transfer as sharing; a cloud upload does not automatically mean advertising tracking. Include Turnstile/security processing and any analytics actually enabled. [Google Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

Verify the public deletion URL references Collectibles and allows a deletion request without reinstalling; test the in-app deletion flow for email, Google and Apple accounts. Publish actual retention and processing timelines, including narrowly retained anti-abuse/deletion records. [Google deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [Apple deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

Do not claim tracking-free/no data collection until the final SDK/network inventory supports the exact answer. An App Tracking Transparency prompt is tied to actual tracking behavior, not simply to using Supabase or having an analytics dependency.

## 14. Updates after launch

1. Keep a record of released commit, EAS build ID, app version/build numbers, backend migrations/functions and public settings.
2. Fix and test, increment marketing version when appropriate; let EAS increment native build numbers. Build/upload new artifacts to the existing app records with the same identifiers.
3. Database/function changes deploy independently and must remain compatible with older installed apps. Preserve safety rules even if rolling back a web client.
4. Vercel Git deployments update the website only. They do not update apps installed from stores. EAS Update is a separate optional setup; this project should use new store builds until an update/runtime-version strategy is deliberately implemented and tested.
5. Monitor support, moderation, crashes, auth delivery, Supabase/R2/email usage and cleanup failures. Keep renewal reminders in your own operations process for Apple membership, signing assets, provider secrets and domains.

## Before clicking Submit: final go/no-go

- All release-blocking findings fixed with evidence; no placeholder routes/IDs/assets.
- CAPTCHA and email/Google/Apple work on signed Android and iOS builds.
- Private uploads, failed-upload retries, sharing, moderation/report/block and deletion pass on disposable accounts.
- Required settings/keys are present in EAS; no secret entered in the public bundle.
- Direct legal/support/deletion URLs work; reviewer credentials work; moderation/support is staffed.
- Privacy declarations reflect shipped code; store SDK/signing/permission checks pass.
- The publisher explicitly authorizes this upload/release stage.
