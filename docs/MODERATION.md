# Moderation and review

Public entries appear in Explore as soon as their owner makes them public. A basic server-side text check rejects prohibited terms in public item titles, collection names, and category names. It does not inspect images; members can report those through the app.

## Reports and automatic review

- Only authenticated members can report an entry or collection.
- One account contributes at most one active report to a target in each review cycle. Changing the reason or submitting again does not increase the count.
- The default threshold is **five distinct reporting accounts**. On the fifth report, the target leaves Explore and enters the review queue.
- If the target is a collection, every public entry in that collection is hidden from Explore, collection pages, topic pages, and public media while it is in review.
- Restoring a target resolves the reports that triggered that cycle. Five new distinct reports are needed to hide it again.

The threshold is stored in `private.moderation_config`, so it can be raised later without changing the app. Use the SQL Editor only with a deliberate review of the current value:

```sql
update private.moderation_config
set report_threshold = 10,
    updated_at = now()
where singleton = true;
```

## Initial rollout

Apply migrations forward only; do not reset the hosted database. Apply the existing `202610040001` through `202610040006` migrations first, then `202610050001_report_threshold_review.sql`. Deploy the `media`, `public-media`, `public-safety`, and `provider-grants` functions from the same revision after the migration. `public-safety` deliberately rejects legacy anonymous reports; member reports use the database RPC.

After the migration and a successful deployment, grant the first administrator. This script reads ignored local server configuration and never prints keys or user IDs:

```powershell
npx tsx supabase/scripts/grant-admin.ts abdulksyed10@gmail.com
```

The account must already exist in Supabase Auth. Signing in with that account adds **Admin review** to the Account sheet. The database remains the authority: a client cannot gain access by changing its email or UI state.

## Review procedure

Open **Account → Admin review** while signed in as an administrator. The queue contains only report counts and reason totals, never reporter identities. For an item, the screen requests a bounded image thumbnail through the authenticated media function; it never exposes an R2 URL. Select **Restore** if it should return to Explore or **Remove** if it should remain unavailable. Check the support mailbox for appeals without revealing who reported the content.

Use the queue daily while beta is open. Review privacy complaints, threats, scams, and sexual content first. Basic text screening is a backstop, not a replacement for member reports and human review.