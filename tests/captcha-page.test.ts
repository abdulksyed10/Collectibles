import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function page() {
  const nonce = 'fixture-nonce-1234567890';
  const messages: { type: string; token?: string }[] = [];
  let options: Record<string, (...args: any[]) => void>;
  let command: (event: { data: string }) => void;
  const window = {
    location: { search: `?siteKey=fixture&nonce=${nonce}` },
    ReactNativeWebView: { postMessage: (message: string) => messages.push(JSON.parse(message)) },
    turnstile: { render: (_: string, value: typeof options) => { options = value; return 'widget'; }, execute() {}, reset() {} },
    addEventListener: (_: string, value: typeof command) => { command = value; },
  };
  vm.runInNewContext(readFileSync('public/auth/captcha.js', 'utf8'), { window, document: { addEventListener() {} }, URLSearchParams });
  return { messages, token: () => options!.callback!('a-valid-fixture-token-long-enough'), expire: () => options!['expired-callback']!(), error: () => options!['error-callback']!(), command: (type: string) => command!({ data: JSON.stringify({ type, nonce }) }) };
}

test('hosted CAPTCHA ignores late tokens after expiry or errors', () => {
  for (const event of ['expire', 'error'] as const) {
    const challenge = page(); challenge.command('execute'); challenge[event](); challenge.token();
    assert.deepEqual(challenge.messages.map(message => message.type), ['ready', event === 'expire' ? 'expired' : 'error']);
  }
});

test('hosted CAPTCHA needs an explicit execution and sends at most one token per attempt', () => {
  const challenge = page(); challenge.token();
  assert.deepEqual(challenge.messages.map(message => message.type), ['ready']);
  challenge.command('execute'); challenge.token(); challenge.token();
  assert.deepEqual(challenge.messages.map(message => message.type), ['ready', 'token']);
  challenge.command('reset'); challenge.token();
  assert.equal(challenge.messages.length, 2);
  challenge.command('execute'); challenge.token();
  assert.equal(challenge.messages.length, 3);
});
