import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollectionRepository, Item, ItemImage, PreparedPhoto } from '../src/domain/models.ts';
import { confirmPhotoUpload, initialItemAcquiredOn, savedItemPlacement } from '../src/domain/itemPhoto.ts';

const item: Item = {
  id: 'item-1', owner_id: 'owner-1', collection_id: 'collection-1', category_id: 'category-1', visibility: 'private',
  title: 'Fixture', notes: '', acquired_on: null, created_at: '2026-10-04T00:00:00.000Z', updated_at: '2026-10-04T00:00:00.000Z',
};
const photo: PreparedPhoto = { uri: 'file:///fixture.jpg', imageBase64: 'full', thumbnailBase64: 'thumb' };

function photoRepository(uploadPhoto: CollectionRepository['uploadPhoto'], readImages: CollectionRepository['readImages']) {
  return { uploadPhoto, readImages };
}

test('a lost upload response is reconciled from the saved image without a duplicate upload', async () => {
  let uploads = 0;
  const result = await confirmPhotoUpload(photoRepository(async () => { uploads += 1; throw new Error('request lost'); }, async (): Promise<ItemImage[]> => [{ itemId: item.id, url: 'full', thumbnailUrl: 'thumb', expiresAt: '2099-01-01T00:00:00.000Z' }]), item.id, photo);
  assert.equal(result, 'already-uploaded');
  assert.equal(uploads, 1);
});

test('an unconfirmed upload remains retryable and does not claim image success', async () => {
  let uploads = 0;
  const repository = photoRepository(async () => { uploads += 1; if (uploads === 1) throw new Error('temporary outage'); }, async () => []);
  await assert.rejects(() => confirmPhotoUpload(repository, item.id, photo), /temporary outage/);
  assert.equal(await confirmPhotoUpload(repository, item.id, photo), 'uploaded');
  assert.equal(uploads, 2);
});

test('metadata placement is canonical after a draft save and cleared dates remain cleared on edit', () => {
  assert.deepEqual(savedItemPlacement(item), { id: item.id, collectionId: 'collection-1', categoryId: 'category-1' });
  assert.equal(initialItemAcquiredOn(item), null);
  assert.match(initialItemAcquiredOn(undefined), /^\d{4}-\d{2}-\d{2}$/);
});
