import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRepository } from '../src/data/demo';
import { todayLocalDate } from '../src/domain/dates';

test('empty library creates collections before optional categories and private entries', async () => {
  const repo = createDemoRepository({ empty: true });
  assert.deepEqual(await repo.listCollections(), []);
  assert.deepEqual(await repo.listCategories(), []);
  const collection = await repo.saveCollection({ name: 'Pins', description: '' });
  assert.equal(collection.acquired_on, todayLocalDate());
  const unknownDate = await repo.saveCollection({ name: 'Undated', description: '', acquiredOn: null });
  assert.equal(unknownDate.acquired_on, null);
  assert.equal((await repo.saveCollection({ name: 'Still undated', description: '', }, unknownDate.id)).acquired_on, null);
  const category = await repo.saveCategory({ name: 'Parks', collectionId: collection.id });
  const privateItem = await repo.saveItem({ title: 'Gift pin', notes: '', collectionId: collection.id });
  const publicItem = await repo.saveItem({ title: 'Park pin', notes: '', collectionId: collection.id, categoryId: category.id, visibility: 'public' });
  assert.equal(privateItem.visibility, 'private');
  assert.equal(privateItem.category_id, null);
  assert.equal(publicItem.visibility, 'public');
  assert.equal(publicItem.category_id, category.id);
  assert.equal((await repo.listItems({ collectionId: collection.id, search: '', page: 0 })).total, 2);
});

test('categories stay inside their collection and deletion detaches entries without changing visibility', async () => {
  const repo = createDemoRepository({ empty: true });
  const pins = await repo.saveCollection({ name: 'Pins', description: '' });
  const cards = await repo.saveCollection({ name: 'Cards', description: '' });
  const parks = await repo.saveCategory({ name: 'Parks', collectionId: pins.id });
  const rare = await repo.saveCategory({ name: 'Rare', collectionId: cards.id });
  await assert.rejects(repo.saveItem({ title: 'Wrong parent', notes: '', collectionId: pins.id, categoryId: rare.id }), /category/i);
  const item = await repo.saveItem({ title: 'Park pin', notes: '', collectionId: pins.id, categoryId: parks.id, visibility: 'public' });
  await repo.deleteCategory(parks.id);
  const after = (await repo.listItems({ collectionId: pins.id, search: '', page: 0 })).items.find(value => value.id === item.id)!;
  assert.equal(after.category_id, null);
  assert.equal(after.visibility, 'public');
  assert.deepEqual(await repo.listCategories(pins.id), []);
});

test('collection summaries use the newest matching entry while items retain their visibility after edits', async () => {
  const repo = createDemoRepository({ empty: true });
  const pins = await repo.saveCollection({ name: 'Pins', description: '' });
  const cards = await repo.saveCollection({ name: 'Cards', description: '' });
  const first = await repo.saveItem({ title: 'First', notes: '', collectionId: pins.id, visibility: 'public' });
  await repo.saveItem({ title: 'Second', notes: '', collectionId: cards.id, visibility: 'private' });
  const edited = await repo.saveItem({ title: 'First renamed', notes: '', collectionId: pins.id }, first.id);
  assert.equal(edited.visibility, 'public');
  const publicCollections = await repo.listCollections({ visibility: 'public' });
  assert.deepEqual(publicCollections.map(collection => collection.id), [pins.id]);
});
