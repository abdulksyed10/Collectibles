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
