import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRepository } from '../src/data/demo';

test('demo edits, photos and deletion stay isolated to a single preview session', async () => {
  const repo = createDemoRepository();
  const collection = await repo.saveCollection({ name: 'My finds', description: '', categoryId: 'pins' });
  const item = await repo.saveItem({ title: '100% favorite', notes: 'A gift', collectionId: collection.id });
  await repo.uploadPhoto(item.id, { uri: 'file:photo', imageBase64: 'photo', thumbnailBase64: 'thumb' });
  assert.equal((await repo.readImages([item.id]))[0].url, 'data:image/jpeg;base64,photo');
  await repo.saveItem({ title: '100% favorite!', notes: 'Updated', collectionId: collection.id }, item.id);
  assert.equal((await repo.listItems({ search: '%', page: 0 })).items[0].notes, 'Updated');
  assert.equal((await createDemoRepository().listItems({ search: '%', page: 0 })).total, 0);
  await repo.deleteCollection(collection.id);
  assert.equal((await repo.listItems({ search: '%', page: 0 })).total, 0);
  assert.deepEqual(await repo.readImages([item.id]), []);
});

test('demo validates input and paginates collection-scoped results', async () => {
  const repo = createDemoRepository();
  const collection = await repo.saveCollection({ name: 'Pages', description: '', categoryId: 'pins' });
  await assert.rejects(repo.saveItem({ title: ' ', notes: '', collectionId: collection.id }));
  await assert.rejects(repo.saveItem({ title: 'No parent', notes: '', collectionId: 'missing' }));
  for (let i = 0; i < 25; i++) await repo.saveItem({ title: `Item ${i}`, notes: '', collectionId: collection.id });
  const first = await repo.listItems({ collectionId: collection.id, search: '', page: 0 });
  const second = await repo.listItems({ collectionId: collection.id, search: '', page: 1 });
  assert.equal(first.total, 25); assert.equal(first.items.length, 24); assert.equal(first.hasMore, true);
  assert.equal(second.items.length, 1); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.items, ...second.items].map(p => p.id)).size, 25);
  await repo.deleteAccount();
  assert.deepEqual(await repo.listCollections(), []);
  assert.equal((await repo.listItems({ search: '', page: 0 })).total, 0);
});
