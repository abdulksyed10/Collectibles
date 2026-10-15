import assert from 'node:assert/strict';
import test from 'node:test';
import { appendPhotoAssets, maxPhotoSelectionMessage, MAX_PHOTO_SELECTION } from '../src/domain/photoSelection.ts';

const asset = (number: number) => ({ uri: `file:///photo-${number}.jpg`, width: 1200, height: 800, type: 'image' as const, mimeType: 'image/jpeg' });

test('photo selection accepts one through ten images and preserves already queued images', () => {
  assert.equal(appendPhotoAssets([], [asset(1)]).length, 1);
  assert.equal(appendPhotoAssets([], Array.from({ length: MAX_PHOTO_SELECTION }, (_, index) => asset(index))).length, MAX_PHOTO_SELECTION);
  assert.deepEqual(appendPhotoAssets([asset(1), asset(2)], [asset(3)]).map(value => value.uri), ['file:///photo-1.jpg', 'file:///photo-2.jpg', 'file:///photo-3.jpg']);
});

test('photo selection rejects the newly chosen group over the ten-image limit without dropping the queue', () => {
  const queued = Array.from({ length: 9 }, (_, index) => asset(index));
  assert.throws(() => appendPhotoAssets(queued, [asset(9), asset(10)]), { message: maxPhotoSelectionMessage });
  assert.equal(queued.length, 9);
});
