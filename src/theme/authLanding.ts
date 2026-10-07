import type { Palette } from './palette';

/** Theme-aware colors for the promotional panel on the authentication landing screen. */
export function authLandingVisuals(palette: Palette) {
  return {
    surface: palette.pale,
    title: palette.ink,
    body: palette.muted,
    eyebrow: palette.coral,
  };
}
