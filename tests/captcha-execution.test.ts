import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const web = readFileSync('src/components/CaptchaChallenge.web.tsx', 'utf8');
const native = readFileSync('src/components/CaptchaChallenge.native.tsx', 'utf8');
const hosted = readFileSync('public/auth/captcha.js', 'utf8');
const auth = readFileSync('src/screens/AuthScreen.tsx', 'utf8');

test('Turnstile widgets are interaction-only and never configure automatic retry', () => {
  for (const source of [web, hosted]) {
    assert.match(source, /execution:\s*'execute'/);
    assert.match(source, /appearance:\s*'interaction-only'/);
    assert.match(source, /retry:\s*'never'/);
    assert.match(source, /'refresh-expired':\s*'manual'/);
  }
  assert.match(native, /post\('execute'\)/);
  assert.match(hosted, /window\.turnstile\.execute\(widgetId\)/);
});

test('the auth form requests a challenge only from a submitted action and resumes that action with its token', () => {
  assert.match(auth, /requestCaptcha\('submit'\)/);
  assert.match(auth, /requestCaptcha\('resend'\)/);
  assert.match(auth, /submitRef\.current\?\.\(token\)/);
  assert.doesNotMatch(auth, /disabled=\{[^}]*captchaToken/);
  assert.doesNotMatch(auth, /onPress=\{submit\}/);
});
