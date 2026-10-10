import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;
  const markUnavailable = useCallback(() => {
    setToken(null);
    setUnavailable(true);
    unavailableRef.current?.();
  }, []);
  useEffect(() => {
    let active = true;
    setToken(null); setViewerId(null); setUnavailable(false);
    if (audience === 'public') {
      try { publicPhotoUrl(collectionId, itemId, size); } catch { markUnavailable(); }
      return () => { active = false; };
    }
    void requireClient().auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      if (!session?.access_token || !session.user.id) { markUnavailable(); return; }
      setViewerId(session.user.id);
      setToken(session.access_token);
    }).catch(() => { if (active) markUnavailable(); });
    return () => { active = false; };
  }, [accessRevision, audience, collectionId, itemId, markUnavailable, size]);
  const source = useMemo(() => {
    try {
      if (audience === 'public') return { uri: publicPhotoUrl(collectionId, itemId, size), cacheKey: `public-${itemId}-${size}` };
      if (!token) return null;
      const publicKey = clientConfig.ready ? clientConfig.key : '';
      return { uri: memberUrl(itemId, size), headers: { authorization: `Bearer ${token}`, apikey: publicKey }, cacheKey: `member-${viewerId ?? 'unknown'}-${itemId}-${size}-${accessRevision}` };
    } catch { return null; }
  }, [accessRevision, audience, collectionId, itemId, size, token, viewerId]);
  if (unavailable) return <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]} />;
  if (!source) return <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}><ActivityIndicator color={colors.green} /></View>;
  return <Image source={source} cachePolicy="none" contentFit={size === 'full' ? 'contain' : 'cover'} style={style} accessibilityLabel={accessibilityLabel} onError={markUnavailable} />;
}
