import assert from 'node:assert/strict';
import test from 'node:test';
import { getEntryNavigation } from '../src/domain/entryNavigation.ts';

test('entry navigation does not wrap and ignores duplicate entry IDs', () => {
  assert.deepEqual(getEntryNavigation(['a', 'b', 'b', 'c'], 'a'), { index: 0, total: 3, previousId: null, nextId: 'b' });
  assert.deepEqual(getEntryNavigation(['a', 'b', 'b', 'c'], 'b'), { index: 1, total: 3, previousId: 'a', nextId: 'c' });
  assert.deepEqual(getEntryNavigation(['a', 'b', 'c'], 'c'), { index: 2, total: 3, previousId: 'b', nextId: null });
});
