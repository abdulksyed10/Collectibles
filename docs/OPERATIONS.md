# Collectibles operations runbook

This runbook is for the person operating Collectibles. It is not a substitute for a production dashboard review. Do not put credentials in this file, Git, Vercel client variables, or an Expo build.

## Before enabling public beta

1. Apply migrations forward, including `202610040002` through `202610040006`. Do not reset the Supabase project. The publication migration moves existing public entries into review, so review them before public beta.
2. Deploy `media`, `public-media`, `public-safety`, and `provider-grants` Edge Functions from the reviewed commit.
3. Set server-only Edge Function secrets from `supabase/.env.example`. Use a bucket-scoped R2 token. Set `MEDIA_ALLOWED_ORIGINS` to the exact production web origin; do not include a wildcard.
4. Configure GitHub production-maintenance environment secrets and set the repository variable `COLLECTIBLES_MAINTENANCE_ENABLED=true` only after a dry run succeeds. The daily job removes tracked orphaned media, purges expired short-term safety records, and resumes frozen account deletions.
5. Configure Supabase custom SMTP, email confirmation, password rules, rate limits, CAPTCHA, and the signup admission hook in the hosted dashboard. Repository files do not change those live settings.
6. Set provider billing and quota alerts for Supabase, Cloudflare R2, Vercel, SMTP, and EAS. Keep the media emergency switch available for incidents.
7. Name a reviewer who checks the moderation queue and the support mailbox every day while public sharing is enabled.

## Content and safety response

- Public submissions stay pending until an operator approves them. The operator uses `supabase/scripts/review-public-content.ts` with a server-only database connection; do not expose the review RPC to a client.
- For an urgent report, first unpublish/remove the affected entry, preserve only the minimum report/audit information needed to act, and document the decision in the moderation reason.
- Use the dashboard or restricted operator tooling to restrict repeat abuse. Do not try to identify or contact a reporter from the public app.
- Guest blocks apply to that device and browser profile. Account blocks apply only to the signed-in account. Neither is a promise that a person cannot access a copied image outside the app.

## Account deletion recovery

- A deletion first freezes the account and records the photo inventory before making R2 calls.
- `storage_pending` or `needs_attention/storage_delete_failed` means R2 removal must be retried. The user cannot upload or share while frozen.
- `provider_pending` begins provider revocation and Auth deletion. `provider_processing` is a ten-minute lease; daily maintenance retries a stale lease after a timeout.
- `needs_attention/apple_reauthentication_required` means the user must sign in with Apple again before deletion can revoke Apple authorization. Support should give the user the in-app steps, not request their Apple password or token.
- Do not manually set a job to complete until the R2 inventory, provider grant state, and Supabase Auth state have been checked with privileged operator access.

## Incident actions

| Incident | Immediate action | Follow-up |
| --- | --- | --- |
| Suspected media abuse or unexpected R2 spend | Disable uploads in `private.media_limits`; investigate counters and inventory | Rotate the scoped R2 credential if exposure is suspected and check cleanup results |
| Public harmful content | Remove/reject the item and record moderation reason | Review reports, restrict repeat misuse, and respond through support when appropriate |
| Function or maintenance failure | Check sanitized function/job logs and keep affected accounts frozen | Retry only the relevant job after correcting secrets/configuration |
| Possible secret exposure | Revoke/rotate the affected credential immediately | Search history/logs, redeploy with the new secret, and document scope |

## Evidence to retain for each beta release

Record the commit, deployed migration/function versions, hosted web URL, EAS build IDs, device test results, reviewer on call, maintenance run result, and provider alert configuration. Never attach secret values to that record.
