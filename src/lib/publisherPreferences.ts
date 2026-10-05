import { Platform } from 'react-native';
import { authStorage } from './supabase';
import type { BlockedPublisher } from '../domain/models';
const key = 'collectibles.blocked-publishers.v1';
const listeners = new Set<() => void>();
export function onPublicPreferencesChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function publicPreferencesChanged() { for (const listener of listeners) listener(); }
export async function guestBlocks(): Promise<BlockedPublisher[]> {
  try {
    const raw = Platform.OS === 'web' ? localStorage.getItem(key) : await authStorage.getItem(key);
    const rows: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(rows)) return [];
    return rows.filter(row => typeof row?.publisherId === 'string' && /^[0-9a-f-]{36}$/i.test(row.publisherId) && typeof row.blockedAt === 'string').slice(0, 100);
  } catch { return []; }
}
export async function saveGuestBlocks(rows: BlockedPublisher[]) {
  if (rows.length > 100) throw new Error('Unblock a collector before adding another. This device can store 100 blocks.');
  try {
    if (Platform.OS === 'web') localStorage.setItem(key, JSON.stringify(rows));
    else await authStorage.setItem(key, JSON.stringify(rows));
  } catch { throw new Error('Your device could not save this block. Check storage permissions and try again.'); }
  publicPreferencesChanged();
}
