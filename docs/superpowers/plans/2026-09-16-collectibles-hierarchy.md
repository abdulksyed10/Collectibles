# Collectibles: categories, collections, and items

## Approved scope

The user asked to broaden the existing app beyond pins, rename it Collectibles, and update both UI and database. The hierarchy is private, owner-scoped **category → collection → item**. Pins is a starter category; users can add and rename categories for any kind of collectible.

## Decisions and constraints

- Preserve all existing records and R2 object keys. Add a forward migration; never edit the two applied migrations.
- Rename `pins` / `pin_images` to `items` / `item_images`, including item IDs and media API vocabulary. The media function has not been deployed yet.
- Each collection has a required category belonging to the same owner. Backfill existing collections under that owner's Pins category. Provision Pins for existing and future auth users.
- Categories can be created, renamed, and deleted when empty. The database prevents deleting one that still contains collections. Collection/item deletion continues through the media service so photos are cleaned up.
- Limits: 20 categories, 50 collections, 500 items per account. Ownership and quotas remain enforced by the database.
- Category selection filters items across its collections; collection selection narrows that view. Moving a collection changes its category without moving photos.
- Client interface: `Category {id,owner_id,name,created_at}`, `CategoryDraft {name}`; `Collection` adds `category_id`, `CollectionDraft` adds `categoryId`; `Pin` becomes `Item`, `PinDraft` becomes `ItemDraft`, `PinImage.pinId` becomes `ItemImage.itemId`; `listItems({categoryId?,collectionId?,search,page})` returns `{items,total,hasMore}`. Add list/save/deleteCategory. Media accepts itemId/itemIds and delete-item.

## Tasks

1. Backend: migration, category provisioning/ownership/quotas, generic media code and schema verification, migration and media regression tests.
2. App: generic models/repository/demo; category filtering and collection association; Collectibles branding and editors; domain and browser tests.
3. Review and verify: typecheck, tests, browser workflows, build; review ownership and migration preservation.
4. Apply reviewed migration to the authorized Supabase project; verify schema. Record a checkpoint and commit locally. R2 deployment remains the following service stage.

## Validation

Test migration from populated old schema, cross-owner category/collection rejection, empty-only category deletion, starter provisioning, quotas, preservation of existing image keys, and media lifecycle regressions. Test category creation, collection moves and filtered item results in demo and the browser. Do not expose credentials, push to an unresolved remote, or claim native-device verification from web tests.
