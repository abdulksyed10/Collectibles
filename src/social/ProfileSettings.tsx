import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, ErrorMessage, Sheet, ui } from '../components/ui';
import { validateUsername } from './usernames';
import type { OwnSocialProfile } from './types';

type ProfileSettingsProps = {
  profile: OwnSocialProfile;
  mode: 'intro' | 'settings';
  save: (username: string) => Promise<OwnSocialProfile>;
  onClose: () => void;
  onDone: (profile: OwnSocialProfile) => void;
};

export function ProfileSettings({ profile, mode, save, onClose, onDone }: ProfileSettingsProps) {
  const [username, setUsername] = useState(profile.username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isIntro = mode === 'intro';

  async function persist(value: string) {
    const validation = validateUsername(value);
    if (!validation.ok) { setError(validation.message); return; }
    setBusy(true); setError('');
    try { onDone(await save(validation.username)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save your username. Try again.'); }
    finally { setBusy(false); }
  }

  return <Sheet title={isIntro ? 'Choose your username' : 'Profile'} subtitle={isIntro ? 'This is how other collectors can find you. Your email stays private.' : 'Your username is visible on items you share.'} busy={busy} onClose={() => { if (isIntro) { void persist(profile.username); } else { onClose(); } }}>
    <View style={{ gap: 8 }}>
      <Text style={ui.label}>Username</Text>
      <TextInput accessibilityLabel="Username" autoCapitalize="none" autoCorrect={false} autoComplete="username" maxLength={30} value={username} onChangeText={setUsername} placeholder="collector_name" placeholderTextColor="#9AA49C" style={ui.input} />
      <Text style={[ui.muted, { fontSize: 12 }]}>3–30 lowercase letters, numbers, or underscores. It must start with a letter.</Text>
    </View>
    <ErrorMessage message={error} />
    {isIntro ? <View style={{ gap: 10 }}><Button title="Continue" onPress={() => { void persist(username); }} loading={busy} /><Button title="Keep suggested username" secondary onPress={() => { void persist(profile.username); }} disabled={busy} /></View> : <View style={{ gap: 10 }}><Button title="Save username" onPress={() => { void persist(username); }} loading={busy} /><Button title="Cancel" secondary onPress={onClose} disabled={busy} /></View>}
  </Sheet>;
}