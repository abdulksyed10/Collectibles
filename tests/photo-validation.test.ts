import assert from 'node:assert/strict';
import test from 'node:test';

async function photoValidation() {
  const module = await import('../src/domain/photoValidation.ts').catch(() => ({}));
  assert.equal(typeof module.assertImageAsset, 'function', 'assertImageAsset should be available to the photo picker');
  assert.equal(typeof module.normalizePickerError, 'function', 'normalizePickerError should be available to the photo picker');
  return module as { assertImageAsset(asset: { type?: string | null; mimeType?: string | null }): void; normalizePickerError(error: unknown): string | null };
}

test('photo selection accepts images and leaves missing metadata to image decoding', async () => {
  const { assertImageAsset } = await photoValidation();
  assert.doesNotThrow(() => assertImageAsset({ type: 'image', mimeType: 'image/heic' }));
  assert.doesNotThrow(() => assertImageAsset({ type: null, mimeType: null }));
});

test('photo selection rejects video and document assets with image-only copy', async () => {
  const { assertImageAsset } = await photoValidation();
  for (const asset of [{ type: 'video', mimeType: 'video/mp4' }, { type: null, mimeType: 'application/pdf' }]) {
    assert.throws(() => assertImageAsset(asset), { message: 'Unsupported file type. Only images are supported.' });
  }
});

test('photo selection rewrites Expo picker image-and-video errors without hiding unrelated errors', async () => {
  const { normalizePickerError } = await photoValidation();
  assert.equal(normalizePickerError(new Error('Unsupported file type: application/pdf. Only images and videos are supported.')), 'Unsupported file type. Only images are supported.');
  assert.equal(normalizePickerError(new Error('Camera permission request failed.')), null);
});
