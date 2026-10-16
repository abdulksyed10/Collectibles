import assert from 'node:assert/strict';
import test from 'node:test';
import { appendUploadJobs, runUploadBatch } from '../src/domain/batchUpload.ts';
import type { CollectionRepository, Item, ItemDraft } from '../src/domain/models.ts';

const draft: ItemDraft = { title: 'Pins', notes: '', newCollectionName: 'Trips', visibility: 'public', acquiredOn: null };
function fixture(count = 2) {
  let sequence = 0;
  const jobs = appendUploadJobs([], Array.from({ length: count }, () => ({ uri: 'photo.jpg', width: 100, height: 100 })), () => String(++sequence));
  const records = new Map<string, { draft: ItemDraft; item: Item }>();
  const images = new Set<string>();
  let uploads = 0;
  const repository = {
    async createUploadDraft(value: ItemDraft, id: string) {
      const existing = records.get(id);
      if (existing) { assert.deepEqual(value, existing.draft); return existing.item; }
      const item = { id, collection_id: value.collectionId ?? `collection-${id}`, category_id: null, visibility: 'private' } as Item;
      records.set(id, { draft: { ...value }, item });
      return item;
    },
    async readOwnedItem(id: string) { return records.get(id)?.item ?? null; },
    async readImages(ids: string[]) { return ids.filter(id => images.has(id)).map(itemId => ({ itemId })); },
    async uploadPhoto(id: string) { uploads++; images.add(id); },
    async saveItem(value: ItemDraft, id: string) { const item = records.get(id)!.item; item.visibility = value.visibility!; return item; },
  } as Pick<CollectionRepository, 'createUploadDraft' | 'readOwnedItem' | 'readImages' | 'uploadPhoto' | 'saveItem'>;
  const options = { repository, prepare: async () => ({ uri: 'prepared', imageBase64: 'a', thumbnailBase64: 'b' }), shouldStop: () => false, isActive: () => true, onChange: () => {} };
  return { jobs, records, images, repository, options, uploads: () => uploads };
}

test('lost draft response pauses the batch and retries the exact payload before creating siblings', async () => {
  const f = fixture(); const create = f.repository.createUploadDraft;
  let loseResponse = true;
  f.repository.createUploadDraft = async (value, id) => {
    const result = await create(value, id);
    if (loseResponse) { loseResponse = false; throw new Error('Network interrupted'); }
    return result;
  };
  const first = await runUploadBatch(f.jobs, draft, f.options);
  assert.deepEqual(first.map(j => j.status), ['failed', 'paused']);
  assert.equal(f.records.size, 1);
  const second = await runUploadBatch(first, draft, f.options);
  assert.ok(second.every(j => j.status === 'saved'));
  assert.equal(f.records.size, 2);
  assert.equal(new Set([...f.records.values()].map(r => r.item.collection_id)).size, 1);
});

test('retry after lost publish response reuses committed photo without uploading again', async () => {
  const f = fixture(1); const save = f.repository.saveItem;
  let loseResponse = true;
  f.repository.saveItem = async (value, id) => {
    const result = await save(value, id);
    if (loseResponse) { loseResponse = false; throw new Error('Network interrupted'); }
    return result;
  };
  const first = await runUploadBatch(f.jobs, draft, f.options);
  const second = await runUploadBatch(first, draft, f.options);
  assert.equal(second[0].status, 'saved');
  assert.equal(f.uploads(), 1);
});

test('an unreadable retry still resolves the lost draft before creating sibling collections', async () => {
  const f = fixture(); const create = f.repository.createUploadDraft;
  let loseResponse = true;
  f.repository.createUploadDraft = async (value, id) => {
    const result = await create(value, id);
    if (loseResponse) { loseResponse = false; throw new Error('Network interrupted'); }
    return result;
  };
  const first = await runUploadBatch(f.jobs, draft, f.options);
  let preparation = 0;
  const second = await runUploadBatch(first, draft, { ...f.options, prepare: async asset => {
    if (++preparation === 1) throw new Error('File unavailable');
    return f.options.prepare(asset);
  } });
  assert.deepEqual(second.map(j => j.status), ['failed', 'saved']);
  assert.equal(new Set([...f.records.values()].map(r => r.item.collection_id)).size, 1);
});

test('local image errors continue, but a service error pauses remaining photos', async () => {
  const f = fixture(3); let preparations = 0;
  f.options.prepare = async () => { if (++preparations === 1) throw new Error('Invalid image'); return { uri: '', imageBase64: 'a', thumbnailBase64: 'b' }; };
  f.repository.uploadPhoto = async () => { throw new Error('Rate limit reached'); };
  const result = await runUploadBatch(f.jobs, draft, f.options);
  assert.deepEqual(result.map(j => j.status), ['failed', 'failed', 'paused']);
  assert.equal(f.records.size, 1);
});

test('stopping between photos retains saved jobs and resumes without duplicating them', async () => {
  const f = fixture(10);
  const first = await runUploadBatch(f.jobs, draft, { ...f.options, shouldStop: () => f.uploads() === 1 });
  assert.equal(first.filter(j => j.status === 'saved').length, 1);
  const second = await runUploadBatch(first, draft, f.options);
  assert.equal(second.filter(j => j.status === 'saved').length, 10);
  assert.equal(f.records.size, 10);
  assert.equal(f.uploads(), 10);
});
