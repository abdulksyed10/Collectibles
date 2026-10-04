import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOAuthCallback, webOAuthCallbackUrl } from '../src/auth/oauthCore.ts';

const webUrl = 'https://collectibles-three.vercel.app';

test('OAuth callback parser accepts only approved web and native callback routes', () => {
  assert.deepEqual(parseOAuthCallback('https://collectibles-three.vercel.app/auth/callback?code=abc-123_~', webUrl), { kind: 'code', code: 'abc-123_~' });
  assert.deepEqual(parseOAuthCallback('collectibles://auth/callback?code=abc-123_~', webUrl), { kind: 'code', code: 'abc-123_~' });
  assert.deepEqual(parseOAuthCallback('https://collectibles-three.vercel.app/auth/callback?error=access_denied', webUrl), { kind: 'error', message: 'Sign in was cancelled or denied.' });
  assert.equal(webOAuthCallbackUrl(webUrl), 'https://collectibles-three.vercel.app/auth/callback');
});

test('OAuth callback parser ignores foreign, incomplete, and legacy sharing URLs', () => {
  for (const value of [
    'https://evil.example/auth/callback?code=abc',
    'https://collectibles-three.vercel.app/not-auth?code=abc',
    'collectibles://auth/wrong?code=abc',
    'https://collectibles-three.vercel.app/?collection=00000000-0000-4000-8000-000000000001',
    'https://collectibles-three.vercel.app/auth/callback?code=not valid',
    'https://collectibles-three.vercel.app/auth/callback',
  ]) assert.equal(parseOAuthCallback(value, webUrl), null);
});
