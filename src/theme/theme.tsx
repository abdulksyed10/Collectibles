import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { paletteForTheme, type Palette, type ThemePreference } from './palette';
export { paletteForTheme, type Palette, type ThemePreference } from './palette';
export const colors: Palette = { ...paletteForTheme('classic') };
function applyPalette(palette: Palette) { Object.assign(colors, palette); }
const storageKey = 'collectibles.theme-preference';

type ThemeContextValue = { preference: ThemePreference; effectiveTheme: Exclude<ThemePreference, 'system'>; setPreference: (theme: ThemePreference) => void };
const ThemeContext = createContext<ThemeContextValue>({ preference: 'system', effectiveTheme: 'classic', setPreference: () => undefined });

function validTheme(value: string | null): value is ThemePreference { return value === 'classic' || value === 'fun' || value === 'dark' || value === 'system'; }
async function readPreference() {
  try {
    if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
    return await SecureStore.getItemAsync(storageKey);
  } catch { return null; }
}
async function writePreference(theme: ThemePreference) {
  try {
    if (Platform.OS === 'web') { localStorage.setItem(storageKey, theme); return; }
    await SecureStore.setItemAsync(storageKey, theme);
  } catch { /* Appearance still applies for the active session. */ }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setStoredPreference] = useState<ThemePreference>('system');
  const effectiveTheme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'classic') : preference;
  applyPalette(paletteForTheme(effectiveTheme));
  useEffect(() => { void readPreference().then(value => { if (validTheme(value)) setStoredPreference(value); }); }, []);
  const value = useMemo<ThemeContextValue>(() => ({ preference, effectiveTheme, setPreference: theme => { setStoredPreference(theme); void writePreference(theme); } }), [effectiveTheme, preference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
