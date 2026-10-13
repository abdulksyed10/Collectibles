import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentRecoveryMarker, recoveryIntentFromUrl, recoveryLinkFromUrl, recoveryMarkerFromStorage, recoveryPageUrl, type RecoveryMarker } from '../src/auth/recovery.ts';

const appUrl = 'https://www.sharecollectibles.com';

test('the recovery page opens the trusted reset-link request route', () => {
  assert.equal(recoveryPageUrl(appUrl), 'https://www.sharecollectibles.com/auth/recovery');
  assert.equal(recoveryIntentFromUrl('https://www.sharecollectibles.com/auth/recovery', appUrl), 'request-link');
  assert.equal(recoveryIntentFromUrl('https://www.sharecollectibles.com/auth/recovery?ref=email', appUrl), 'request-link');
});

test('trusted recovery links accept PKCE and legacy credentials without accepting OAuth callbacks', () => {
  assert.deepEqual(recoveryLinkFromUrl('https://www.sharecollectibles.com/auth/recovery?code=recovery-code', appUrl), { kind: 'code', code: 'recovery-code' });
  assert.deepEqual(recoveryLinkFromUrl('https://www.sharecollectibles.com/auth/recovery#access_token=access-token&refresh_token=refresh-token&type=recovery', appUrl), { kind: 'tokens', accessToken: 'access-token', refreshToken: 'refresh-token' });
  assert.equal(recoveryLinkFromUrl('https://evil.example/auth/recovery?code=recovery-code', appUrl), null);
  assert.equal(recoveryLinkFromUrl('https://www.sharecollectibles.com/auth/callback?code=oauth-code', appUrl), null);
  assert.equal(recoveryLinkFromUrl('https://www.sharecollectibles.com/auth/recovery?code=invalid%20code', appUrl), null);
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
