import assert from 'node:assert/strict';
import test from 'node:test';
import { paletteForTheme } from '../src/theme/palette.ts';

test('theme palettes keep readable dark and colorful fun choices alongside classic', () => {
  assert.equal(paletteForTheme('classic').paper, '#F8F7F3');
  assert.equal(paletteForTheme('fun').green, '#6D3DA1');
  assert.equal(paletteForTheme('dark').paper, '#111713');
  assert.notEqual(paletteForTheme('dark').ink, paletteForTheme('dark').paper);
});
