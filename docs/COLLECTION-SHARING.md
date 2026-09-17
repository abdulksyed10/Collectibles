# Collection visibility and dates

## In the app

The Private tab shows the signed-in owner's private collections. The Public tab is a paginated catalog of collections people have chosen to share. Categories still describe collectible types such as Pins, Pokémon Cards, Bottle Caps or Boots. Each category can contain multiple collections, and each collection contains items. Owners can use Manage on their own public card to edit its items or visibility.

New collections are created from the Private tab and default to Private. Their acquired date defaults to the device's current local date. The editor provides a calendar and Today action. Dates are saved as calendar dates without a time zone. Existing collections receive their original creation date during migration.

To share, edit a collection, select Public and save. Share collection opens the device share menu or copies the web link. Preview public view shows the same read-only content. The demo only supports the preview because its temporary data has no public server.

Visitors see collection name, description, category name, item names, and public photos. Notes, acquired dates, owner IDs and storage keys remain private. New items can be added while managing one of your own collections. Moving an existing item into a public collection also publishes its name/photo; the editor labels the destination visibility.

Switching back to Private blocks subsequent public reads. Open viewers recheck availability periodically and when returning to the foreground. Previously downloaded images, screenshots and other copies cannot be recalled.

## Schema and access

Apply the forward migration `202609160003_collection_sharing.sql` after the first three migrations. It adds:

- `collections.visibility`: required `private` or `public`, default `private`.
- `collections.acquired_on`: required calendar date, default `current_date`, restricted to years 0001–9999.
- `get_shared_collection(p_collection_id uuid, p_page integer default 0)`: anonymous read-only JSON projection, 24 items per page, pages 0–20. Unavailable, private and deleting-owner collections all return null.

Raw tables keep their owner-only grants and row-level security. The RPC uses a fixed empty search path, explicit columns and a public-visibility check. It never includes notes, acquired dates, owner IDs or object keys.

`GET /functions/v1/public-media?collectionId=<uuid>&itemId=<uuid>&size=thumb|full` independently checks visibility, account state and item membership before fetching a bounded JPEG from the private R2 bucket. Responses prevent caching. Existing authenticated upload/read/delete actions remain in `media`.

## Deployment

1. Inspect linked migration history and `supabase db push --dry-run`, then apply the forward migration. Never reset the database.
2. Verify R2 private access and configure the server-only values in ignored `supabase/.env.local`. `public-media` shares the existing R2/database configuration. Include the exact hosted web origin in `MEDIA_ALLOWED_ORIGINS`.
3. Set hosted secrets from that ignored file, then deploy **both** `media` and `public-media`. Their entries in `supabase/config.toml` use the media import map. Public media needs no user JWT; owner media validates JWTs in code.
4. Host the exported web app. Set `EXPO_PUBLIC_WEB_URL` to that HTTPS app URL for native share links; web sharing uses the current app URL. This is not the Supabase project URL. Query parameters and auth fragments are removed when creating links.
5. Enable the frontend backend flag only after live acceptance. Test private access with two accounts, then explicitly share a disposable collection and open its link signed out. Check names/photos, private-field exclusion and revocation of metadata and photos. Delete disposable data afterward.

The code and local tests are not proof that hosted media or web sharing is deployed. The latest live status is recorded in [the deployment checkpoint](DEPLOYMENT-CHECKPOINT.md).

## Checks

`npm test` includes actual migration/grant tests in PGlite, date validation, safe link construction, demo projection, public image authorization and R2 read bounds. Fixture-connected browser tests cover the owner and anonymous reader paths. These substitutes for remote I/O do not replace live two-account acceptance or native-device testing.

Run server checks with:

```sh
deno task --config supabase/functions/media/deno.json check
```
