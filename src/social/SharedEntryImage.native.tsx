import React, { useEffect, useMemo, useState } from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import { ActivityIndicator, View } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../components/ui';
import { publicPhotoUrl } from '../lib/sharing';
import { clientConfig, requireClient } from '../lib/supabase';

type Props = { itemId: string; collectionId: string; audience: 'public' | 'friends'; size: 'full' | 'thumb'; accessRevision: number; style?: StyleProp<ImageStyle>; accessibilityLabel: string; onUnavailable?: () => void };
function memberUrl(itemId: string, size: 'full' | 'thumb') {
  if (!clientConfig.ready) throw new Error('Photo unavailable.');
  return `${clientConfig.url}/functions/v1/member-media?itemId=${encodeURIComponent(itemId)}&size=${size}`;
}
/** Native expo-image requests carry the JWT; its cache key is access-scoped. */
export function SharedEntryImage({ itemId, collectionId, audience, size, accessRevision, style, accessibilityLabel, onUnavailable }: Props) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setToken(null);
    if (audience === 'public') return () => { active = false; };
    void requireClient().auth.getSession().then(({ data }) => { if (active) setToken(data.session?.access_token ?? null); }).catch(() => { if (active) onUnavailable?.(); });
    return () => { active = false; };
  }, [accessRevision, audience, onUnavailable]);
  const source = useMemo(() => {
    try {
      if (audience === 'public') return { uri: publicPhotoUrl(collectionId, itemId, size), cacheKey: `public-${itemId}-${size}` };
      if (!token) return null;
      const publicKey = clientConfig.ready ? clientConfig.key : '';
      return { uri: memberUrl(itemId, size), headers: { authorization: `Bearer ${token}`, apikey: publicKey }, cacheKey: `member-${itemId}-${size}-${accessRevision}` };
    } catch { return null; }
  }, [accessRevision, audience, collectionId, itemId, size, token]);
  if (!source) return <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}><ActivityIndicator color={colors.green} /></View>;
  return <Image source={source} cachePolicy="none" contentFit="cover" style={style} accessibilityLabel={accessibilityLabel} onError={onUnavailable} />;
}
