import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [unavailable, setUnavailable] = useState(false);
  const generation = useRef(0);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;
  const markUnavailable = useCallback(() => {
    setUri(null);
    setUnavailable(true);
    unavailableRef.current?.();
  }, []);
  useEffect(() => {
    const request = ++generation.current;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setUri(null); setUnavailable(false);
    if (audience === 'public') {
      try { setUri(publicPhotoUrl(collectionId, itemId, size)); } catch { markUnavailable(); }
      return () => { generation.current++; controller.abort(); };
    }
    void (async () => {
      try {
        const { data } = await requireClient().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('signed_out');
        const publicKey = clientConfig.ready ? clientConfig.key : '';
        const response = await fetch(memberUrl(itemId, size), { headers: { authorization: `Bearer ${token}`, apikey: publicKey }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('unavailable');
        const blob = await response.blob();
        if (request !== generation.current) return;
        objectUrl = URL.createObjectURL(blob);
        setUri(objectUrl);
      } catch { if (!controller.signal.aborted && request === generation.current) markUnavailable(); }
    })();
    return () => { generation.current++; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [accessRevision, audience, collectionId, itemId, markUnavailable, size]);
  if (unavailable) return <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]} />;
  if (!uri) return <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}><ActivityIndicator color={colors.green} /></View>;
  return <Image source={{ uri }} cachePolicy="none" contentFit={size === 'full' ? 'contain' : 'cover'} style={style} accessibilityLabel={accessibilityLabel} onError={markUnavailable} />;
}
