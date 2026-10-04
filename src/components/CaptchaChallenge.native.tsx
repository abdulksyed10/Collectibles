import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View, useColorScheme } from 'react-native';
import * as Crypto from 'expo-crypto';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { buildCaptchaPageUrl, isAllowedCaptchaNavigation, isExpectedCaptchaPage, parseCaptchaMessage } from '../auth/captchaMessages';
import { Button, colors, ui } from './ui';

function bytesToNonce(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function CaptchaChallenge({ siteKey, onToken, onError }: { siteKey: string; onToken: (token: string) => void; onError: () => void }) {
  const callbacks = useRef({ onToken, onError });
  const accepted = useRef(false);
  const colorScheme = useColorScheme();
  const [attempt, setAttempt] = useState(0);
  const [nonce, setNonce] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim() || '';

  useEffect(() => { callbacks.current = { onToken, onError }; }, [onError, onToken]);
  useEffect(() => {
    let active = true;
    accepted.current = false;
    setNonce(null);
    setLoadError(false);
    Crypto.getRandomBytesAsync(24)
      .then(bytes => { if (active) setNonce(bytesToNonce(bytes)); })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        callbacks.current.onError();
      });
    return () => { active = false; };
  }, [attempt, siteKey]);

  const pageUrl = useMemo(() => {
    if (!nonce || !configuredWebUrl) return null;
    try { return buildCaptchaPageUrl(configuredWebUrl, siteKey, nonce, colorScheme === 'dark' ? 'dark' : 'light'); }
    catch { return null; }
  }, [colorScheme, configuredWebUrl, nonce, siteKey]);

  useEffect(() => {
    if (!nonce || pageUrl || loadError) return;
    setLoadError(true);
    callbacks.current.onError();
  }, [loadError, nonce, pageUrl]);

  function retry() { setAttempt(value => value + 1); }
  function handleMessage(event: WebViewMessageEvent) {
    if (!pageUrl || !isExpectedCaptchaPage(event.nativeEvent.url, pageUrl)) return;
    const message = parseCaptchaMessage(event.nativeEvent.data, nonce ?? '');
    if (!message || message.type === 'ready') return;
    if (message.type === 'token') {
      if (accepted.current) return;
      accepted.current = true;
      callbacks.current.onToken(message.token);
      return;
    }
    accepted.current = false;
    setLoadError(true);
    callbacks.current.onError();
  }

  const retryView = <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={[ui.muted, { fontSize: 12 }]}>The security check could not load. Check your connection and try again.</Text><Button title="Retry security check" secondary onPress={retry} /></View>;
  return <View style={{ minHeight: 104, gap: 6 }}>
    <Text style={[ui.muted, { fontSize: 12 }]}>Security check</Text>
    {loadError || !pageUrl ? (loadError ? retryView : <ActivityIndicator color={colors.green} />) : <WebView
      source={{ uri: pageUrl }}
      originWhitelist={[new URL(pageUrl).origin + '/*', 'https://challenges.cloudflare.com/*', 'about:blank', 'about:srcdoc']}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      onMessage={handleMessage}
      onError={() => { setLoadError(true); callbacks.current.onError(); }}
      onHttpError={() => { setLoadError(true); callbacks.current.onError(); }}
      onShouldStartLoadWithRequest={request => isAllowedCaptchaNavigation(request.url, pageUrl)}
      style={{ height: 92, backgroundColor: colors.card }}
    />}
  </View>;
}
