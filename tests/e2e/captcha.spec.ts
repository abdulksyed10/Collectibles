import { expect, test } from '@playwright/test';

const nonce = '03b96a6c785e459b83172b32c8f6ba1f';
const token = 'token-token-token-token-token-token-token-token';

test('standalone CAPTCHA never sends a token after expiry', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_CAPTCHA_FIXTURE !== 'true', 'Requires a CAPTCHA fixture build.');
  await page.addInitScript(() => {
    (window as typeof window & { captchaMessages: unknown[]; ReactNativeWebView: { postMessage: (value: string) => void } }).captchaMessages = [];
    (window as typeof window & { captchaMessages: unknown[]; ReactNativeWebView: { postMessage: (value: string) => void } }).ReactNativeWebView = {
      postMessage: value => (window as typeof window & { captchaMessages: unknown[] }).captchaMessages.push(JSON.parse(value)),
    };
  });
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => route.fulfill({ contentType: 'text/javascript', body: `window.turnstile={render:function(_target,options){window.captchaOptions=options;return 'widget';}};` }));
  await page.goto(`/auth/captcha.html?siteKey=test-site-key&nonce=${nonce}&theme=light`);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { captchaMessages: unknown[] }).captchaMessages)).toContainEqual({ type: 'ready', nonce });
  await page.evaluate(value => (window as typeof window & { captchaOptions: { callback: (token: string) => void; 'expired-callback': () => void } }).captchaOptions['expired-callback'](), token);
  await page.evaluate(value => (window as typeof window & { captchaOptions: { callback: (token: string) => void } }).captchaOptions.callback(value), token);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { captchaMessages: Array<{ type: string }> }).captchaMessages.map(message => message.type))).toEqual(['ready', 'expired']);
});

test('web CAPTCHA keeps its widget through form rerenders and remounts only on retry', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_CAPTCHA_FIXTURE !== 'true', 'Requires EXPO_PUBLIC_TURNSTILE_SITE_KEY during the fixture build.');
  await page.addInitScript(() => {
    const state = { renders: 0, removes: 0, options: null as null | { callback: (token: string) => void; 'expired-callback': () => void } };
    (window as typeof window & { captchaState: typeof state }).captchaState = state;
    (window as typeof window & { turnstile: unknown }).turnstile = {
      render: (_target: string, options: typeof state.options) => { state.renders += 1; state.options = options; return String(state.renders); },
      remove: () => { state.removes += 1; },
    };
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { captchaState: { renders: number } }).captchaState.renders)).toBe(1);
  await page.getByLabel('Email address').fill('collector@example.test');
  await page.evaluate(value => (window as typeof window & { captchaState: { options: { callback: (token: string) => void } } }).captchaState.options.callback(value), token);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { captchaState: { renders: number } }).captchaState.renders)).toBe(1);
  await page.evaluate(() => (window as typeof window & { captchaState: { options: { 'expired-callback': () => void } } }).captchaState.options['expired-callback']());
  await expect(page.getByRole('button', { name: 'Retry security check', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry security check', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { captchaState: { renders: number; removes: number } }).captchaState)).toEqual({ renders: 2, removes: 1, options: expect.anything() });
});
