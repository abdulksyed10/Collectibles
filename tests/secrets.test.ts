import test from 'node:test';
import assert from 'node:assert/strict';
import { scanFile } from '../scripts/secret-rules.mjs';
test('secret scan blocks environment files even when the content looks harmless', () => {
  assert.ok(scanFile('.env.local', 'HELLO=world').length);
  assert.ok(scanFile('supabase/.env.production', '').length);
  assert.equal(scanFile('.env.example', 'R2_SECRET_ACCESS_KEY=\n').length, 0);
});
test('secret scan blocks credentials without printing their contents', () => {
  const key = ['sb', 'secret', 'A'.repeat(40)].join('_');
  const result = scanFile('src/config.ts', `const key = '${key}'`);
  assert.ok(result.length); assert.ok(!JSON.stringify(result).includes(key));
  const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from('{"role":"service_role"}').toString('base64url'), 'a'.repeat(40)].join('.');
  assert.ok(scanFile('config.ts', token).length);
  assert.ok(scanFile('notes.md', ['postgresql://admin', 'actual-password@db.example.com/app'].join(':')).length);
});
test('publishable configuration and code that reads secret names are allowed', () => {
  assert.equal(scanFile('src/config.ts', `const key = '${['sb', 'publishable', 'A'.repeat(40)].join('_')}'`).length, 0);
  assert.equal(scanFile('server.ts', 'const secret = Deno.env.get("R2_SECRET_ACCESS_KEY");').length, 0);
});
