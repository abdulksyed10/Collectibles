# Release implementation progress — October 4, 2026

## Implemented in this candidate

- Provider-ready email/password, Google, and Apple sign-in flows behind disabled public feature flags.
- Password composition validation, client cooldowns, server admission/rate-limit migrations, and CAPTCHA integration points.
- Per-entry publication review; entry reports, device/account blocks, moderation audit records, and public legal/support/deletion pages.
- Private R2 media boundaries, upload/storage limits, tracked cleanup, frozen/retryable account deletion, and Apple grant revocation support.
- Mobile app identity/assets/configuration scaffolding, configuration validation, legal routes, optional web-only analytics, CI checks, and maintenance workflow.

## Still required outside source control

1. Review and apply migrations/functions; configure all Supabase, R2, Vercel, GitHub maintenance, Turnstile, SMTP, alerting, and moderation settings in [OPERATIONS.md](OPERATIONS.md).
2. Create permanent Android/iOS application identities and EAS project; set the corresponding EAS environment variables.
3. Configure and test Google/Apple developer dashboards before turning on social login flags.
4. Complete the physical-device checklist in [DEVICE-ACCEPTANCE.md](DEVICE-ACCEPTANCE.md), including destructive deletion and public-content paths.
5. Complete store privacy, UGC, age-rating, support, account-deletion, and testing requirements in [STORE-PUBLISHING.md](STORE-PUBLISHING.md).

Source validation can prove code and fixture behavior; it cannot prove a provider dashboard setting, a real payment account, a store policy decision, a physical device, or a live incident response.

## Build repair verification — October 4

- The exact `npm run build:web` release command succeeds with `EXPO_PUBLIC_WEB_URL` blank and other required client settings present. Synthetic values were used; no private server credentials entered the bundle.
- TypeScript passes; 118 unit/database tests pass, including the web-origin fallback and deletion-stage upgrade regressions.
- All 21 Expo Doctor checks and Expo's dependency compatibility check pass after repairing the splash plugin and dynamic config.
- Web, Android and iOS exports succeed; Android/iOS include compiled Hermes bytecode. These are bundle exports, not signed native application builds.
- All 13 Playwright browser tests pass with clean process exit, covering mobile collection flows, private defaults, CAPTCHA, public pages, reports/blocks and revocation refresh. These tests use mocked services.
- Deno checks for the functions and operator scripts pass. The tracked-file secret scan passes; env files and database dumps are ignored.
- npm audit still reports 25 affected dependency entries from three tooling advisories. See [DEPENDENCY-REVIEW.md](DEPENDENCY-REVIEW.md); no forced Expo/React Native downgrade was applied.
- Live rollout remains pending, as recorded in [DEPLOYMENT-CHECKPOINT.md](DEPLOYMENT-CHECKPOINT.md). Native account configuration, signed builds and physical-device tests remain outstanding.
