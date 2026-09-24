# Collectibles: collections first and entry visibility

Status: finalized design proposal for the user's next implementation instruction. This document does not authorize implementation or deployment. The user explicitly confirmed independent entry visibility; the remaining UX choices below are the recommended defaults for this plan.

## Outcome

Users create collections such as Bottle Caps, Pins, Pokémon Cards, or Boots. Each collection can contain user-created categories. Entries belong to one collection and optionally one category inside that collection. Organization never controls visibility.

## Global constraints

- Brand: Collectibles; no promotional slogans inside the signed-in app.
- Platforms: React Native + Expo for Android, iOS, and responsive web; mobile first.
- Hierarchy: collection -> optional category -> entry; one category level for beta.
- Visibility: each entry is private by default; collections and categories have no active visibility setting.
- New accounts: no automatically created collections, categories, or sample entries.
- All is a virtual view, never a database row or an upload destination.
- Sharing must never expose private entries, their counts, their images, or categories containing only private entries.
- R2 stays private; preserve existing image identities, object keys, and server-enforced upload/read budgets.
- Credentials remain in ignored local files or service secret stores; no secret values or user-data exports in Git.
- No implementation, service changes, migration, commit, or push before the user's next implementation instruction.

## Navigation and first use

Main tabs are **My collections** and **Public**. This is the recommended naming decision: the owner's library includes both private and public entries. An entry does not disappear from its owner's library when published. Within the owner's library, a visibility filter offers All, Private, and Public; it is distinct from the collection navigation's All view.

Global Collections > All shows collection cards ordered by the newest entry added to each collection. Opening a collection shows its All entry view, with its optional categories nested beneath it. Use an expandable collection picker on phones and a nested sidebar on wider screens. Only show the selected collection's categories in its content view. Keep Add collection and Add category distinct; Add category is available only within a selected collection.

```text
My collections
  All collections
  Bottle Caps
    All entries
    Local breweries
    Travel
  Pins
    All entries
    National parks
  Pokémon Cards
    All entries
```

The visible navigation label can remain All where its parent makes the scope clear. Accessible labels distinguish All collections from All entries. An entry without a category appears in its collection's All view. No required Uncategorized category is stored.

Fresh accounts see All and Add collection with a short empty state: "No collections yet." Form placeholders can say "e.g. Bottle Caps" and "e.g. Local breweries." The existing isolated demo may demonstrate sample content; it never populates a real account. An optional template-creation feature is deferred from this implementation.

The first Add item action lets the user create a collection and then returns them to adding the item. Cancelling does not create an item. A collection without categories can immediately accept entries.

The Public tab remains a browsable collection-card catalog for beta: each card represents a collection with at least one public entry. Opening it shows only public entries. It can contain the viewer's own shared entries and other users' shared entries; opening the viewer's own card offers Manage in My collections. Owner navigation filters never restrict another person's public catalog.

## Entry creation and editing

- Required: item name and collection. Existing notes/photo behavior remains.
- Optional: one category belonging to the chosen collection. Default is no category.
- Visibility control: Private / Public; Private is the default for every new entry, including entries created in a collection that already contains public entries.
- Editing an existing entry retains its visibility unless the user explicitly changes it. Omitted update fields do not reset visibility.
- Moving between collections clears an incompatible category in the same write, or uses the explicitly chosen valid destination category. Visibility and image identity remain unchanged.
- Renaming collections/categories changes labels, not membership or visibility.
- Each current entry has one photo plus its thumbnail. This work does not add a multi-photo feature. If multiple photos are added later, they follow the entry's visibility.
- Keep the existing collection acquired-date capability, defaulting to today's local date for newly created collections; allow no date when it is unknown. Acquired dates are owner-only and do not drive upload ordering.

For ordering, "newest upload" means the entry's original `created_at` (date added). Editing an entry, replacing a photo, changing visibility, and moving an entry do not reset this timestamp. Entries sort by `(created_at DESC, id DESC)`. Collection cards sort by the maximum visible entry timestamp; an empty owner collection falls back to its own creation timestamp. Public ordering uses only public entries, so private activity does not affect public order or counts. No personalized feed algorithm is included.

## Deletion and moves

- Delete category: retain its entries and images in the collection; set their category to null. Explain this in the existing confirmation sheet. Visibility is unchanged.
- Category reparenting is not offered for beta. To reorganize across collections, move individual entries. The database prevents clients from silently reparenting a populated category.
- Delete collection: existing explicit destructive confirmation lists that its categories, entries, and photos will be removed. Keep the existing server media cleanup/retry workflow; no direct client cascade bypass.
- Account deletion also removes new categories and legacy share aliases and continues to freeze concurrent owner writes.

## Privacy and sharing

`items.visibility` is the sole authority. Collection/category settings never publish or hide descendants. A share link is a filtered view, not a publication action. Sharing a collection includes its currently public entries only. A collection with no public entries has no public card; its shared route returns unavailable without leaking its name or counts.

Public projections may expose item ID/title/photo presence, the collection ID/name, and the assigned category ID/name for public entries. Collection/category descriptions, acquired dates, item notes, owner IDs/emails, and R2 keys remain owner-only. The publish control uses plain helper text explaining that item title, photo, and collection/category names are visible to others. Public descriptions are omitted even though the old API exposed collection descriptions.

Public counts, covers, categories, search, sorting, and pagination all use the same public-entry predicate. Categories with no public entries are omitted. Public images are served only after checking entry visibility, owner deletion state, collection membership, and any legacy link scope. Keep public responses/images non-cacheable and recheck foregrounded/refreshed views. A newly private entry must fail subsequent public image requests, including requests through old URLs. Already downloaded images cannot be recalled; do not promise otherwise.

Owner-only image reads retain the existing authenticated media path. Public paths never issue reusable R2 signed URLs. Sharing makes no bucket or object ACL public.

## Database design

| Entity | Relevant fields | Relationships |
| --- | --- | --- |
| collections | id, owner_id, name, description, acquired_on (nullable), created_at | Owned by one account; no category_id or visibility |
| categories | id, owner_id, collection_id, name, description, acquired_on (nullable), created_at | One parent collection; no visibility |
| items | existing fields, category_id (nullable), visibility | Required collection, optional category in that same collection and account |
| item_images | existing fields | Existing entry/image identity and keys unchanged |
| private.legacy_collection_shares | legacy_collection_id, owner_id, collection_id, category_id | Resolves old share URLs to a category-scoped view in the new parent collection |

Category description/acquired_on preserve metadata from old collection rows that become categories. New categories require only a name and default these extra fields to empty/null. The owner can see/edit preserved fields under a collapsed Details section; these fields are not public and do not confer visibility. Newly promoted collections have an unknown acquired date (null), rather than an invented acquisition date. Newly created collections default to today.

Use composite foreign keys to enforce both owner and parent collection membership. An owner-locked delete_category RPC nulls only items.category_id before deleting a category; it never changes owner_id or collection_id. Direct client category deletion is revoked. A deferred NO ACTION item-to-category foreign key allows account/collection cascades to finish without a SET NULL update conflicting with the account-deletion freeze. Raw tables remain owner-only through RLS and restricted write grants. Public access uses bounded projection RPCs and the image proxy.

Metadata limits: at most 50 collections and 50 categories per owner, and 500 entries. Raising the category metadata cap from 20 to 50 is necessary to accommodate up to 50 existing collections becoming child categories. It does not raise image allowances. Preserve owner locking, counter reconciliation, immutable identity, retired-item protection, and account-deletion freeze.

Keep existing media limits unchanged: 100 active photos/account; 20 upload attempts/account/hour; 50/account/day; 200/app/day; 250 MiB/account and 1 GiB/app lifetime byte reservations; 10,000 public photo reads/app/day. Failed/deleted attempts keep their conservative reservations. These are application limits, not provider billing caps.

## Migration and existing links

Default mapping:

```text
Before: category Pins -> collection Travel -> item Park pin
After:  collection Pins -> category Travel -> item Park pin
```

Before live migration, generate an ignored, owner-scoped mapping report and a recoverable database backup. Rehearse the migration against a local copy/fixture containing both visibility states, empty groups, multiple owners, metadata dates/descriptions, and photos. Do not copy credentials or personal records into committed test fixtures.

1. Promote old categories into collections; preserve their names and creation timestamps. Prefer their existing IDs; if an ID collides with a legacy share identifier, allocate a new collection ID and record it in the map. All old collection IDs are reserved for aliases so a new collection cannot hijack an old link.
2. Convert each old collection into a category under its promoted parent. Preserve its ID, name, description, acquired date, and creation timestamp. A new collection starts with an empty description and unknown acquired date because the old category did not have those fields.
3. Preserve every item ID, title, notes, created_at, updated_at, and image row/key. Assign the new collection and converted category. Copy the old collection's visibility onto each item once. Assert that the set of public item IDs is identical before and after migration.
4. Create a private legacy alias for each old collection ID. An old shared link is restricted to the converted category and its public entries. It must never expand to include public siblings under the new parent. If that category is deleted, the alias becomes unavailable; it must never fall back to the whole collection.
5. Recalculate ownership counters, replace constraints/policies/grants/indexes, update public projections, and remove the starter-Pins signup trigger. Preserve existing empty groups: their original creation intent is not recorded, so do not delete them using a name heuristic.
6. Keep an access-restricted metadata snapshot for rollback/audit until the transition is verified. It must participate in account deletion and must not retain user content indefinitely.

Deployment must not leave a media function using obsolete parent visibility as a fallback. First install a stable private database image-lookup function under the current schema and deploy the edge function that calls it. Then switch the schema, RPCs, and lookup function body in a single migration transaction. Old metadata writes must fail instead of silently accepting obsolete parent visibility. Add a server-only MEDIA_MUTATIONS_ENABLED switch, default true, to pause upload/delete actions with a retryable 503 during maintenance while allowing owner reads. Drain existing mutation transactions and restrict metadata mutation grants during the maintenance window; keep public photo reads fail-closed. Release the compatible app and restore grants/switch values only after verification. Never roll back to a public image path that ignores item visibility.

## Acceptance

- Fresh account: no seed rows; create collection and entry without category; entry defaults private.
- Mixed visibility: private/public siblings in the same collection and category behave independently.
- Owner can manage both visibility states; strangers see only public projections and public photos.
- A category from another collection or owner is rejected even through direct API requests.
- Moving entries and deleting categories preserves items, image keys, and visibility.
- Migration preserves public-item identity, all item/image identity and timestamps, and legacy link scope.
- Public-to-private changes remove new public access; stale cards/dialogs clear on revalidation.
- Collection/category names with long text, apostrophes, emoji, or identical sibling labels remain usable; IDs, not names, define identity.
- Pagination and filters agree with counts/covers; rapid navigation cannot restore stale images.
- Quotas, interrupted upload cleanup, collection deletion, and account deletion still pass.
- Mobile web at 320/390 px, tablet, desktop, Android, and iOS workflows are verified at the appropriate build/device stage.

## Boundaries and current service evidence

Planning only on September 24, 2026. Earlier read-only checks returned HTTP 200 for authenticated R2 bucket access and for an existing image through deployed Supabase public-media. This confirms the existing read integration, not completion of this redesign or device/store launch readiness.

After this work, resume `docs/BETA-LAUNCH.md`: HTTPS hosting/origins and auth email delivery, operational cleanup/alerts, public-content moderation, and signed Android/iOS beta builds remain separate launch work. Recheck time-sensitive provider/store requirements when executing that checklist. No hosting choice, new provider, dependency upgrade, multi-photo support, unlimited nested folders, or recommendation algorithm is part of this redesign.
