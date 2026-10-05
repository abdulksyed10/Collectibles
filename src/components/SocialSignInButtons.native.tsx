import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { signInWithProvider } from '../auth/oauth';
import { Button, messageOf, ui } from './ui';

const socialLoginEnabled = process.env.EXPO_PUBLIC_ENABLE_SOCIAL_LOGIN === 'true';

export function SocialSignInButtons({ disabled, onError }: { disabled?: boolean; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS !== 'ios');
  useEffect(() => {
    if (Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);
  if (!socialLoginEnabled) return null;
  async function start(provider: 'google' | 'apple') {
    setBusy(true);
    onError('');
    try { await signInWithProvider(provider); }
    catch (error) { onError(messageOf(error)); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1, height: 1, backgroundColor: '#D8DED4' }} /><Text style={[ui.muted, { fontSize: 12 }]}>or continue with</Text><View style={{ flex: 1, height: 1, backgroundColor: '#D8DED4' }} /></View>
    <Button title="Continue with Google" secondary onPress={() => { void start('google'); }} loading={busy} disabled={disabled || busy} />
    {Platform.OS === 'ios' ? appleAvailable ? <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={12}
      style={{ width: '100%', height: 48, opacity: disabled || busy ? 0.55 : 1 }}
      onPress={() => { void start('apple'); }}
    /> : null : process.env.EXPO_PUBLIC_ENABLE_APPLE_BROWSER_LOGIN==='true' ? <Button title="Continue with Apple" secondary onPress={() => { void start('apple'); }} loading={busy} disabled={disabled || busy} /> : null}
  </View>;
}
