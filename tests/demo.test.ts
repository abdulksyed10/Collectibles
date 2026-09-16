import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRepository } from '../src/data/demo';

test('demo edits, photos and deletion stay isolated to a single preview session', async () => {
  const repo = createDemoRepository();
  const collection = await repo.saveCollection({ name: 'My finds', description: '' });
  const pin = await repo.savePin({ title: '100% favorite', notes: 'A gift', collectionId: collection.id });
  await repo.uploadPhoto(pin.id, { uri: 'file:photo', imageBase64: 'photo', thumbnailBase64: 'thumb' });
  assert.equal((await repo.readImages([pin.id]))[0].url, 'data:image/jpeg;base64,photo');
  await repo.savePin({ title: '100% favorite!', notes: 'Updated', collectionId: collection.id }, pin.id);
  assert.equal((await repo.listPins({ search: '%', page: 0 })).pins[0].notes, 'Updated');
  assert.equal((await createDemoRepository().listPins({ search: '%', page: 0 })).total, 0);
  await repo.deleteCollection(collection.id);
  assert.equal((await repo.listPins({ search: '%', page: 0 })).total, 0);
  assert.deepEqual(await repo.readImages([pin.id]), []);
});

test('demo validates input and paginates collection-scoped results', async () => {
  const repo = createDemoRepository();
  const collection = await repo.saveCollection({ name: 'Pages', description: '' });
  await assert.rejects(repo.savePin({ title: ' ', notes: '', collectionId: collection.id }));
  await assert.rejects(repo.savePin({ title: 'No parent', notes: '', collectionId: 'missing' }));
  for (let i = 0; i < 25; i++) await repo.savePin({ title: `Pin ${i}`, notes: '', collectionId: collection.id });
  const first = await repo.listPins({ collectionId: collection.id, search: '', page: 0 });
  const second = await repo.listPins({ collectionId: collection.id, search: '', page: 1 });
  assert.equal(first.total, 25); assert.equal(first.pins.length, 24); assert.equal(first.hasMore, true);
  assert.equal(second.pins.length, 1); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.pins, ...second.pins].map(p => p.id)).size, 25);
  await repo.deleteAccount();
  assert.deepEqual(await repo.listCollections(), []);
  assert.equal((await repo.listPins({ search: '', page: 0 })).total, 0);
});
