import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRepository } from '../src/data/demo';
import { validateCategory } from '../src/domain/validation';

test('category names are required, trimmed and bounded', () => {
  assert.throws(() => validateCategory({ name: '  ' }));
  assert.throws(() => validateCategory({ name: 'x'.repeat(81) }));
  assert.deepEqual(validateCategory({ name: ' Bottle Caps ' }), { name: 'Bottle Caps' });
});

test('custom collectible types contain collections and cannot be deleted while populated', async () => {
  const repo = createDemoRepository();
  const category = await repo.saveCategory({ name: 'Boots' });
  const collection = await repo.saveCollection({ name: 'Vintage', description: '', categoryId: category.id });
  const item = await repo.saveItem({ title: 'Desert boots', notes: '', collectionId: collection.id });
  await repo.uploadPhoto(item.id, { uri: 'file:photo', imageBase64: 'photo', thumbnailBase64: 'thumb' });
  assert.equal((await repo.listItems({ categoryId: category.id, search: '', page: 0 })).items[0].id, item.id);
  await assert.rejects(repo.deleteCategory(category.id), /collection/i);
  await repo.deleteCollection(collection.id);
  await repo.deleteCategory(category.id);
  assert.deepEqual(await repo.readImages([item.id]), []);
  assert.ok(!(await repo.listCategories()).some(c => c.id === category.id));
  assert.ok(!(await createDemoRepository().listCategories()).some(c => c.name === 'Boots'));
});

test('category filtering follows collection moves without changing item or image identity', async () => {
  const repo = createDemoRepository();
  const before = await repo.listItems({ categoryId: 'pins', search: '', page: 0 });
  const sample = before.items.find(i => i.collection_id === 'adventures')!;
  const image = await repo.readImages([sample.id]);
  const moved = await repo.saveCollection({ name: 'Little adventures', description: '', categoryId: 'bottle-caps' }, 'adventures');
  assert.equal(moved.category_id, 'bottle-caps');
  const pins = await repo.listItems({ categoryId: 'pins', search: '', page: 0 });
  const caps = await repo.listItems({ categoryId: 'bottle-caps', collectionId: 'adventures', search: '', page: 0 });
  assert.ok(!pins.items.some(i => i.id === sample.id));
  assert.ok(caps.items.some(i => i.id === sample.id));
  assert.deepEqual(await repo.readImages([sample.id]), image);
  assert.equal((await repo.listItems({ categoryId: 'pins', collectionId: 'adventures', search: '', page: 0 })).total, 0);
  await repo.saveCategory({ name: 'Caps' }, 'bottle-caps');
  assert.equal((await repo.listCategories()).find(c => c.id === 'bottle-caps')?.name, 'Caps');
  await assert.rejects(repo.saveCollection({ name: 'Orphan', description: '', categoryId: 'missing' }));
});

test('demo enforces category quota and deletes all categories on account deletion', async () => {
  const repo = createDemoRepository();
  for (let i = (await repo.listCategories()).length; i < 20; i++) await repo.saveCategory({ name: `Category ${i}` });
  await assert.rejects(repo.saveCategory({ name: 'Too many' }), /20/);
  await repo.deleteAccount();
  assert.deepEqual(await repo.listCategories(), []);
});
