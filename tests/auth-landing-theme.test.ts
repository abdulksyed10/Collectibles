import assert from 'node:assert/strict';
import test from 'node:test';
import { authLandingVisuals } from '../src/theme/authLanding.ts';
import { paletteForTheme } from '../src/theme/palette.ts';

function luminance(hex: string) {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(first: string, second: string) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test('dark landing visuals keep its title, supporting text, and accent readable on the panel', () => {
  const visuals = authLandingVisuals(paletteForTheme('dark'));

  assert.equal(visuals.surface, paletteForTheme('dark').pale);
  assert.ok(contrast(visuals.title, visuals.surface) >= 4.5);
  assert.ok(contrast(visuals.body, visuals.surface) >= 4.5);
  assert.ok(contrast(visuals.eyebrow, visuals.surface) >= 4.5);
});
