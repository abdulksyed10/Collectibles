import { Platform, Share } from 'react-native';
import { buildShareUrl, isCollectionId } from '../domain/sharing';
import { clientConfig } from './supabase';

export async function shareCollectionLink(collectionId: string): Promise<string> {
  const base = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : process.env.EXPO_PUBLIC_WEB_URL;
  if (!base) throw new Error('Share links are unavailable right now.');
  const url = buildShareUrl(base, collectionId);
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: 'Collectibles', url }); return 'Share opened.'; }
      catch (error) { if (error instanceof Error && error.name === 'AbortError') return ''; throw new Error('Unable to share this link. Try again.'); }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(url); return 'Link copied.'; }
      catch { throw new Error('Unable to copy this link. Check your browser permissions.'); }
    }
    throw new Error('Link sharing is unavailable in this browser.');
  }
  const result = await Share.share({ title: 'Collectibles', message: url });
  return result.action === Share.dismissedAction ? '' : 'Share opened.';
}

export function publicPhotoUrl(collectionId: string, itemId: string, size: 'full' | 'thumb'): string {
  if (!clientConfig.ready || !isCollectionId(collectionId) || !isCollectionId(itemId)) throw new Error('Photo unavailable.');
  return `${clientConfig.url}/functions/v1/public-media?collectionId=${collectionId}&itemId=${itemId}&size=${size}`;
}
