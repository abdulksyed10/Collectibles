import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { isAllowedCaptchaNavigation, parseCaptchaMessage } from '../src/auth/captchaMessages.ts';

const nonce = '03b96a6c-785e-459b-8317-2b32c8f6ba1f';
const token = 'token-token-token-token-token-token-token-token';

test('captcha bridge accepts only well-formed events from its own nonce', () => {
  assert.deepEqual(parseCaptchaMessage(JSON.stringify({ type: 'ready', nonce }), nonce), { type: 'ready' });
  assert.deepEqual(parseCaptchaMessage(JSON.stringify({ type: 'token', nonce, token }), nonce), { type: 'token', token });
  assert.deepEqual(parseCaptchaMessage(JSON.stringify({ type: 'expired', nonce }), nonce), { type: 'expired' });
  assert.deepEqual(parseCaptchaMessage(JSON.stringify({ type: 'error', nonce }), nonce), { type: 'error' });
});

test('captcha bridge rejects malformed, stale, and unsafe events', () => {
  for (const value of [
    '',
    '{',
    JSON.stringify({ type: 'token', nonce: 'wrong', token }),
    JSON.stringify({ type: 'token', nonce, token: 'too-short' }),
    JSON.stringify({ type: 'token', nonce, token: 'x'.repeat(4097) }),
    JSON.stringify({ type: 'unknown', nonce }),
    JSON.stringify({ type: 'ready', nonce, token }),
    JSON.stringify({ type: 'expired', nonce, token }),
  ]) assert.equal(parseCaptchaMessage(value, nonce), null);
});

test('native CAPTCHA navigation is limited to the hosted page and Cloudflare challenge', () => {
  const page = 'https://collectibles-three.vercel.app/auth/captcha.html?siteKey=public&nonce=' + nonce;
  assert.equal(isAllowedCaptchaNavigation(page, page), true);
  assert.equal(isAllowedCaptchaNavigation('about:blank', page), true);
  assert.equal(isAllowedCaptchaNavigation('about:srcdoc', page), true);
  assert.equal(isAllowedCaptchaNavigation('https://challenges.cloudflare.com/turnstile/v0/api.js', page), true);
  assert.equal(isAllowedCaptchaNavigation('https://evil.example/challenge', page), false);
  assert.equal(isAllowedCaptchaNavigation('https://collectibles-three.vercel.app/account', page), false);
});

test('standalone CAPTCHA script remains syntactically valid JavaScript', () => {
  const script = readFileSync('public/auth/captcha.js', 'utf8');
  assert.doesNotThrow(() => new vm.Script(script));
});
