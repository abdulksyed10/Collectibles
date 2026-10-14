import assert from 'node:assert/strict';
import test from 'node:test';
import { formatEntryPostDate, getOwnedEntryPostDate } from '../src/domain/postDates.ts';

test('legacy acquired dates remain calendar dates while new post dates use their timestamp', () => {
  assert.equal(formatEntryPostDate({ kind: 'acquired', value: '2024-02-29' }, 'en-US'), 'Acquired February 29, 2024');
  assert.equal(formatEntryPostDate({ kind: 'posted', value: '2026-10-14T19:30:00.000Z' }, 'en-US'), 'Posted October 14, 2026');
});

test('owned date precedence does not invent a post date for an entry without a photo', () => {
  const base = { id: 'item', owner_id: 'owner', collection_id: 'collection', category_id: null, visibility: 'private' as const, title: 'Entry', notes: '', acquired_on: '2026-10-10', created_at: '2026-10-01T12:00:00.000Z', updated_at: '2026-10-01T12:00:00.000Z' };
  assert.deepEqual(getOwnedEntryPostDate({ ...base, legacy_post_date: '2020-01-02', posted_at: '2026-10-14T19:30:00.000Z' }), { kind: 'acquired', value: '2020-01-02' });
  assert.deepEqual(getOwnedEntryPostDate({ ...base, legacy_post_date: null, posted_at: '2026-10-14T19:30:00.000Z' }), { kind: 'posted', value: '2026-10-14T19:30:00.000Z' });
  assert.deepEqual(getOwnedEntryPostDate({ ...base, legacy_post_date: null, posted_at: null }), { kind: 'added', value: '2026-10-01T12:00:00.000Z' });
});
