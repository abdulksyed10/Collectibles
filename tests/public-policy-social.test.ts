import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/screens/PublicInfoScreen.tsx', 'utf8');

test('public policy explains social sharing and keeps reports signed-in only', () => {
  assert.match(page, /Friends-only entries are visible only to mutual followers/i);
  assert.match(page, /Usernames, follow relationships, and like counts are visible with shared entries/i);
  assert.match(page, /Only signed-in members can report shared content/i);
  assert.doesNotMatch(page, /Visitors and signed-in users can report/i);
});
