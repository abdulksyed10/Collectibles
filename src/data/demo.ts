import type { Category, Collection, CollectionRepository, Item, ItemImage } from '../domain/models';
import { validateCategory, validateCollection, validateCollectionSettings, validateItem } from '../domain/validation';
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

/** A fresh, disposable collection for each demo visit. Never touches disk or APIs. */
export function createDemoRepository(): CollectionRepository {
  const owner_id = 'demo';
  const created_at = '2026-01-01T12:00:00.000Z';
  let sequence = 6;
  let categories: Category[] = [
    { id: 'pins', name: 'Pins' },
    { id: 'cards', name: 'Pokémon Cards' },
    { id: 'bottle-caps', name: 'Bottle Caps' },
  ].map(c => ({ ...c, owner_id, created_at }));
  let collections: Collection[] = [
    { id: 'adventures', category_id: 'pins', name: 'Travel pins', description: 'Pins from national parks and trips.' },
    { id: 'favorites', category_id: 'pins', name: 'Enamel pins', description: '' },
    { id: 'cards-first', category_id: 'cards', name: 'First editions', description: '' },
    { id: 'caps-travel', category_id: 'bottle-caps', name: 'Bottle caps', description: '' },
  ].map(c => ({ ...c, owner_id, created_at, visibility: 'private', acquired_on: '2026-01-01' }));
  const titles = ['Mountain pin', 'Cat pin', 'Wave pin', 'Trading card', 'Lakeside cap', 'Orchard cap'];
  let items: Item[] = titles.map((title, i) => ({ id: `sample-${i}`, owner_id, title, notes: 'Sample item.', collection_id: ['adventures', 'favorites', 'adventures', 'cards-first', 'caps-travel', 'caps-travel'][i]!, created_at, updated_at: created_at }));
  const images = new Map<string, ItemImage>(items.map((item, i) => [item.id, { itemId: item.id, url: samplePhoto(i), thumbnailUrl: samplePhoto(i), expiresAt: '2099-01-01T00:00:00Z' }]));
  function requireItem(id: string) { const item = items.find(p => p.id === id); if (!item) throw new Error('This item no longer exists.'); return item; }
  return {
    async listCategories() { return categories.map(c => ({ ...c })); },
    async saveCategory(draft, id) {
      const value = validateCategory(draft);
      if (id) { const existing = categories.find(c => c.id === id); if (!existing) throw new Error('This category no longer exists.'); Object.assign(existing, value); return { ...existing }; }
      if (categories.length >= 20) throw new Error('This preview supports up to 20 categories.');
      const category = { ...value, id: `demo-${++sequence}`, owner_id, created_at: new Date().toISOString() };
      categories = [...categories, category]; return { ...category };
    },
    async deleteCategory(id) {
      if (collections.some(c => c.category_id === id)) throw new Error('Move or delete this category’s collections first.');
      categories = categories.filter(c => c.id !== id);
    },
    async listCollections() { return collections.map(c => ({ ...c })); },
    async saveCollection(draft, id) {
      if (!categories.some(c => c.id === draft.categoryId)) throw new Error('Choose a category first.');
      const value = { ...validateCollection(draft), ...validateCollectionSettings(draft), category_id: draft.categoryId };
      if (id) { const existing = collections.find(c => c.id === id); if (!existing) throw new Error('This collection no longer exists.'); Object.assign(existing, value); return { ...existing }; }
      if (collections.length >= 50) throw new Error('This preview supports up to 50 collections.');
      const collection: Collection = { visibility: 'private', acquired_on: todayLocalDate(), ...value, id: `demo-${++sequence}`, owner_id, created_at: new Date().toISOString() };
      collections = [collection, ...collections]; return { ...collection };
    },
    async listItems({ categoryId, collectionId, search, page, visibility }) {
      const allowedCollections = new Set(collections.filter(c => (!categoryId || c.category_id === categoryId) && (!visibility || c.visibility === visibility)).map(c => c.id));
      const found = items.filter(p => allowedCollections.has(p.collection_id) && (!collectionId || p.collection_id === collectionId) && p.title.toLowerCase().includes(search.trim().toLowerCase()));
      return { items: found.slice(page * 24, (page + 1) * 24).map(p => ({ ...p })), total: found.length, hasMore: (page + 1) * 24 < found.length };
    },
    async readSharedCollection(id, page) {
      validateSharedPage(page);
      const collection = collections.find(c => c.id === id && c.visibility === 'public');
      if (!collection) throw new Error('Collection unavailable.');
      const found = items.filter(item => item.collection_id === id);
      return {
        collection: { id, name: collection.name, description: collection.description, categoryName: categories.find(c => c.id === collection.category_id)?.name ?? '' },
        items: found.slice(page * 24, (page + 1) * 24).map(item => ({ id: item.id, title: item.title, hasPhoto: images.has(item.id) })),
        total: found.length, hasMore: (page + 1) * 24 < found.length,
      };
    },
    async saveItem(draft, id) {
      const value = { ...validateItem(draft), collection_id: draft.collectionId, updated_at: new Date().toISOString() };
      if (!collections.some(c => c.id === draft.collectionId)) throw new Error('Choose a collection first.');
      if (id) { const existing = requireItem(id); Object.assign(existing, value); return { ...existing }; }
      if (items.length >= 500) throw new Error('This preview supports up to 500 items.');
      const item = { ...value, id: `demo-${++sequence}`, owner_id, created_at: value.updated_at };
      items = [item, ...items]; return { ...item };
    },
    async readImages(ids) { return ids.flatMap(id => { const image = images.get(id); return image ? [{ ...image }] : []; }); },
    async uploadPhoto(itemId, photo) {
      requireItem(itemId);
      images.set(itemId, { itemId, url: `data:image/jpeg;base64,${photo.imageBase64}`, thumbnailUrl: `data:image/jpeg;base64,${photo.thumbnailBase64}`, expiresAt: '2099-01-01T00:00:00Z' });
    },
    async deleteItem(id) { items = items.filter(p => p.id !== id); images.delete(id); },
    async deleteCollection(id) { items.filter(p => p.collection_id === id).forEach(p => images.delete(p.id)); items = items.filter(p => p.collection_id !== id); collections = collections.filter(c => c.id !== id); },
    async deleteAccount() { categories = []; collections = []; items = []; images.clear(); },
  };
}
