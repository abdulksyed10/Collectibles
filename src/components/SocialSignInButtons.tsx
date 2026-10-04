import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { signInWithProvider } from '../auth/oauth';
import { Button, messageOf, ui } from './ui';

const socialLoginEnabled = process.env.EXPO_PUBLIC_ENABLE_SOCIAL_LOGIN === 'true';

export function SocialSignInButtons({ disabled, onError }: { disabled?: boolean; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
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
    <Button title="Continue with Apple" secondary onPress={() => { void start('apple'); }} loading={busy} disabled={disabled || busy} />
  </View>;
}
