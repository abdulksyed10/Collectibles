# Collectibles: mobile library and collection sharing

## Scope

User requested a plain signed-in interface, mobile-first layout, private/public tabs, opt-in collection sharing, and a collection acquired date defaulting to today. Remove decorative slogans and repeated privacy badges inside the app. Landing/login copy can remain.

## Product and interface decisions

- Private/Public tabs filter the owner's own collections and their items. All new and existing collections default to private. Sharing is an explicit saved visibility choice.
- A public collection has a read-only link that works without signing in. The shared projection exposes collection name/description/category name and item names/photos. Item notes, acquired dates, owner IDs, and storage keys are excluded. Public readers have no editing controls.
- Private collections and deleted/frozen accounts return the same unavailable response as nonexistent links. Making a collection private blocks new metadata/photo reads. R2 stays private. The public image endpoint proxies bytes after a visibility check instead of distributing signed R2 URLs, with no-store headers.
- `Collection` adds `visibility: 'private' | 'public'` and `acquired_on: string` (YYYY-MM-DD). `CollectionDraft` adds optional `visibility` and `acquiredOn`; omitted updates preserve values. New client records use today's local calendar date; database fallback is current_date. Existing rows use their creation date.
- `listItems` options add `visibility?`; category/collection/visibility filters combine. `useLibrary(categoryId, collectionId, search, visibility)` returns all owned categories/collections plus matching items; UI filters collection navigation by visibility.
- `SharedCollectionPage`: `{ collection: {id,name,description,categoryName}, items: {id,title,hasPhoto}[], total, hasMore }`. `get_shared_collection(p_collection_id uuid,p_page integer default 0)` is the only anonymous metadata RPC, bounded to 24 items/page; returns null for unavailable collections. Raw tables retain owner-only grants/RLS.
- New `public-media` Edge Function: GET `?collectionId=<uuid>&itemId=<uuid>&size=full|thumb`, visibility/account/collection-membership checked before reading R2. No auth required for this read-only path; existing authenticated `media` handler stays unchanged. Error JSON must not contain provider information or object keys.
- Client read-only route: `/?collection=<uuid>`; native URL handling supports the same query. Share links use the current web origin or `EXPO_PUBLIC_WEB_URL` on native. Demo sharing remains local with a read-only preview; it must not issue a fake share link.
- Repository adds `readSharedCollection(id,page)` for live and demo data. UI receives `onPreviewShared(id)` from App for demo/local preview. Root owns shared-screen routing and link helpers; library owner UI calls a root helper `shareCollectionLink(id)` only for live sessions.

## Work and verification

1. Backend forward migration, bounded public projection, public image proxy and privacy/revocation tests. Never edit the three applied migrations. Root applies reviewed migration; service deployment remains an explicitly tracked integration stage.
2. Plain mobile UI: compact header, private/public tabs, concise controls/errors, collection date/visibility editor, share and read-only preview. Keep existing CRUD/partial-upload retry behavior and category navigation.
3. Models, date validation, repositories/demo, shared route, tests and setup docs. Optional native web URL remains an ignored configuration value.
4. Review privacy boundary; run TypeScript, domain/backend tests, browser owner/public/revocation scenarios and build checks. Apply migration and checkpoint/commit locally with secret scanning.

The async clarification questions did not change the user's explicit request to continue; the above conservative sharing projection and own-collection tabs are the working defaults. No actual collection is made public by the migration or deployment.
