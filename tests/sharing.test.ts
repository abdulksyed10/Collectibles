import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRepository } from '../src/data/demo';
import { todayLocalDate, validateAcquiredDate } from '../src/domain/dates';
import { buildShareUrl, sharedIdFromUrl } from '../src/domain/sharing';

test('acquired date uses local calendar fields and rejects impossible dates', () => {
  assert.equal(todayLocalDate(new Date(2026, 0, 2, 0, 15)), '2026-01-02');
  assert.equal(validateAcquiredDate('2024-02-29'), '2024-02-29');
  for (const value of ['', '2025-02-29', '2026-04-31', '0000-01-01', '2026-1-02', '2026-13-01', '2026-01-01T00:00:00Z']) assert.throws(() => validateAcquiredDate(value));
});

test('share links cannot leak existing URL parameters or auth fragments', () => {
  const id = '00000000-0000-4000-8000-000000000123';
  const url = buildShareUrl('https://collections.example/app?email=private#access_token=secret', id);
  assert.equal(url, `https://collections.example/app?collection=${id}`);
  assert.equal(sharedIdFromUrl(url), id);
  assert.equal(sharedIdFromUrl(`collectibles:///?collection=${id}`), id);
  assert.equal(sharedIdFromUrl('https://collections.example/?collection=not-an-id'), null);
  assert.throws(() => buildShareUrl('https://user:password@collections.example/', id));
  assert.throws(() => buildShareUrl('javascript:alert(1)', id));
  assert.throws(() => buildShareUrl('https://collections.example/', 'invalid'));
});

test('new collections default private and today; omitted edits preserve sharing/date', async () => {
  const repo = createDemoRepository();
  const draft = { name: 'Travel', description: '', categoryId: 'pins' };
  const collection = await repo.saveCollection(draft);
  assert.equal(collection.visibility, 'private');
  assert.equal(collection.acquired_on, todayLocalDate());
  await repo.saveCollection({ ...draft, visibility: 'public', acquiredOn: '2020-05-01' }, collection.id);
  const renamed = await repo.saveCollection({ ...draft, name: 'Travel pins' }, collection.id);
  assert.equal(renamed.visibility, 'public');
  assert.equal(renamed.acquired_on, '2020-05-01');
  await assert.rejects(repo.saveCollection({ ...draft, acquiredOn: '2026-02-30' }));
});

test('public projection omits private fields, scopes pagination, and is revoked on privacy change', async () => {
  const repo = createDemoRepository();
  await assert.rejects(repo.readSharedCollection('adventures', 0), /unavailable/i);
  await repo.saveCollection({ name: 'Travel', description: 'Trips', categoryId: 'pins', visibility: 'public', acquiredOn: '2020-01-01' }, 'adventures');
  const shared = await repo.readSharedCollection('adventures', 0);
  assert.deepEqual(Object.keys(shared.collection).sort(), ['categoryName', 'description', 'id', 'name']);
  assert.equal(shared.total, 2);
  assert.deepEqual(Object.keys(shared.items[0]).sort(), ['hasPhoto', 'id', 'title']);
  assert.equal((await repo.listItems({ search: '', page: 0, visibility: 'public' })).total, 2);
  assert.equal((await repo.listItems({ search: '', page: 0, visibility: 'private' })).total, 4);
  for (let i = 0; i < 24; i++) await repo.saveItem({ title: `Photo ${i}`, notes: 'Private', collectionId: 'adventures' });
  const next = await repo.readSharedCollection('adventures', 1);
  assert.equal(next.items.length, 2); assert.equal(next.hasMore, false);
  await assert.rejects(repo.readSharedCollection('adventures', -1));
  await repo.saveCollection({ name: 'Travel', description: '', categoryId: 'pins', visibility: 'private' }, 'adventures');
  await assert.rejects(repo.readSharedCollection('adventures', 0), /unavailable/i);
});
