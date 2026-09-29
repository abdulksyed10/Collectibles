import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAuthError, recordCredentialFailure } from '../src/auth/security.ts';

test('invalid credentials use the same message and pause this form after five recent failures', () => {
  const now = 1_000_000;
  assert.deepEqual(mapAuthError({ status: 400, message: 'Invalid login credentials' }, now), { kind: 'credentials', message: 'Email or password is incorrect.' });
  const failures = [now - 9 * 60_000, now - 8 * 60_000, now - 7 * 60_000, now - 6 * 60_000];
  const outcome = recordCredentialFailure(failures, now);
  assert.equal(outcome.failures.length, 5);
  assert.equal(outcome.retryAt, now + 60_000);
});

test('rate limits use a server retry hint when supplied and failures outside the window do not count', () => {
  const now = 1_000_000;
  assert.deepEqual(mapAuthError({ status: 429, message: 'rate limit reached' }, now, '120'), { kind: 'rate-limit', message: 'Too many requests. Try again in 2 minutes.', retryAt: now + 120_000 });
  assert.deepEqual(recordCredentialFailure([now - 11 * 60_000], now), { failures: [now], retryAt: null });
});

test('captcha and connection failures have actionable non-sensitive messages', () => {
  const now = 1_000_000;
  assert.equal(mapAuthError({ message: 'captcha verification failed' }, now).kind, 'captcha');
  assert.equal(mapAuthError(new TypeError('Network request failed'), now).kind, 'network');
});
