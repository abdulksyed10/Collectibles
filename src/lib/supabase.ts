import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient, processLock } from '@supabase/supabase-js';
import { readClientConfig } from '../domain/validation';

export const clientConfig = readClientConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
// Native sessions stay in Keychain/Keystore. Chunking accommodates larger sessions.
const secureStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
    const count = Number(await SecureStore.getItemAsync(`${key}.count`));
    if (!Number.isInteger(count) || count < 1 || count > 100) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.some(part => part === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') { sessionStorage.setItem(key, value); return; }
    const oldCount = Number(await SecureStore.getItemAsync(`${key}.count`)) || 0;
    const count = Math.ceil(value.length / 1800);
    for (let i = 0; i < count; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * 1800, (i + 1) * 1800));
    await SecureStore.setItemAsync(`${key}.count`, String(count));
    for (let i = count; i < Math.min(oldCount, 100); i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') { sessionStorage.removeItem(key); return; }
    const count = Math.min(Number(await SecureStore.getItemAsync(`${key}.count`)) || 0, 100);
    await SecureStore.deleteItemAsync(`${key}.count`);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
};
export const supabase = clientConfig.ready ? createClient(clientConfig.url, clientConfig.key, {
  auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: Platform.OS === 'web', lock: processLock },
}) : null;
export function requireClient() {
  if (!supabase) throw new Error('The collection service has not been connected yet.');
  return supabase;
}
