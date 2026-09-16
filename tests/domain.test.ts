import test from 'node:test';
import assert from 'node:assert/strict';
import { validateItem, validateCollection, escapeSearch, readClientConfig } from '../src/domain/validation.ts';

test('item input cannot be blank or exceed the stored column limit', () => {
  assert.throws(() => validateItem({ title: '   ', notes: '' }));
  assert.throws(() => validateItem({ title: 'x'.repeat(121), notes: '' }));
  assert.throws(() => validateItem({ title: 'Moon', notes: 'x'.repeat(2001) }));
  assert.deepEqual(validateItem({ title: '  Moon  ', notes: '  Gift  ' }), { title: 'Moon', notes: 'Gift' });
});
test('collection input is bounded and trimmed before storage', () => {
  assert.throws(() => validateCollection({ name: '', description: '' }));
  assert.throws(() => validateCollection({ name: 'x'.repeat(81), description: '' }));
  assert.deepEqual(validateCollection({ name: ' Travel ', description: ' Trips ' }), { name: 'Travel', description: 'Trips' });
});
test('literal wildcard characters do not turn item search into a broad query', () => {
  assert.equal(escapeSearch('50%_off\\sale'), '50\\%\\_off\\\\sale');
});
test('missing configuration is explicit and server keys are refused', () => {
  assert.equal(readClientConfig('', '').ready, false);
  assert.equal(readClientConfig('https://example.supabase.co', 'sb_secret_example').ready, false);
  const service = 'eyJ.' + btoa(JSON.stringify({ role: 'service_role' })) + '.signature';
  assert.equal(readClientConfig('https://example.supabase.co', service).ready, false);
  assert.equal(readClientConfig('https://example.supabase.co', 'sb_publishable_example').ready, true);
  assert.equal(readClientConfig('http://example.com', 'sb_publishable_example').ready, false);
  assert.equal(readClientConfig('http://127.0.0.1:54321', 'sb_publishable_example').ready, true);
});
