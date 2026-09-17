# Live services and upload budgets

## Authorized scope

Connect the existing Supabase project and private R2 bucket, enforce upload abuse limits before enabling the client, and verify actual service behavior. User requested the deployment and cost protection; routine implementation and deployment are authorized. Do not publish to GitHub until the separate repository-destination question is answered. Never print secrets or place them in Git.

## Design

- Keep current 2 MiB JPEG / 200 KiB thumbnail / one-photo-per-item checks and owner RLS.
- Enforce 100 active photos/account, 20 upload attempts/hour, 50/day, 200/day across the app; use durable database state shared by every function instance. Count invalid and failed attempts once ownership/basic-action checks pass, before decoding.
- Reserve validated full+thumbnail byte sizes durably before any PUT. Cap cumulative reservations at 250 MiB/account and 1 GiB/app. Include failed, abandoned and deleted attempts; automatic deletion/cleanup must not refund this conservative budget because remote late PUTs can occur. An operator may increase the budget after reconciling storage. Legacy reservations are conservatively backfilled.
- Serialize account photo-count/pending-attempt reservations and global byte counters without holding a global lock across R2 I/O. Recheck active photo count under owner lock before committing another image. Clients cannot access limits, counters or inventory. Database failures fail closed.
- Add an operator upload switch and public-read switch. Bound anonymous public-media R2 reads to 10,000/day/app; this limits R2 operations but does not prevent invocation billing. Do not claim a guaranteed provider bill cap.
- Recommend invite-only beta to prevent multiple-account quota evasion. Optional user question is pending; proceed with safe preparation. Preserve public collection viewing.
- Inspect real provider privacy/configuration and spending controls without changing plans or purchasing services. Deploy both media functions only after tests/review. Keep R2 keys and database credentials server-only.
- Verify with disposable accounts and small images: ownership isolation, upload/read, public projection/revocation, bad payloads, delete/cleanup. Remove only records and objects created by the checks. Enable local backend only once actual service checks pass.

## Work

1. Backend migration, budget logic, request/cleanup behavior and meaningful adversarial tests (agent).
2. Service preflight, R2 privacy/CORS and CLI/auth setup, safe operational scripts, client errors/configuration (root).
3. Review and deploy; live acceptance; final build/browser verification, docs and local commit (root/reviewer).

## Boundaries

R2 storage/operations elsewhere in the account, platform compute or invocation costs, and adversarial traffic denied after function invocation are outside app upload-budget guarantees. Keep Supabase Free or the Pro Spend Cap enabled; confirm the actual organization setting. Public hosting and app-store publication are separate from connecting the local app to services.
