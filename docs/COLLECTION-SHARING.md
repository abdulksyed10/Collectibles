# Collection sharing and entry visibility

## In the app

**My collections** is the signed-in owner's workspace. A collection is the top-level group, such as Pins, Bottle Caps, Pokémon cards, or Boots. Categories are optional subgroups inside one collection, such as National parks or Local breweries. The All collections view shows every owned entry by newest upload; selecting a collection shows its All entries view and its child categories.

Every entry has its own visibility. A new entry is **Private** by default. Making one entry Public does not publish other entries in its collection or category. Entries can have no category.

New collections default their acquired date to the device's local current date. A migrated collection with no known date remains undated until the owner adds one. Category deletion detaches its entries without deleting entries, photos, or changing their visibility.

**Explore** opens on a paginated grid of shared entries, ordered by most recent upload. Each card contains only the entry name, photo when one is shared, and collection name. The Collections switch shows a separate catalog of collections that contain at least one public entry; its counts and cover images include public entries only. Explore does not expose categories. A share link identifies a collection and works only while that collection contains a public entry. It never changes visibility. The app disables sharing when there is nothing public to show.

Visitors receive only the collection name, public entry names, public photos, and category names represented by public entries. Notes, acquired dates, owner IDs, object keys, private entries, and empty/private categories are never in the public projection. A legacy link from the former hierarchy remains restricted to its mapped category rather than widening to the full collection.

Switching an entry back to Private blocks subsequent shared metadata and photo reads. Open shared views recheck availability periodically and on foregrounding. Previously downloaded images, screenshots, and copied links cannot be recalled.

## Schema and access

The final model is installed by `202609240002_collection_first.sql` after the bridge migration `202609240001_public_image_lookup_bridge.sql`:

- `collections` contains the owner, name, description, optional `acquired_on`, and timestamps. It has no visibility or category column.
- `categories` has an immutable `collection_id` parent, optional description/date, and owner identity.
- `items` has `collection_id`, nullable `category_id`, and `visibility` (`private` or `public`). The composite foreign key prevents a category from another collection being selected.
- `public.delete_category(uuid)` is the only authenticated deletion route for a category. It owner-locks, detaches matching entries, and deletes the category.
- `public.get_shared_collection`, `public.list_public_entries`, and `public.list_public_collections` expose bounded public projections. `public.list_owned_collections` is owner-only and supplies collection summaries without fetching every entry.

Raw tables retain owner-only RLS. Anonymous users cannot query them. The public RPCs use security definer functions with fixed search paths and omit private fields. `private.resolve_public_image` independently checks the same collection/category scope and item visibility before the public-media function can ask R2 for a key.

`GET /functions/v1/public-media?collectionId=<uuid>&itemId=<uuid>&size=thumb|full` returns a public image only for a currently public entry in the resolved canonical or legacy scope. Responses use `Cache-Control: no-store`.

## Deployment sequence

The new migrations are **not deployed by source changes alone**. Use the maintenance runbook in [BACKEND.md](BACKEND.md) and record the result in [DEPLOYMENT-CHECKPOINT.md](DEPLOYMENT-CHECKPOINT.md).

1. Back up metadata and record the live migration/function versions and media-limit switches.
2. Deploy the maintenance-capable `media` function, set `MEDIA_MUTATIONS_ENABLED=false`, and drain in-flight metadata writes.
3. Apply the bridge migration, deploy bridge-aware `public-media`, then apply the transactional collection-first migration.
4. Keep the R2 bucket private. Configure only server-side R2/database values in ignored `supabase/.env.local`; deploy `media` and `public-media` with those secrets.
5. Use disposable owner and viewer accounts to verify private-entry denial, explicit publication, revocation, category detachment, legacy-link scope, quotas, and public bucket denial before enabling the connected app for beta users.

The local test suite and browser fixture validate projections and access rules with synthetic data. They do not prove live R2 writes, email delivery, native behavior, or the deployed Supabase schema.
