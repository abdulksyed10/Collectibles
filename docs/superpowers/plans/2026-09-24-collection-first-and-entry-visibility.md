# Collection-first organization and entry visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution stays in this task; do not start implementation before the user's next implementation instruction.

**Goal:** Let people organize independently private/public entries in their own collections and optional child categories, preserving existing data and R2 integration.

**Architecture:** Supabase remains the owner-data and authentication backend; entry visibility governs bounded public projections and a private R2 image proxy. Reverse the current grouping through a rehearsed migration with legacy link aliases. A stable SQL image-lookup interface bridges the edge-function deployment and transactional schema switch.

**Tech Stack:** Existing React Native 0.86.3, React 19.2.3, Expo 57, TypeScript, Supabase/PostgreSQL, Deno edge functions, Cloudflare R2, Node test runner/PGlite, and Playwright. No dependency upgrades are needed for this change.

**Spec:** `docs/superpowers/specs/2026-09-24-collection-first-design.md` (read it with this plan).

## Global Constraints

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

## Review Focus

- An omitted visibility during editing or a category move must not publish an entry or reset an existing public entry to private: Tasks 2 and 4.
- An old collection share URL must not expand to public siblings after becoming a category: Tasks 1 and 3.
- Private-only activity must not change public covers, counts, category lists, ordering, or subsequent pages: Task 3.
- A category deletion racing an entry move/upload must preserve ownership, image identity, and counter correctness: Tasks 2 and 3.
- Returning to a backgrounded public dialog after revocation must clear old entry metadata and images without restoring a stale in-flight response: Task 5.

## Execution boundary and file map

This turn creates only these planning documents. After the implementation instruction, work on an isolated `codex/` branch/worktree if necessary to protect unrelated changes. Keep credentials in the existing ignored local environment. Do not recreate Supabase or R2. Do not treat completing implementation as authorization for unrelated beta features.

Existing files and responsibilities:

| Area | Files |
| --- | --- |
| Domain types and validation | `src/domain/models.ts`, `src/domain/validation.ts`, `src/domain/dates.ts` |
| Live/demo repositories | `src/data/repository.ts`, `src/data/demo.ts`, `src/data/useLibrary.ts` |
| Owner UI and editors | `src/screens/LibraryScreen.tsx`, `src/screens/Editors.tsx`, `src/components/AcquiredDateField.tsx`, `src/components/AcquiredDateField.web.tsx` |
| Public UI and URL handling | `src/screens/PublicCatalog.tsx`, `src/screens/SharedCollectionScreen.tsx`, `src/domain/sharing.ts`, `src/lib/sharing.ts` |
| Database | new migrations only in `supabase/migrations`; do not edit the six deployed migrations |
| Photo authorization and deletion | `supabase/functions/public-media/lookup.ts`, `supabase/functions/public-media/http.ts`, `supabase/functions/media/service.ts` |
| Tests | `tests/hierarchy.test.ts`, `tests/domain.test.ts`, `tests/demo.test.ts`, `tests/sharing.test.ts`, `tests/backend/*.test.ts`, `tests/e2e/app.spec.ts`, `tests/e2e/shared-refresh.spec.ts` |
| CI, verification, and handoff | `.github/workflows/verify.yml`, `scripts/verify-schema.sql`, `docs/BACKEND.md`, `docs/COLLECTION-SHARING.md`, `docs/DEPLOYMENT-CHECKPOINT.md`, `docs/BETA-LAUNCH.md`, `docs/VERIFICATION.md` |

New focused files are specified in the owning task below. Avoid broad unrelated refactors of the existing large screens.

## Task 1: migration rehearsal and an image-lookup bridge

**Files:** Create `supabase/migrations/202609240001_public_image_lookup_bridge.sql`, `scripts/preview-hierarchy-migration.sql`, `tests/backend/collection-first-migration.test.ts`, `tests/backend/hierarchy-fixture.ts`. Modify `tests/backend/migrations.ts`, `supabase/functions/public-media/lookup.ts`, `supabase/functions/media/http.ts`, `supabase/functions/media/index.ts`, `tests/backend/http.test.ts`, and `tests/backend/sharing.test.ts`.

**Interfaces:** Preserve `lookupPublicImage(db, collectionId, itemId, size): Promise<string | null>`. Introduce `private.resolve_public_image(p_collection_id uuid, p_item_id uuid) RETURNS TABLE(full_key text, thumb_key text)`. Only the server database role may execute this helper; anon/authenticated cannot receive keys. The bridge migration uses the CURRENT schema's collection visibility and membership checks. Task 3 replaces its body under the new schema.

- [ ] Extend the migration test loader with an upper filename bound so a fixture can stop at the deployed schema before applying the new migrations:

```ts
export async function applyMigrations(
  db: { exec(sql: string): Promise<unknown> },
  after = '', through = '~',
) {
  const directory = 'supabase/migrations';
  for (const filename of (await readdir(directory))
    .filter(name => name.endsWith('.sql') && name > after && name <= through).sort()) {
    await db.exec(await readFile(`${directory}/${filename}`, 'utf8'));
  }
}
```

- [ ] Create `hierarchy-fixture.ts` exporting `createHierarchyFixture(): Promise<PGlite>`: create the anon/authenticated/service_role roles, auth.users, auth.uid(), and grants using the existing sharing-test setup, then apply migrations through `202609170005_public_catalog.sql`. Use synthetic UUIDs and values only. Export `asOwner<T>(db: PGlite, ownerId: string, run: () => Promise<T>): Promise<T>` with `SET ROLE authenticated`, parameterized `set_config('request.jwt.claim.sub', $1, false)`, and role/config reset in finally; never run concurrent role changes on one fixture connection.
- [ ] Add a bridge regression using that legacy fixture: public image lookup returns the existing key; private/cross-owner/foreign-collection reads return null; a deleting owner is denied; authenticated and anon roles cannot execute the key-returning helper. Run `npx tsx --test tests/backend/collection-first-migration.test.ts` and confirm the missing bridge fails before implementation.
- [ ] Implement the private bridge as SECURITY DEFINER with `search_path = ''`, fully qualified identifiers, and explicit revoke/grant statements. Reuse the existing collection/owner/item/image joins exactly; give the helper no fallback on SQL failure. Change the TypeScript lookup query to:

```ts
const rows = await db.query<{ full_key: string; thumb_key: string }>(
  'select full_key, thumb_key from private.resolve_public_image($1, $2)',
  [collectionId, itemId],
);
if (rows.length !== 1) return null;
return size === 'full' ? rows[0].full_key : rows[0].thumb_key;
```

- [ ] Write a read-only migration-preview SQL query joining old categories -> collections -> items with owner equality. Output old/new grouping IDs, names, item totals, visibility totals, and metadata-preservation checks; omit notes, emails, image contents, and credentials. Reserve all old collection IDs as legacy share identifiers. Detect category-ID collisions against that reserved set and allocate replacement parent IDs in the eventual migration map, not by silently reusing a legacy link ID. Save live report output only under ignored `.artifacts` when live work is authorized.
- [ ] Add a tested maintenance guard to createHandler's options: `mutationsEnabled?: boolean`. Immediately after action validation, use `if (options.mutationsEnabled === false && action.action !== 'read') throw new MediaError(503, 'maintenance', 'Changes are temporarily paused. Please try again.');`. Pass `mutationsEnabled: Deno.env.get('MEDIA_MUTATIONS_ENABLED') !== 'false'` from media/index.ts. The HTTP test must prove upload/delete callbacks are never invoked while paused and authenticated reads still work. A missing switch preserves today's behavior. This pauses new requests; the live runbook must also drain already-started transactions.
- [ ] Run the bridge regression and `npx tsx --test tests/backend/sharing.test.ts`; both must pass against the old schema. Commit this independently compatible stage after implementation. Do not deploy it during planning.

## Task 2: collection-first schema, ownership, and deterministic migration

**Files:** Create `supabase/migrations/202609240002_collection_first.sql`. Modify `tests/backend/collection-first-migration.test.ts`, `tests/backend/database.test.ts`, `tests/backend/lifecycle.test.ts`, and other backend fixture inserts that assume starter Pins/categories. Historical migration tests still stop at their original migration bound.

**Interfaces:** Final tables are specified in the design. Private alias rows map a legacy collection ID to one owner, new collection, and new category. Create `private.resolve_shared_scope(p_collection_id uuid) RETURNS TABLE(collection_id uuid, category_id uuid)` for canonical IDs (category null) or legacy IDs (specific category), excluding deleting owners. Grant execution only to the roles needed by security-definer projections/server code. Create `public.delete_category(p_category_id uuid) RETURNS void`, authenticated only, for owner-locked category detachment/deletion.

- [ ] Add a migration test with one owner, old category Pins, old collections Travel/Public and Gifts/Private, two items, and image rows. Record all item/image fields and legacy metadata before migration. Apply the bridge and collection-first migration; assert mapping, copied visibility, and exact preservation of item/image timestamps and keys. Include the following direct invariants:

```ts
const before = await db.query<{ id: string }>(`
  select i.id from public.items i join public.collections c
    on c.id = i.collection_id and c.owner_id = i.owner_id
  where c.visibility = 'public' order by i.id
`);
await applyMigrations(db, '202609170005_public_catalog.sql');
const after = await db.query<{ id: string }>(
  "select id from public.items where visibility = 'public' order by id",
);
assert.deepEqual(after.rows, before.rows);
assert.deepEqual(
  (await db.query('select * from public.item_images order by item_id')).rows,
  imagesBefore,
);
```

`imagesBefore` is captured from the same ordered image query before applying migrations. This test must exercise both old visibility states, not only private defaults.

- [ ] Add role-level tests: fresh signup inserts no collections/categories; own uncategorized insert defaults private; invalid visibility fails; another owner's collection/category fails; same-owner category from a different collection fails; client owner/id changes fail; category reparenting fails; deleted category detaches entries without changing their visibility/images. Run `npx tsx --test tests/backend/collection-first-migration.test.ts tests/backend/database.test.ts` and confirm the expected pre-change failures.
- [ ] Implement the migration in one transaction with explicit locks and a private ID mapping/snapshot. Promote categories to collections, convert old collections to categories, then remap item grouping and backfill visibility. Retain old collection descriptions/acquired dates on the resulting categories. Promote old categories with description `''` and acquired_on null. New collection inserts default acquired_on to current_date; the client supplies local today. Preserve historical items.updated_at by narrowly suspending/restoring the mutation timestamp trigger during backfill. Preserve R2 inventory and counters; do not re-upload or rewrite object keys.
- [ ] Build the final constraints around these relationships:

```sql
-- In addition to primary keys and the existing owner/collection FK on items:
alter table public.categories
  add constraint categories_identity_scope unique (id, collection_id, owner_id),
  add constraint categories_collection_owner_fkey
    foreign key (collection_id, owner_id)
    references public.collections(id, owner_id) on delete cascade;
alter table public.items
  add column category_id uuid,
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  add constraint items_category_scope_fkey
    foreign key (category_id, collection_id, owner_id)
    references public.categories(id, collection_id, owner_id)
    on delete no action deferrable initially deferred;
```

Apply this shape as part of the migration's correctly ordered new-table/backfill sequence, not by adding a second column after backfill. Implement delete_category as SECURITY DEFINER with an empty search_path: require auth.uid(), lock that owner's private.owner_state row, reject deleting owners, resolve only that owner's category, update matching owned items.category_id to null, then delete the owned category. Revoke raw authenticated DELETE on categories. Keep the whole operation transactional. The deferred FK lets auth/collection cascades remove both sides without issuing an item update after the account has been frozen. Test direct auth.users deletion with categories populated, in addition to the app deletion endpoint.

- [ ] Recreate owner policies/column grants and immutable-owner guards on the final tables. Prevent a new collection ID from colliding with any reserved legacy alias; return a generic identity error. Prevent authenticated category.collection_id changes. Update metadata counters and constraints to 50 collections, 50 categories, 500 items. Reconcile counts from final rows while migration writes are locked; restore triggers before commit. Drop only the starter-category trigger/function, retaining the existing owner-state signup lifecycle. Private snapshots/aliases must cascade with account deletion.
- [ ] Add indexes for owner+collection+category+created_at/id and for public entries by collection+created_at/id. Drop obsolete collection-visibility indexes and parent-based write grants. Replace shared RPCs and the bridge helper within this same migration (Task 3); a migration without the Task 3 definitions is not deployable.
- [ ] Cover empty legacy groups, repeated names, reserved-ID collisions, account deletion, and both metadata caps at their boundaries. Keep existing byte/attempt/photo limits unchanged. Run the full backend suite after Task 3; commit the schema and its coupled projection changes together.

## Task 3: public projections, legacy sharing, and media lifecycle

**Files:** Modify the new collection-first migration, `supabase/functions/public-media/lookup.ts`, `supabase/functions/public-media/http.ts` only if needed for error handling, `supabase/functions/media/service.ts` only where the new category lifecycle requires it; update `tests/backend/sharing.test.ts`, `tests/backend/lifecycle.test.ts`, `tests/backend/media-budgets.test.ts`, and the new migration test.

**Interfaces:** Retain `get_shared_collection(p_collection_id uuid, p_page integer default 0)` and `list_public_collections(p_page integer default 0)`. Canonical IDs show a whole collection's public subset; legacy IDs restrict that subset to one category. Keep pages of 24 and the existing page bound 0..20. Both metadata and key lookup consume `resolve_shared_scope`.

- [ ] Add SQL and image-handler tests for a category containing public/private siblings and another category with a public sibling. Assert canonical scope includes both public entries, legacy scope includes only its matching public entry, and requests for private/foreign items fail before any R2 call. Capture expected exact public JSON keys; notes, dates, owner information, descriptions, and R2 keys must be absent.
- [ ] Replace `private.resolve_public_image` with the new predicate, preserving its existing signature and privileges:

```sql
select img.full_key, img.thumb_key
from private.resolve_shared_scope(p_collection_id) scope
join public.items i on i.collection_id = scope.collection_id
  and (scope.category_id is null or i.category_id = scope.category_id)
join public.collections c on c.id = i.collection_id and c.owner_id = i.owner_id
join private.owner_state s on s.owner_id = i.owner_id and s.deleting = false
join public.item_images img on img.item_id = i.id and img.owner_id = i.owner_id
where i.id = p_item_id and i.visibility = 'public'
limit 1;
```

- [ ] Rebuild both public JSON projections using the identical scope/visibility/owner predicate for rows, total, cover, categories, and newest timestamp. A canonical collection with zero public entries returns unavailable and has no catalog card. Legacy aliases with zero matches or a deleted category return unavailable; never resolve them as a whole-collection fallback. Return names for only categories represented by matching public entries. Public collection IDs are canonical; a legacy response supplies its canonical collection ID plus the resolved category scope for display, while image URLs continue using the original requested share ID.
- [ ] Add `public.list_owned_collections(p_search text default '', p_visibility text default null)` returning an owner-only summary (collection columns, itemCount, coverItemId, lastUploadedAt), ordered by newest matching item, falling back to collection.created_at for empty unfiltered collections. Check auth.uid() explicitly, allow only private/public/null filters, bound search length, and restrict execution to authenticated/service roles. This avoids loading every entry just to sort collection cards. The public catalog's sort must never use this owner summary.
- [ ] Add actual revocation and scope regressions around the existing HTTP handler:

```ts
await db.query("update public.items set visibility = 'private' where id = $1", [itemId]);
const readCountBefore = reads.length;
assert.equal((await handler(request(legacyId, itemId))).status, 404);
assert.equal(reads.length, readCountBefore);
assert.equal((await handler(request(canonicalId, itemId))).status, 404);
```

Define handler/request/reads with the existing `createPublicMediaHandler` setup; the identifiers come from the synthetic migrated fixture. Add >24 public/private interleaved items, a newer private-only category, and a private cover photo to catch leaks through pagination/count/order. Verify category deletion makes the legacy URL unavailable while a still-public detached item remains visible through its canonical collection.

- [ ] Preserve public no-store responses, read-rate budgets, safe errors, owner-image isolation, upload validation, and existing owner-lock ordering. Exercise deletion retry when R2 removal fails, category deletion during an in-progress reservation, and account deletion including aliases/snapshots. Verify query failure denies image access rather than retrying with old parent-visibility logic.
- [ ] Run `npx tsx --test tests/backend/*.test.ts` and `deno task --config supabase/functions/media/deno.json check`. Commit Tasks 2 and 3 only when the new schema and public privacy tests pass together.

## Task 4: domain contracts, live repository, and demo behavior

**Files:** Modify `src/domain/models.ts`, `src/domain/validation.ts`, `src/data/repository.ts`, `src/data/demo.ts`, `src/data/useLibrary.ts`, `tests/domain.test.ts`, `tests/hierarchy.test.ts`, `tests/demo.test.ts`, `tests/sharing.test.ts`. Create `src/domain/library.ts` and `tests/library.test.ts` only for shared filtering/sorting helpers used by both tests and production/demo code.

**Interfaces:** Replace CollectionVisibility with ItemVisibility; preserve the photo and account APIs. The revised contracts include:

```ts
type ItemVisibility = 'private' | 'public';
type CategoryDraft = { name: string; collectionId: string; description?: string; acquiredOn?: string | null };
type CollectionDraft = { name: string; description: string; acquiredOn?: string | null };
type ItemDraft = { title: string; notes: string; collectionId: string; categoryId?: string | null; visibility?: ItemVisibility };
type ItemListOptions = { collectionId?: string; categoryId?: string; search: string; page: number; visibility?: ItemVisibility };
type CollectionListOptions = { search?: string; visibility?: ItemVisibility };
type CollectionSummary = Collection & { itemCount: number; coverItemId: string | null; lastUploadedAt: string | null };
type SharedCollectionPage = {
  collection: { id: string; name: string };
  scope: { collectionId: string; categoryId: string | null };
  categories: { id: string; name: string }[];
  items: { id: string; title: string; hasPhoto: boolean; categoryId: string | null; categoryName: string | null }[];
  total: number;
  hasMore: boolean;
};
type PublicCollectionCard = { id: string; name: string; itemCount: number; coverItemId: string | null; isOwner: boolean };
type PublicCollectionPage = { collections: PublicCollectionCard[]; total: number; hasMore: boolean };
// Collection: remove category_id/visibility; acquired_on is string|null.
// Category: add collection_id, description, acquired_on:string|null.
// Item: add category_id:string|null and visibility:ItemVisibility.
// listCollections(options?: CollectionListOptions): Promise<CollectionSummary[]>;
// listCategories(collectionId?: string): Promise<Category[]>;
// listItems(options: ItemListOptions): Promise<ItemPage>;
// createDemoRepository(options?: { empty?: boolean }): CollectionRepository;
```

Use these exact public page types in Task 3's SQL projections and fixtures: no collection/category visibility, no collection-level categoryName, and no descriptions; shared items include their optional category identity/name. Aliased shared pages include resolved scope. Existing photo/upload/delete method signatures stay unchanged.

- [ ] Replace old hierarchy tests with behavior tests against `createDemoRepository({ empty: true })`. This option is an isolated test/demo aid, not an authenticated-account seeding feature. Include:

```ts
const repo = createDemoRepository({ empty: true });
assert.deepEqual(await repo.listCollections(), []);
assert.deepEqual(await repo.listCategories(), []);
const c = await repo.saveCollection({ name: 'Pins', description: '' });
const category = await repo.saveCategory({ name: 'Parks', collectionId: c.id });
const first = await repo.saveItem({ title: 'Gift', notes: '', collectionId: c.id });
const second = await repo.saveItem({ title: 'Park', notes: '', collectionId: c.id, categoryId: category.id, visibility: 'public' });
assert.equal(first.visibility, 'private');
assert.equal(first.category_id, null);
await repo.deleteCategory(category.id);
const page = await repo.listItems({ collectionId: c.id, search: '', page: 0 });
assert.equal(page.items.find(i => i.id === second.id)?.visibility, 'public');
assert.equal(page.items.find(i => i.id === second.id)?.category_id, null);
assert.equal(page.total, 2);
```

- [ ] Add an edit regression proving omitted visibility preserves the current value and an explicit private value revokes it. Add same-name categories in different collections, mismatched category rejection, moves retaining timestamps/photos, stable newest-first sorting, collection acquired-date null/current-day behavior, and detached entries appearing in All. Run `npx tsx --test tests/hierarchy.test.ts tests/domain.test.ts tests/demo.test.ts tests/sharing.test.ts` before implementation and inspect the intended failures.
- [ ] Implement strict visibility/category/date validation. Inserts default private and null category. Updates omit unspecified fields; a collection move includes a valid destination category or null in the same write. Query items directly by `items.visibility`, `items.collection_id`, and `items.category_id`, removing the old collection join as a filter authority. Use `list_owned_collections` for summaries and scope category reads by parent with the new 50-row account cap. Implement repository.deleteCategory through `rpc('delete_category', { p_category_id: id })`. Preserve literal search escaping and bounded pagination.
- [ ] Update the isolated demo to model the same owner/public projections, sort order, optional category, deletion, and quota behavior. Keep sample data only in the default demo instance and its images local; separate demo instances remain isolated. Do not simulate independent privacy solely by filtering the UI.
- [ ] Update useLibrary so collection summaries do not trigger reads of all owner images. Request visible cover images on global All and paginated entry images inside a collection. Retain cancellation/request-generation guards, signed-URL refresh, and deduplication. Visibility is optional rather than defaulting to private; tab scope and visibility filter are separate state.
- [ ] Run targeted tests and `npm run typecheck` after adapting dependent screens in Task 5. Commit this coherent contract/UI transition only after consumers compile; do not silence type errors with broad casts.

## Task 5: mobile owner navigation, entry editor, and public revalidation

**Files:** Modify `src/screens/LibraryScreen.tsx`, `src/screens/Editors.tsx`, `src/screens/PublicCatalog.tsx`, `src/screens/SharedCollectionScreen.tsx`, `src/domain/sharing.ts`, `src/lib/sharing.ts`, and acquired-date field components only for nullable existing dates. Create `src/components/CollectionNavigator.tsx` for the nested picker/sidebar. Update `tests/e2e/app.spec.ts` and `tests/e2e/shared-refresh.spec.ts`.

**Interfaces:** `CollectionNavigator` consumes collection summaries, categories, optional selected IDs, and callbacks `onSelectCollection(id?: string)`, `onSelectCategory(collectionId: string, categoryId?: string)`, `onAddCollection()`, `onAddCategory(collectionId: string)`. CategoryEditor receives its parent collection explicitly. ItemEditor consumes only categories for its selected collection. Rename PublicCatalog.onPrivate to onLibrary; keep canonical owner-management navigation separate from legacy read-only link scope.

- [ ] Update the connected browser fixture to simulate the new row shapes, owner-summary RPC, item visibility filtering, and scoped public RPCs. Remove its automatic starter category. Fixtures must reject a category mismatch instead of masking a broken client write. Seed explicit sample rows only in individual scenarios that need them.
- [ ] Add browser tests for fresh-account collection-first creation, no required category, private default, mixed visibility siblings, owner visibility filter, nested category navigation, category deletion without item loss, cancelling first-item creation, and duplicate collection/category names. Stable accessible names are part of the UI contract: `My collections`, `Public`, `All collections`, `All entries`, `New collection`, `New category`, `Visibility: Private`, `Visibility: Public`.
- [ ] Add the critical empty-account/default sequence:

```ts
await page.getByRole('button', { name: 'My collections', exact: true }).click();
await expect(page.getByText('No collections yet.', { exact: true })).toBeVisible();
await page.getByRole('button', { name: 'New collection', exact: true }).first().click();
await page.getByLabel('Collection name').fill('Bottle Caps');
await page.getByRole('button', { name: 'Create collection', exact: true }).click();
await page.getByRole('button', { name: 'Add item', exact: true }).first().click();
await page.getByLabel('Item name').fill('Blue cap');
await expect(page.getByRole('button', { name: 'Visibility: Private', exact: true }))
  .toHaveAttribute('aria-pressed', 'true');
await page.getByRole('dialog').getByRole('button', { name: 'Add item', exact: true }).click();
await expect(page.getByRole('button', { name: 'Open Blue cap' })).toBeVisible();
```

Use the existing fixture sign-in helper/setup before this sequence. Verify repository state afterward contains a real collection ID, null category, and private visibility; never an All sentinel.

- [ ] Implement the navigator and global collection-card view. Collection/card creation must work with zero categories. Switch category examples to subgroups such as Local breweries. Remove collection privacy controls and move them into ItemEditor/details. Keep simple labels and the existing visual style. Add the owner-only collapsed Details section for migrated category description/acquired date. Preserve unknown dates without replacing them with today merely by opening an editor.
- [ ] Make Share collection copy a filtered public-view link; it never changes any visibility. Disable it when no entry is public, using `Make an entry public to share this collection.` Public cards show public-only counts/covers and offer Manage for owners. A new entry opened from a publicly browsable collection still defaults private.
- [ ] Reuse the existing foreground/refresh revalidation in SharedCollectionScreen; extend it for mixed visibility and legacy scope. On successful revocation, clear stale selected entries/photos and re-fetch public cards. Prevent an older page/image response from restoring revoked UI state. Preserve no-store rendering behavior and fail-closed unknown/unavailable pages.
- [ ] Run mobile scenarios at 320 and 390 px, tablet 768 px, and desktop 1365 px. Include long labels/large text, full navigation at metadata caps, scrollable sheets, keyboard-safe fields, search controls, and no horizontal clipping. Run connected Playwright fixtures and isolated demo scenarios through the exact build modes in `.github/workflows/verify.yml`. Commit when browser checks and typecheck pass.

## Task 6: verification, deployment rehearsal, and next-stage handoff

**Files:** Update `scripts/verify-schema.sql`, `docs/BACKEND.md`, `docs/COLLECTION-SHARING.md`, `docs/DEPLOYMENT-CHECKPOINT.md`, `docs/BETA-LAUNCH.md`, `docs/VERIFICATION.md`. Change `.github/workflows/verify.yml` only if a new command is actually needed; its current platform exports and fixture/demo stages should already cover the redesign.

**Interfaces:** Produce a reproducible verification record and a deployment checkpoint stating exactly which migration and function versions are local versus live. Keep ignored migration reports/backups separate from committed docs. No provider credentials or real entry content in logs.

- [ ] Run the repository's meaningful full checks once after integration:

```text
node scripts/check-secrets.mjs --all
npm run typecheck
npm test
npx expo install --check
deno task --config supabase/functions/media/deno.json check
npx expo export --platform all --clear --max-workers 2
```

- [ ] Reproduce connected Playwright and credential-free demo builds using the environment assignments already in `.github/workflows/verify.yml` (set EXPO_NO_DOTENV=1 so ignored live values cannot enter a fixture build). Then run `npm run test:e2e` against each appropriate export. Do not claim browser fixtures prove live R2 writes, email delivery, or installed native behavior.
- [ ] Rehearse on a local database with synthetic or authorized sanitized legacy data: bridge migration -> updated media lookup -> transactional hierarchy/public-RPC migration -> app. Capture item/image/visibility identity before/after, inspect new-role restrictions, and prove old-link category isolation. Rehearse rollback while no new writes are admitted. Once new-schema writes exist, use a forward repair or a reviewed backup recovery; an automatic rollback must never drop new entries or restore collection-based publishing.
- [ ] Prepare a concrete live runbook: back up metadata; record deployed versions and media-limit switch values; deploy the maintenance-capable media function and set MEDIA_MUTATIONS_ENABLED=false; revoke client metadata mutation grants and drain in-flight writes; apply the bridge; deploy the bridge-aware public-media; verify its old-schema read; apply the hierarchy/projection migration atomically; retain the maintenance grant restrictions after that migration until the compatible app is ready; verify privacy and metadata invariants; restore intended grants/limits/switches. Block old metadata writes using obsolete columns, not a UI-only maintenance banner. Keep public reads disabled during any uncertain cutover, restoring the prior setting only after the new lookup is verified. Never enable public bucket access.
- [ ] Execute live steps only in an implementation/deployment-authorized turn. Verify with a dedicated disposable owner/viewer pair, not by modifying the user's existing test accounts: private image invisible to viewer, explicit publication visible, revocation blocks metadata/photo access, category detach preserves image, old-link scope stays narrow, and configured quotas still reject excess requests. One bounded upload can prove the write path; do not generate a quota-sized batch of R2 images. Use local tests for limit boundaries.
- [ ] Record what was tested, any remaining physical-device checks, and the commit/CI result. Push only the intended reviewed changes under the standing GitHub workflow; attach a PR if one is created. If live deployment has not occurred, mark the checkpoint as pending rather than calling the redesign connected/live.
- [ ] Resume the existing beta checklist only after this redesign is verified: HTTPS hosting/auth email and operational cleanup first, then moderation and signed Android/iOS testing. Obtain missing publisher/domain/build identifiers at that stage; do not request secret keys in chat.

## Completion definition

This planning task is complete when the design and implementation plan are saved and summarized for the user. Implementation remains unstarted until the next instruction. During implementation, each stage is complete only after its relevant tests pass and the checkpoint records its result. The redesign is complete when the acceptance criteria in the spec pass; beta release still requires the separate device, hosting, and operational checks in `docs/BETA-LAUNCH.md`.
