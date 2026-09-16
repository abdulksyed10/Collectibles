import type { Collection, CollectionRepository, Pin, PinImage } from '../domain/models';
import { validateCollection, validatePin } from '../domain/validation';

// Original vector illustrations, bundled as data URIs. No remote image requests.
function samplePhoto(index: number) {
  const backgrounds = ['#e8eddf', '#efe0d2', '#dde9ec', '#e7e0ee', '#f2e9cd', '#e0e9dc'];
  const drawings = [
    '<path d="M68 205 146 92 229 205Z" fill="#547d64"/><path d="m146 92-30 44 29-10 31 9Z" fill="#fff7df"/><path d="m113 205 63-89 63 89Z" fill="#85a788"/>',
    '<path d="M102 120 96 82 132 103Q152 95 172 103L207 82 201 125Q224 186 193 208Q151 235 109 206Q77 183 102 120Z" fill="#d19a62"/><path d="m120 149 12 0m41 0 12 0m-40 19 12 0" stroke="#553d2c" stroke-width="7" stroke-linecap="round"/>',
    '<circle cx="151" cy="151" r="68" fill="#698ea2"/><path d="M84 167q33-35 66 0t67 0v15q-34 34-67 0t-66 0Z" fill="#d9f0e7"/><circle cx="173" cy="118" r="20" fill="#f2d481"/>',
    '<path d="M154 213Q62 164 94 117Q120 89 154 126Q187 88 215 117Q245 163 154 213Z" fill="#b97984"/>',
    '<path d="m151 79 24 46 51 7-37 38 9 52-47-24-47 24 9-52-37-38 51-7Z" fill="#d6b65b"/>',
    '<path d="M108 83h86v133l-43-23-43 23Z" fill="#91a476"/><path d="M128 111h46m-46 23h46m-46 23h28" stroke="#fff7df" stroke-width="7" stroke-linecap="round"/>',
  ];
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="${backgrounds[index]}"/><ellipse cx="153" cy="240" rx="58" ry="8" fill="#253c35" opacity=".08"/><g stroke="#b49a63" stroke-width="5" stroke-linejoin="round">${drawings[index]}</g></svg>`)}`;
}

/** A fresh, disposable collection for each demo visit. Never touches disk or APIs. */
export function createDemoRepository(): CollectionRepository {
  const owner_id = 'demo';
  const created_at = '2026-01-01T12:00:00.000Z';
  let sequence = 6;
  let collections: Collection[] = [
    { id: 'adventures', name: 'Little adventures', description: 'Souvenirs from places that stayed with me.' },
    { id: 'favorites', name: 'Everyday favorites', description: 'The little things that make me smile.' },
    { id: 'gifts', name: 'Thoughtful gifts', description: 'A collection of good memories and kind people.' },
  ].map(c => ({ ...c, owner_id, created_at }));
  const titles = ['Mountain memories', 'Lucky little cat', 'Ocean daydream', 'A little love', 'Golden hour', 'One more chapter'];
  let pins: Pin[] = titles.map((title, i) => ({ id: `sample-${i}`, owner_id, title, notes: 'A sample pin to explore. Add your own photo and story in this demo.', collection_id: ['adventures', 'favorites', 'adventures', 'gifts', 'gifts', 'favorites'][i]!, created_at, updated_at: created_at }));
  const images = new Map<string, PinImage>(pins.map((pin, i) => [pin.id, { pinId: pin.id, url: samplePhoto(i), thumbnailUrl: samplePhoto(i), expiresAt: '2099-01-01T00:00:00Z' }]));
  function requirePin(id: string) { const pin = pins.find(p => p.id === id); if (!pin) throw new Error('This pin no longer exists.'); return pin; }
  return {
    async listCollections() { return collections.map(c => ({ ...c })); },
    async saveCollection(draft, id) {
      const value = validateCollection(draft);
      if (id) { const existing = collections.find(c => c.id === id); if (!existing) throw new Error('This collection no longer exists.'); Object.assign(existing, value); return { ...existing }; }
      if (collections.length >= 50) throw new Error('This preview supports up to 50 collections.');
      const collection = { ...value, id: `demo-${++sequence}`, owner_id, created_at: new Date().toISOString() };
      collections = [collection, ...collections]; return { ...collection };
    },
    async listPins({ collectionId, search, page }) {
      const found = pins.filter(p => (!collectionId || p.collection_id === collectionId) && p.title.toLowerCase().includes(search.trim().toLowerCase()));
      return { pins: found.slice(page * 24, (page + 1) * 24).map(p => ({ ...p })), total: found.length, hasMore: (page + 1) * 24 < found.length };
    },
    async savePin(draft, id) {
      const value = { ...validatePin(draft), collection_id: draft.collectionId, updated_at: new Date().toISOString() };
      if (!collections.some(c => c.id === draft.collectionId)) throw new Error('Choose a collection first.');
      if (id) { const existing = requirePin(id); Object.assign(existing, value); return { ...existing }; }
      if (pins.length >= 500) throw new Error('This preview supports up to 500 pins.');
      const pin = { ...value, id: `demo-${++sequence}`, owner_id, created_at: value.updated_at };
      pins = [pin, ...pins]; return { ...pin };
    },
    async readImages(ids) { return ids.flatMap(id => { const image = images.get(id); return image ? [{ ...image }] : []; }); },
    async uploadPhoto(pinId, photo) {
      requirePin(pinId);
      images.set(pinId, { pinId, url: `data:image/jpeg;base64,${photo.imageBase64}`, thumbnailUrl: `data:image/jpeg;base64,${photo.thumbnailBase64}`, expiresAt: '2099-01-01T00:00:00Z' });
    },
    async deletePin(id) { pins = pins.filter(p => p.id !== id); images.delete(id); },
    async deleteCollection(id) { pins.filter(p => p.collection_id === id).forEach(p => images.delete(p.id)); pins = pins.filter(p => p.collection_id !== id); collections = collections.filter(c => c.id !== id); },
    async deleteAccount() { collections = []; pins = []; images.clear(); },
  };
}
