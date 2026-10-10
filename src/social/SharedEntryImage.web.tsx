import React, { useEffect, useRef, useState } from 'react';
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
/** Web images use a Blob URL because img elements cannot attach an auth header. */
export function SharedEntryImage({ itemId, collectionId, audience, size, accessRevision, style, accessibilityLabel, onUnavailable }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    let objectUrl: string | null = null;
    setUri(null);
    if (audience === 'public') {
      try { setUri(publicPhotoUrl(collectionId, itemId, size)); } catch { onUnavailable?.(); }
      return () => { generation.current++; };
    }
    void (async () => {
      try {
        const { data } = await requireClient().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('signed_out');
        const publicKey = clientConfig.ready ? clientConfig.key : '';
        const response = await fetch(memberUrl(itemId, size), { headers: { authorization: `Bearer ${token}`, apikey: publicKey }, cache: 'no-store' });
        if (!response.ok) throw new Error('unavailable');
        const blob = await response.blob();
        if (request !== generation.current) return;
        objectUrl = URL.createObjectURL(blob);
        setUri(objectUrl);
      } catch { if (request === generation.current) onUnavailable?.(); }
    })();
    return () => { generation.current++; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [accessRevision, audience, collectionId, itemId, onUnavailable, size]);
  if (!uri) return <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}><ActivityIndicator color={colors.green} /></View>;
  return <Image source={{ uri }} cachePolicy="none" contentFit="cover" style={style} accessibilityLabel={accessibilityLabel} onError={onUnavailable} />;
}
