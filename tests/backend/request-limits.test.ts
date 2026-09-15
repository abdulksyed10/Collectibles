import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedJson, validateAction, validateJpegBase64 } from '../../supabase/functions/media/validation.ts';

test('upload boundary rejects invalid and oversized image data', () => {
  assert.throws(() => validateJpegBase64('not base64', false));
  assert.throws(() => validateJpegBase64('A'.repeat(2796208), false));
});

test('request boundary rejects oversized bodies and arbitrary storage keys', async () => {
  await assert.rejects(readBoundedJson(new Request('https://local', { method:'POST', headers:{'content-type':'application/json','content-length':'4000000'},body:'{}' })));
  assert.throws(() => validateAction({action:'delete-pin',pinId:'not-a-uuid',key:'another-owner/photo.jpg'}));
});
