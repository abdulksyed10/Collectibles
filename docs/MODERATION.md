# Moderating public entries

The October 4 safety migrations are **not yet deployed**. They make existing public entries pending without changing IDs, ownership or R2 keys. Only an approved current revision appears in Explore, topic counts/covers, shared pages or the public photo proxy. Title, collection-name/membership and photo changes invalidate approval. Notes and acquired dates stay private.

## Deploy in order

1. Verify a recoverable database backup and the current migration list; never reset production.
2. Assign a person to check submissions/reports and the support inbox while beta is open. Publisher contact: Abdul Syed, abdulksyed10@gmail.com.
3. Explain the one-time review of existing public entries to testers. Apply the additive October 4 migrations **before** the dependent frontend, then deploy `media`, `public-media`, `public-safety`, and `provider-grants` (provider-grants can remain unconfigured while social login is disabled).
4. Configure the new server secrets described in `.env.example` and `supabase/.env.example`, then deploy the frontend. Old clients may read/delete but cannot bypass new policy or publication gates.
5. Inspect and approve existing public submissions. Verify with a second account and a signed-out browser, including direct image URLs.

## Operator commands

Run from the repository root with Deno 2.9.6. Keep credentials only in ignored `supabase/.env.local`. The database connection is privileged: run locally as the publisher, never inside the app or an untrusted CI branch.

```sh
deno run --config supabase/functions/media/deno.json --env-file=supabase/.env.local --allow-env --allow-net --allow-write=.tmp supabase/scripts/review-public-content.ts queue
```

Replace `queue` at the end with:

| Command | Result |
| --- | --- |
| `view ITEM_UUID` | Creates ignored `.tmp/moderation-preview.html`, containing submitted title, collection name, full photo and thumbnail with five-minute links. Open locally. |
| `approve ITEM_UUID REVISION "Approved"` | Approves the exact inspected revision. A concurrent edit causes a conflict: refresh and inspect again. |
| `reject ITEM_UUID REVISION "Short reason for owner"` | Rejects publication and records a concise owner-visible reason. |
| `remove ITEM_UUID REVISION "Short reason for owner"` | Removes previously approved content from all public surfaces. |
| `reports` | Lists up to 50 open report targets/reasons. |
| `report REPORT_NUMBER` | Opens details in ignored `.tmp/report-preview.txt`, without copying free text into normal logs. |
| `resolve REPORT_NUMBER resolved "Operator note"` | Resolves the report after taking any necessary removal action. Use `dismissed` for a reviewed report requiring no action. |
| `suspend PUBLIC_PUBLISHER_UUID` | Hides all entries from that publisher; private library and deletion remain available. |

The review procedure locks the publication row and checks its revision. Do not approve by manually editing table columns. Review both image sizes, title and collection name against the Community rules. Never open executable downloads or share local previews/temporary image URLs. An operator can change a suspension using the private table in the SQL Editor after reviewing an appeal; there is no app-facing admin permission.

## Reports, blocks and response process

Authenticated reports get their reporter identity from Supabase Auth. Guest reports require server-verified Turnstile. Both use bounded text, deduplication, transactional limits and the same acknowledgement for nonexistent/private targets. The endpoint does not trust submitted reporter IDs or forwarding headers.

Limits: 5 reports/source/hour, 20/source/day, 200/app/day. Until a trusted ingress IP assertion is available, **all guests share one 5/hour and 20/day bucket**. This conservative beta choice may require genuine visitors to use support when the bucket is full. Do not replace it with arbitrary X-Forwarded-For.

Account blocks apply across devices through filtered SQL projections. Guest blocks are stored on that device and sent as a bounded viewing preference; counts and covers are filtered too. A block does not make a public URL confidential.

Check queue and support at least daily while beta is open. Prioritize exploitation, threats, privacy disclosures and scams; remove access while investigating. Resolve reports only after actioning the content. Reply to appeals through the monitored support process, without disclosing reporters. No guaranteed response time is advertised until the publisher can maintain it.

Resolved reports: purge after 30 days. Moderation audit: 90 days. Open reports: retain until resolved. Maintenance removes expired counters; photo deletion guards/lifetime budgets remain. See OPERATIONS.md for scheduling and backup handling.
