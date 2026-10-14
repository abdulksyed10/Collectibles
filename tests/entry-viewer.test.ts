import assert from 'node:assert/strict';
import test from 'node:test';
import { getEntryViewerMediaHeight } from '../src/components/entryViewerLayout.ts';

test('entry viewer keeps media visible without burying its controls below the viewport', () => {
  assert.equal(getEntryViewerMediaHeight(480), 269);
  assert.equal(getEntryViewerMediaHeight(900), 504);
  assert.equal(getEntryViewerMediaHeight(1800), 620);
});
