import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestedUsername, validateUsername } from '../src/social/usernames.ts';

test('suggestedUsername derives a safe public handle from an email local part', () => {
  assert.equal(suggestedUsername('Alex.Smith+Pins@example.test'), 'alex_smith_pins');
  assert.equal(suggestedUsername('7seas@example.test'), 'u_7seas');
  assert.equal(suggestedUsername('a@privaterelay.appleid.com'), 'collector');
  assert.equal(suggestedUsername(null), 'collector');
  assert.equal(suggestedUsername('å@example.test'), 'collector');
});

test('validateUsername normalizes a leading at sign and rejects unsafe public handles', () => {
  assert.deepEqual(validateUsername(' @Alex_123 '), { ok: true, username: 'alex_123' });
  assert.deepEqual(validateUsername('ab'), { ok: false, message: 'Use 3–30 letters, numbers, or underscores, starting with a letter.' });
  assert.deepEqual(validateUsername('7seas'), { ok: false, message: 'Use 3–30 letters, numbers, or underscores, starting with a letter.' });
  assert.deepEqual(validateUsername('collectibles'), { ok: false, message: 'Choose a different username.' });
  assert.deepEqual(validateUsername('display name'), { ok: false, message: 'Use 3–30 letters, numbers, or underscores, starting with a letter.' });
  assert.deepEqual(validateUsername('a'.repeat(31)), { ok: false, message: 'Use 3–30 letters, numbers, or underscores, starting with a letter.' });
});
