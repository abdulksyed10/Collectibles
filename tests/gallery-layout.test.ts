import assert from 'node:assert/strict';
import test from 'node:test';
import { getGalleryLayout, getGalleryPaneWidth } from '../src/components/galleryLayout.ts';

test('gallery layout fills the measured pane without a four-column cap', () => {
  assert.deepEqual(getGalleryLayout(320), { columns: 1, cardWidth: 288, gap: 14, padding: 16 });
  assert.deepEqual(getGalleryLayout(390), { columns: 2, cardWidth: 172, gap: 14, padding: 16 });
  assert.deepEqual(getGalleryLayout(535), { columns: 3, cardWidth: 158.33, gap: 14, padding: 16 });
  assert.deepEqual(getGalleryLayout(900), { columns: 3, cardWidth: 269.33, gap: 14, padding: 32 });
  assert.equal(getGalleryLayout(1440).columns, 5);
  assert.equal(getGalleryLayout(1920).columns, 7);
  assert.equal(getGalleryLayout(2560).columns, 10);
});

test('a desktop collection sidebar reduces only its own main gallery pane', () => {
  assert.equal(getGalleryPaneWidth(1440, true), 1180);
  assert.equal(getGalleryPaneWidth(1440, false), 1440);
  assert.equal(getGalleryLayout(getGalleryPaneWidth(1440, true)).columns, 4);
  assert.equal(getGalleryLayout(getGalleryPaneWidth(1920, true)).columns, 6);
});

test('gallery layout treats a zero or negative initial measurement as one safe column', () => {
  assert.deepEqual(getGalleryLayout(0), { columns: 1, cardWidth: 0, gap: 14, padding: 16 });
  assert.deepEqual(getGalleryLayout(-1), { columns: 1, cardWidth: 0, gap: 14, padding: 16 });
});
