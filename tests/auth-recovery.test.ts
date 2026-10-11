import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentRecoveryMarker, normalizeRecoveryCode, recoveryIntentFromUrl, recoveryMarkerFromStorage, recoveryPageUrl, type RecoveryMarker } from '../src/auth/recovery.ts';

const appUrl = 'https://www.sharecollectibles.com';

test('recovery links open the trusted code-request route', () => {
  assert.equal(recoveryPageUrl(appUrl), 'https://www.sharecollectibles.com/auth/recovery');
  assert.equal(recoveryIntentFromUrl('https://www.sharecollectibles.com/auth/recovery', appUrl), 'request-code');
  assert.equal(recoveryIntentFromUrl('https://www.sharecollectibles.com/auth/recovery?ref=email', appUrl), 'request-code');
});

test('legacy recovery links are recognized without accepting their credentials', () => {
  assert.equal(recoveryIntentFromUrl('https://www.sharecollectibles.com/#access_token=secret&type=recovery', appUrl), 'legacy-link');
  assert.equal(recoveryIntentFromUrl('https://www.sharecollectibles.com/?type=recovery&token=secret', appUrl), 'legacy-link');
  assert.equal(recoveryIntentFromUrl('https://evil.example/auth/recovery?type=recovery', appUrl), null);
  assert.equal(recoveryIntentFromUrl('https://www.sharecollectibles.com/auth/callback?code=oauth-code', appUrl), null);
});

test('recovery codes preserve leading zeros and reject malformed values before verification', () => {
  assert.equal(normalizeRecoveryCode(' 001234 '), '001234');
  assert.equal(normalizeRecoveryCode('1234567890'), '1234567890');
  assert.equal(normalizeRecoveryCode('12345'), null);
  assert.equal(normalizeRecoveryCode('12345678901'), null);
  assert.equal(normalizeRecoveryCode('12 3456'), null);
  assert.equal(normalizeRecoveryCode('abcdef'), null);
});

test('a saved recovery marker only restores the verified user for one hour', () => {
  const marker: RecoveryMarker = { userId: 'user-a', startedAt: 1_000_000 };
  assert.equal(isCurrentRecoveryMarker(marker, 'user-a', 1_000_000 + 60 * 60_000), true);
  assert.equal(isCurrentRecoveryMarker(marker, 'user-b', 1_000_001), false);
  assert.equal(isCurrentRecoveryMarker(marker, 'user-a', 1_000_000 + 60 * 60_000 + 1), false);
});

test('malformed recovery marker storage cannot restore a password-change form', () => {
  assert.deepEqual(recoveryMarkerFromStorage('{"userId":"user-a","startedAt":1000}'), { userId: 'user-a', startedAt: 1000 });
  assert.equal(recoveryMarkerFromStorage('{"userId":1,"startedAt":1000}'), null);
  assert.equal(recoveryMarkerFromStorage('{"userId":"user-a","startedAt":"1000"}'), null);
  assert.equal(recoveryMarkerFromStorage('not json'), null);
});
