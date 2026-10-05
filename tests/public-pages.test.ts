import assert from 'node:assert/strict';
import test from 'node:test';
import { publicInfoPageFromUrl } from '../src/lib/publicPages.ts';

test('recognizes only the supported public information routes', () => {
  assert.equal(publicInfoPageFromUrl('https://collectibles.example/privacy'), 'privacy');
  assert.equal(publicInfoPageFromUrl('https://collectibles.example/delete-account/'), 'delete-account');
  assert.equal(publicInfoPageFromUrl('collectibles://auth/callback'), null);
  assert.equal(publicInfoPageFromUrl('https://collectibles.example/explore'), null);
});
