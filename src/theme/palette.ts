export type ThemePreference = 'classic' | 'fun' | 'dark' | 'system';
export type Palette = { paper: string; card: string; ink: string; muted: string; line: string; green: string; pale: string; coral: string; sand: string; danger: string };

const palettes: Record<Exclude<ThemePreference, 'system'>, Palette> = {
  classic: { paper: '#F8F7F3', card: '#FFFFFF', ink: '#253C35', muted: '#748079', line: '#E4E8E0', green: '#294D40', pale: '#E8EFE8', coral: '#BB6145', sand: '#EFE7D8', danger: '#A53636' },
  fun: { paper: '#FFF8EE', card: '#FFFFFF', ink: '#3B2557', muted: '#7D5C86', line: '#F0D6E4', green: '#6D3DA1', pale: '#F6E2FF', coral: '#E4548C', sand: '#FFE1A8', danger: '#B33A55' },
  dark: { paper: '#111713', card: '#19221C', ink: '#F1F4ED', muted: '#B6C1B7', line: '#2E3B32', green: '#91C8A2', pale: '#24362B', coral: '#F5A27E', sand: '#3C3425', danger: '#FF9898' },
};

export function paletteForTheme(theme: Exclude<ThemePreference, 'system'>) { return palettes[theme]; }
