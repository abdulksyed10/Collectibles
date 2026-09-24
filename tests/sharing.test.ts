import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRepository } from '../src/data/demo';
import { buildShareUrl, sharedIdFromUrl } from '../src/domain/sharing';

test('share links contain only the collection identity', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const url = buildShareUrl('https://collectibles.example/path?token=secret#session', id);
  assert.equal(url, `https://collectibles.example/path?collection=${id}`);
  assert.equal(sharedIdFromUrl(url), id);
});

test('public collection views contain only public items and public catalog counts them', async () => {
  const repo = createDemoRepository({ empty: true });
  const pins = await repo.saveCollection({ name: 'Pins', description: '' });
  const parks = await repo.saveCategory({ name: 'Parks', collectionId: pins.id });
  const publicItem = await repo.saveItem({ title: 'Park pin', notes: 'private note', collectionId: pins.id, categoryId: parks.id, visibility: 'public' });
  await repo.saveItem({ title: 'Gift pin', notes: 'private note', collectionId: pins.id, categoryId: parks.id, visibility: 'private' });
  const catalog = await repo.listPublicCollections(0);
  assert.deepEqual(catalog.collections, [{ id: pins.id, name: 'Pins', itemCount: 1, coverItemId: null, isOwner: true }]);
  const shared = await repo.readSharedCollection(pins.id, 0);
  assert.deepEqual(shared.items, [{ id: publicItem.id, title: 'Park pin', hasPhoto: false, categoryId: parks.id, categoryName: 'Parks' }]);
  await repo.saveItem({ title: 'Park pin', notes: '', collectionId: pins.id, visibility: 'private' }, publicItem.id);
  await assert.rejects(repo.readSharedCollection(pins.id, 0), /unavailable/i);
});

test('explore entries expose public entry cards without notes or categories', async () => {
  const repo = createDemoRepository({ empty: true });
  const pins = await repo.saveCollection({ name: 'Pins', description: '' });
  const parks = await repo.saveCategory({ name: 'Parks', collectionId: pins.id });
  const publicItem = await repo.saveItem({ title: 'Park pin', notes: 'private note', collectionId: pins.id, categoryId: parks.id, visibility: 'public' });
  await repo.saveItem({ title: 'Gift pin', notes: 'private note', collectionId: pins.id, categoryId: parks.id, visibility: 'private' });
  assert.deepEqual((await repo.listPublicEntries(0)).entries, [{
    id: publicItem.id,
    title: 'Park pin',
    hasPhoto: false,
    collectionId: pins.id,
    collectionName: 'Pins',
  }]);
});
