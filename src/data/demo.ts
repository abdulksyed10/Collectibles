import type { Category, Collection, CollectionRepository, CollectionSummary, Item, ItemImage, ItemVisibility } from '../domain/models';
import { validateCategory, validateCategorySettings, validateCollection, validateCollectionSettings, validateItem, validateItemSettings } from '../domain/validation';
import { todayLocalDate } from '../domain/dates';
import { validateSharedPage } from '../domain/sharing';

// Original vector illustrations, bundled as data URIs. No remote image requests.
function samplePhoto(index: number) {
  const backgrounds = ['#e8eddf', '#efe0d2', '#dde9ec', '#e7e0ee', '#f2e9cd', '#e0e9dc'];
  const drawings = [
    '<path d="M68 205 146 92 229 205Z" fill="#547d64"/><path d="m146 92-30 44 29-10 31 9Z" fill="#fff7df"/><path d="m113 205 63-89 63 89Z" fill="#85a788"/>',
    '<path d="M102 120 96 82 132 103Q152 95 172 103L207 82 201 125Q224 186 193 208Q151 235 109 206Q77 183 102 120Z" fill="#d19a62"/><path d="m120 149 12 0m41 0 12 0m-40 19 12 0" stroke="#553d2c" stroke-width="7" stroke-linecap="round"/>',
    '<circle cx="151" cy="151" r="68" fill="#698ea2"/><path d="M84 167q33-35 66 0t67 0v15q-34 34-67 0t-66 0Z" fill="#d9f0e7"/><circle cx="173" cy="118" r="20" fill="#f2d481"/>',
    '<rect x="86" y="57" width="130" height="184" rx="12" fill="#f2d481"/><rect x="99" y="80" width="104" height="100" rx="5" fill="#b97984"/><path d="m150 99 13 25 29 4-21 21 5 29-26-14-26 14 5-29-21-21 29-4Z" fill="#fff7df"/><path d="M108 199h87m-87 15h57" stroke="#715b45" stroke-width="5"/>',
    '<path d="m151 69 16 11 20-2 10 17 19 7 2 20 13 15-8 19 3 20-17 11-7 19-20 1-15 14-19-9-20 4-11-17-19-8-1-20-14-15 9-18-4-21 17-10 8-19 20-1Z" fill="#7496a2"/><circle cx="151" cy="146" r="54" fill="#edf1df"/><path d="M106 151q23-24 45 0t45 0m-84 19q20-20 39 0t39 0" fill="none" stroke="#7496a2" stroke-width="8"/>',
    '<circle cx="150" cy="148" r="78" fill="#a9b589" stroke-dasharray="8 4" stroke-width="12"/><circle cx="150" cy="148" r="58" fill="#f8e4b5"/><path d="M151 132q-32-27-40 5-9 36 39 51 50-16 40-51-8-31-39-5Z" fill="#bc735d"/><path d="M151 126q-9-27 16-34" fill="none" stroke="#657b50" stroke-width="8"/>',
  ];
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="${backgrounds[index]}"/><ellipse cx="153" cy="240" rx="58" ry="8" fill="#253c35" opacity=".08"/><g stroke="#b49a63" stroke-width="5" stroke-linejoin="round">${drawings[index]}</g></svg>`)}`;
}

function copyCollection(collection: Collection): Collection { return { ...collection }; }
function copyItem(item: Item): Item { return { ...item }; }

/** A fresh, disposable collection for each demo visit. Never touches disk or APIs. */
export function createDemoRepository(options: { empty?: boolean } = {}): CollectionRepository {
  const owner_id = 'demo';
  const created_at = '2026-01-01T12:00:00.000Z';
  let sequence = 6;
  let collections: Collection[] = options.empty ? [] : [
    { id: 'pins', name: 'Pins', description: 'Pins from trips and gifts.', acquired_on: '2026-01-01' },
    { id: 'cards', name: 'Pokémon cards', description: '', acquired_on: '2026-01-01' },
    { id: 'bottle-caps', name: 'Bottle caps', description: '', acquired_on: '2026-01-01' },
  ].map(collection => ({ ...collection, owner_id, created_at }));
  let categories: Category[] = options.empty ? [] : [
    { id: 'parks', collection_id: 'pins', name: 'National parks', description: '', acquired_on: null },
    { id: 'enamel', collection_id: 'pins', name: 'Enamel pins', description: '', acquired_on: null },
    { id: 'first-editions', collection_id: 'cards', name: 'First editions', description: '', acquired_on: null },
  ].map(category => ({ ...category, owner_id, created_at }));
  const titles = ['Mountain pin', 'Cat pin', 'Wave pin', 'Trading card', 'Lakeside cap', 'Orchard cap'];
  let items: Item[] = options.empty ? [] : titles.map((title, index) => ({
    id: `sample-${index}`,
    owner_id,
    title,
    notes: 'Sample item.',
    collection_id: ['pins', 'pins', 'pins', 'cards', 'bottle-caps', 'bottle-caps'][index]!,
    category_id: ['parks', 'enamel', 'parks', 'first-editions', null, null][index]!,
    visibility: index === 0 || index === 3 ? 'public' : 'private',
    created_at,
    updated_at: created_at,
  }));
  const images = new Map<string, ItemImage>(items.map((item, index) => [item.id, { itemId: item.id, url: samplePhoto(index), thumbnailUrl: samplePhoto(index), expiresAt: '2099-01-01T00:00:00Z' }]));

  function requireItem(id: string) {
    const item = items.find(value => value.id === id);
    if (!item) throw new Error('This item no longer exists.');
    return item;
  }
  function requireCollection(id: string) {
    const collection = collections.find(value => value.id === id);
    if (!collection) throw new Error('Choose a collection first.');
    return collection;
  }
  function requireCategoryForCollection(categoryId: string | null | undefined, collectionId: string) {
    if (!categoryId) return;
    if (!categories.some(value => value.id === categoryId && value.collection_id === collectionId)) throw new Error('Choose a category in this collection.');
  }
  function itemsFor(options: { collectionId?: string; categoryId?: string; visibility?: ItemVisibility; search?: string }) {
    const query = options.search?.trim().toLowerCase() ?? '';
    return items.filter(item =>
      (!options.collectionId || item.collection_id === options.collectionId)
      && (!options.categoryId || item.category_id === options.categoryId)
      && (!options.visibility || item.visibility === options.visibility)
      && (!query || item.title.toLowerCase().includes(query)),
    ).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  }
  function collectionSummaries(options: { search?: string; visibility?: ItemVisibility } = {}): CollectionSummary[] {
    const search = options.search?.trim().toLowerCase() ?? '';
    return collections
      .filter(collection => !search || collection.name.toLowerCase().includes(search))
      .map(collection => {
        const matchingItems = itemsFor({ collectionId: collection.id, visibility: options.visibility });
        const cover = matchingItems.find(item => images.has(item.id));
        return { ...copyCollection(collection), itemCount: matchingItems.length, coverItemId: cover?.id ?? null, lastUploadedAt: matchingItems[0]?.created_at ?? null };
      })
      .filter(collection => !options.visibility || collection.itemCount > 0)
      .sort((a, b) => (b.lastUploadedAt ?? b.created_at).localeCompare(a.lastUploadedAt ?? a.created_at) || b.id.localeCompare(a.id));
  }

  return {
    async listCategories(collectionId) {
      return categories.filter(category => !collectionId || category.collection_id === collectionId).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map(category => ({ ...category }));
    },
    async saveCategory(draft, id) {
      requireCollection(draft.collectionId);
      const value = { ...validateCategory(draft), ...validateCategorySettings(draft) };
      if (id) {
        const existing = categories.find(category => category.id === id);
        if (!existing) throw new Error('This category no longer exists.');
        if (existing.collection_id !== draft.collectionId) throw new Error('A category cannot be moved to another collection.');
        Object.assign(existing, value);
        return { ...existing };
      }
      if (categories.length >= 50) throw new Error('This preview supports up to 50 categories.');
      const category: Category = { id: `demo-${++sequence}`, owner_id, collection_id: draft.collectionId, name: value.name, description: value.description ?? '', acquired_on: value.acquired_on ?? null, created_at: new Date().toISOString() };
      categories = [...categories, category];
      return { ...category };
    },
    async deleteCategory(id) {
      categories = categories.filter(category => category.id !== id);
      items = items.map(item => item.category_id === id ? { ...item, category_id: null } : item);
    },
    async listCollections(options) { return collectionSummaries(options); },
    async saveCollection(draft, id) {
      const value = { ...validateCollection(draft), ...validateCollectionSettings(draft) };
      if (id) {
        const existing = collections.find(collection => collection.id === id);
        if (!existing) throw new Error('This collection no longer exists.');
        Object.assign(existing, value);
        return copyCollection(existing);
      }
      if (collections.length >= 50) throw new Error('This preview supports up to 50 collections.');
      const collection: Collection = { id: `demo-${++sequence}`, owner_id, name: value.name, description: value.description, acquired_on: value.acquired_on === undefined ? todayLocalDate() : value.acquired_on, created_at: new Date().toISOString() };
      collections = [collection, ...collections];
      return copyCollection(collection);
    },
    async listItems({ categoryId, collectionId, search, page, visibility }) {
      const found = itemsFor({ categoryId, collectionId, search, visibility });
      return { items: found.slice(page * 24, (page + 1) * 24).map(copyItem), total: found.length, hasMore: (page + 1) * 24 < found.length };
    },
    async readSharedCollection(id, page) {
      validateSharedPage(page);
      const collection = collections.find(value => value.id === id);
      const found = itemsFor({ collectionId: id, visibility: 'public' });
      if (!collection || !found.length) throw new Error('Collection unavailable.');
      const visibleCategories = categories.filter(category => category.collection_id === id && found.some(item => item.category_id === category.id)).map(category => ({ id: category.id, name: category.name }));
      return {
        collection: { id, name: collection.name },
        scope: { collectionId: id, categoryId: null },
        categories: visibleCategories,
        items: found.slice(page * 24, (page + 1) * 24).map(item => ({
          id: item.id,
          title: item.title,
          hasPhoto: images.has(item.id),
          categoryId: item.category_id,
          categoryName: categories.find(category => category.id === item.category_id)?.name ?? null,
        })),
        total: found.length,
        hasMore: (page + 1) * 24 < found.length,
      };
    },
    async listPublicEntries(page) {
      validateSharedPage(page);
      const found = itemsFor({ visibility: 'public' });
      return {
        entries: found.slice(page * 24, (page + 1) * 24).map(item => ({
          id: item.id,
          title: item.title,
          hasPhoto: images.has(item.id),
          collectionId: item.collection_id,
          collectionName: requireCollection(item.collection_id).name,
        })),
        total: found.length,
        hasMore: (page + 1) * 24 < found.length,
      };
    },
    async listPublicCollections(page) {
      validateSharedPage(page);
      const found = collectionSummaries({ visibility: 'public' });
      return {
        collections: found.slice(page * 24, (page + 1) * 24).map(collection => ({ id: collection.id, name: collection.name, itemCount: collection.itemCount, coverItemId: collection.coverItemId, isOwner: true })),
        total: found.length,
        hasMore: (page + 1) * 24 < found.length,
      };
    },
    async saveItem(draft, id) {
      requireCollection(draft.collectionId);
      requireCategoryForCollection(draft.categoryId, draft.collectionId);
      const value = { ...validateItem(draft), ...validateItemSettings(draft), collection_id: draft.collectionId, updated_at: new Date().toISOString() };
      if (id) {
        const existing = requireItem(id);
        Object.assign(existing, value);
        return copyItem(existing);
      }
      if (items.length >= 500) throw new Error('This preview supports up to 500 items.');
      const item: Item = { id: `demo-${++sequence}`, owner_id, title: value.title, notes: value.notes, collection_id: value.collection_id, category_id: value.category_id ?? null, visibility: value.visibility ?? 'private', created_at: value.updated_at, updated_at: value.updated_at };
      items = [item, ...items];
      return copyItem(item);
    },
    async readImages(ids) { return ids.flatMap(id => { const image = images.get(id); return image ? [{ ...image }] : []; }); },
    async uploadPhoto(itemId, photo) {
      requireItem(itemId);
      images.set(itemId, { itemId, url: `data:image/jpeg;base64,${photo.imageBase64}`, thumbnailUrl: `data:image/jpeg;base64,${photo.thumbnailBase64}`, expiresAt: '2099-01-01T00:00:00Z' });
    },
    async deleteItem(id) { items = items.filter(item => item.id !== id); images.delete(id); },
    async deleteCollection(id) {
      items.filter(item => item.collection_id === id).forEach(item => images.delete(item.id));
      items = items.filter(item => item.collection_id !== id);
      categories = categories.filter(category => category.collection_id !== id);
      collections = collections.filter(collection => collection.id !== id);
    },
    async deleteAccount() { categories = []; collections = []; items = []; images.clear(); },
  };
}
