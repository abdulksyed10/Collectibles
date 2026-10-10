# Authentication operations

This checklist applies after the `202610040001_signup_admission_hardening.sql` migration is deployed. It records the settings that belong in Supabase, Cloudflare, and the email provider rather than in the mobile app or Git repository.

## Passwords and failed sign-ins

In **Supabase Dashboard → Authentication → Sign In / Providers → Email**, configure:

1. Email confirmation enabled.
2. Minimum password length: `8`.
3. Required characters: uppercase letter, lowercase letter, and digit. Do not require a symbol for this app.
4. Leaked-password protection when the selected Supabase plan provides it.
5. Require reauthentication for sensitive password changes.

The app also applies the same 8/upper/lower/digit rule before signup and password reset. Its form pauses for one hour after five incorrect passwords in ten minutes. That pause is only local to the device: it is not an account lock and cannot protect direct Auth API calls.

Supabase's **Password Verification Attempt** hook can implement a real account-level failed-password policy, but it is not available on the Free plan. Until that is available, use Supabase Auth rate limits, Turnstile, and Cloudflare's edge controls as the server-side protection.

## Email delivery and recovery

Before inviting beta users, configure a transactional SMTP provider and a sender address on a domain the project owns. Publish the provider's SPF and DKIM records, then add a DMARC record. Test signup confirmation, password recovery, and resend-confirmation messages with disposable non-team mailboxes.

The recovery template must contain the six-digit recovery code expected by the app. The UI provides a rate-limited resend-confirmation action. Do not use a personal inbox as the production sender.

## Turnstile and rate limits

Create a Cloudflare Turnstile widget for the deployed web host, currently `www.sharecollectibles.com`, without `https://` or a trailing path. Keep the widget secret only in **Supabase Dashboard → Authentication → Attack Protection → CAPTCHA**. The public site key belongs in the Vercel/EAS `EXPO_PUBLIC_TURNSTILE_SITE_KEY` build variable.

In **Authentication → Rate Limits**, set conservative limits for signups, confirmation/resend emails, recovery emails, token verification, and password sign-ins. Start with a beta-sized allowance that normal users can meet, observe the logs, then adjust individual endpoints. A generic project-wide limit is not a substitute for endpoint limits.

Add the deployed web URL and the mobile redirect `collectibles://auth/callback` under **Authentication → URL Configuration**. The web CAPTCHA page must be reachable at `/auth/captcha.html` from that same HTTPS origin.

## Signup admission hook

1. Deploy the migration, then confirm the `pgcrypto` extension exists in the Supabase project.
2. Generate a stable random value of at least 32 characters outside this repository. Store it only in `private.signup_admission_settings.hmac_key`. Do not rotate it during an active 24-hour counting window.
3. Leave `enabled=false` while testing. In **Authentication → Auth Hooks**, set **Before User Created** to the Postgres function `public.before_user_created_admission`.
4. With disposable accounts, test normal signup, duplicate hook delivery, malformed IP metadata, same-IP limits, IPv6 normalization, confirmation delivery, and existing-account sign-in.
5. Set `enabled=true`. Use `paused=true` in the same private settings row to stop signups immediately during an incident.

The function accepts only Supabase's `supabase_auth_admin` role. It stores no raw IP address, password, email, or CAPTCHA token. Its HMAC-SHA-256 digest is retained for two days. During the first 24 hours after this migration, both the legacy keyed-MD5 and new HMAC digest count toward the same limit.

## Live audit before beta

Verify in the hosted dashboard, without exporting any secrets:

- signup confirmation is on and public signup status matches the beta plan;
- the sender domain is authenticated and recovery email arrives;
- password length and required characters match the app;
- Turnstile rejects a missing or invalid CAPTCHA token;
- the configured Site URL and redirect allowlist contain only intended origins and app schemes;
- Auth audit logs show the hook running and return no internal errors; and
- rate-limit responses include an appropriate retry window.

References: [Supabase password security](https://supabase.com/docs/guides/auth/password-security), [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook), and [Password Verification hook](https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook).
# OAuth providers

See [Google and Apple sign-in setup](OAUTH-SETUP.md) for the provider dashboard steps, allowed callback URLs, secret placement, and the required real-device acceptance checks. `EXPO_PUBLIC_ENABLE_SOCIAL_LOGIN` remains false until those checks pass.
