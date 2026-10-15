import assert from 'node:assert/strict';
import test from 'node:test';
import { appendUploadJobs, draftForSavedPlacement } from '../src/domain/batchUpload.ts';

const asset = (number: number) => ({ uri: `file:///photo-${number}.jpg`, width: 1200, height: 800, type: 'image' as const, mimeType: 'image/jpeg' });

test('batch jobs retain a unique retry ID for every selected image', () => {
  let sequence = 0;
  const jobs = appendUploadJobs([], [asset(1), asset(2), asset(3)], () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
  assert.equal(jobs.length, 3);
  assert.equal(new Set(jobs.map(job => job.requestId)).size, 3);
  assert.ok(jobs.every(job => job.status === 'queued' && !job.itemId));
});

test('later batch entries reuse the first saved collection and category without recreating them', () => {
  const next = draftForSavedPlacement(
    { title: 'Same title', notes: '', newCollectionName: 'Pins', newCategoryName: 'National parks', visibility: 'public', acquiredOn: '2026-10-14' },
    { id: 'item', collection_id: 'collection', category_id: 'category' },
  );
  assert.deepEqual(next, { title: 'Same title', notes: '', collectionId: 'collection', categoryId: 'category', visibility: 'public', acquiredOn: '2026-10-14' });
});
