import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { ArrowRight, Check, LockKeyhole, Layers3, Eye, EyeOff, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../auth/session';
import { serviceReady } from '../lib/supabase';
import { Brand, Button, colors, ErrorMessage, Field, fonts, messageOf, ui } from '../components/ui';
import { PinArtwork } from '../components/PinArtwork';
export function AuthScreen({ onDemo }: { onDemo: () => void }) {
  const wide = useWindowDimensions().width >= 860;
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'verify'>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  function change(next: typeof mode) { setMode(next); setError(''); setNotice(''); setPassword(''); }
  async function submit() {
    if (!serviceReady || busy) return;
    setError(''); setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if ((mode === 'signin' || mode === 'signup') && password.length < (mode === 'signup' ? 8 : 1)) { setError(mode === 'signup' ? 'Use a password with at least 8 characters.' : 'Enter your password.'); return; }
    setBusy(true);
    try {
      if (mode === 'signin') await auth.signIn(email, password);
      if (mode === 'signup') { const signedIn = await auth.signUp(email, password); if (!signedIn) { change('signin'); setNotice('Check your email to confirm your account, then sign in here.'); } }
      if (mode === 'reset') { await auth.sendReset(email); setMode('verify'); setNotice('If this email has an account, a recovery email is on its way. Enter its code below.'); }
      if (mode === 'verify') await auth.verifyReset(email, code);
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  const heading = mode === 'signup' ? 'A home for your finds.' : mode === 'reset' ? 'Let’s get you back in.' : mode === 'verify' ? 'Check your inbox.' : 'Welcome to your collection.';
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: wide ? 36 : 24 }}><View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', flex: 1 }}><View style={[ui.row, { justifyContent: 'space-between', marginBottom: wide ? 40 : 30 }]}><Brand /><View style={[ui.row, { gap: 6 }]}><LockKeyhole size={14} color={colors.muted} /><Text style={[ui.muted, { fontSize: 12 }]}>Your own little world</Text></View></View><View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 80 : 28 }}>
    <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', padding: wide ? 36 : 0, backgroundColor: wide ? '#EEF0E7' : undefined, borderRadius: 32, alignItems: wide ? 'flex-start' : 'center', alignSelf: wide ? 'stretch' : undefined, justifyContent: 'center', minHeight: wide ? 580 : undefined }}>
      {wide ? <Text style={{ color: colors.coral, fontFamily: fonts.bold, letterSpacing: 2, fontSize: 11, marginBottom: 22 }}>SMALL THINGS. GOOD STORIES.</Text> : null}
      <Text style={[ui.title, { fontSize: wide ? 64 : 38, lineHeight: wide ? 68 : 42, textAlign: wide ? 'left' : 'center' }]}>Every pin has{wide ? '\n' : ' '}a story.</Text>
      <Text style={[ui.muted, { fontSize: 16, lineHeight: 26, maxWidth: 320, marginTop: 18, textAlign: wide ? 'left' : 'center' }]}>Keep your favorite finds together, beautifully organized and entirely yours.</Text>
      {wide ? <View style={{ marginVertical: 24, alignSelf: 'center' }}><PinArtwork /></View> : null}
      {wide ? <View style={{ gap: 14 }}><View style={ui.row}><Layers3 size={17} color={colors.green} /><Text style={ui.text}>A place for every collection</Text></View><View style={ui.row}><LockKeyhole size={17} color={colors.green} /><Text style={ui.text}>Private, by default. Always yours.</Text></View></View> : null}
    </View>
    <View style={{ width: '100%', maxWidth: 400, paddingVertical: 20, gap: 23 }}>
      <View style={{ gap: 10 }}><Text style={[ui.title, { fontSize: 37, lineHeight: 41 }]}>{heading}</Text><Text style={ui.muted}>{mode === 'signin' ? 'Sign in to pick up where you left off.' : mode === 'signup' ? 'Start saving the pins you love.' : 'Recover access to your private collection.'}</Text></View>
      {!serviceReady ? <View style={{ backgroundColor: colors.sand, padding: 15, borderRadius: 12 }}><Text style={[ui.text, { fontFamily: fonts.medium, fontSize: 13 }]}>Take a look around.</Text><Text style={[ui.muted, { fontSize: 12 }]}>Try a sample collection while account sign-in is being set up.</Text></View> : null}
      <View style={{ gap: 8 }}><Button title="Try the demo" secondary={serviceReady} onPress={onDemo} disabled={busy} icon={Layers3} /><Text style={[ui.muted, { fontSize: 12, textAlign: 'center' }]}>No account needed. Demo changes reset when you leave.</Text></View>
      <View style={{ gap: 18 }}><Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} />
      {mode === 'signin' || mode === 'signup' ? <View><Field label="Password" value={password} onChangeText={setPassword} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} secureTextEntry={!visible} autoCapitalize="none" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} editable={!busy} onSubmitEditing={submit} style={{ paddingRight: 52 }} /><Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} style={{ position: 'absolute', right: 14, bottom: 14 }}>{visible ? <EyeOff size={21} color={colors.muted} /> : <Eye size={21} color={colors.muted} />}</Pressable></View> : null}
      {mode === 'verify' ? <Field label="Recovery code" value={code} onChangeText={setCode} placeholder="Code from your email" keyboardType="number-pad" autoComplete="one-time-code" editable={!busy} /> : null}
      {mode === 'signin' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => change('reset')} style={{ alignSelf: 'flex-end' }}><Text style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 13 }}>Forgot password?</Text></Pressable> : null}
      <ErrorMessage message={error} />{notice ? <Text accessibilityRole="alert" style={[ui.text, { color: colors.green, fontSize: 14 }]}>{notice}</Text> : null}
      <Button title={mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send recovery email' : 'Verify code'} onPress={submit} loading={busy} disabled={!serviceReady} icon={ArrowRight} />
      </View>
      <View style={[ui.row, { justifyContent: 'center', flexWrap: 'wrap', gap: 5 }]}><Text style={ui.muted}>{mode === 'signin' ? 'New to Pin Keeper?' : mode === 'signup' ? 'Already have an account?' : ''}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => change(mode === 'signin' ? 'signup' : 'signin')}><Text style={{ color: colors.green, fontFamily: fonts.bold, fontSize: 14 }}>{mode === 'signin' ? 'Create your account' : 'Back to sign in'}</Text></Pressable></View>
      <View style={[ui.row, { justifyContent: 'center', paddingTop: 12 }]}><LockKeyhole size={13} color={colors.muted} /><Text style={[ui.muted, { fontSize: 12 }]}>Your photos and collections are visible only to you.</Text></View>
    </View>
  </View><Text style={[ui.muted, { fontSize: 11, textAlign: 'center', marginTop: 32 }]}>MADE FOR THE JOY OF COLLECTING</Text></View></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export function RecoveryScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save() { setError(''); if (password.length < 8) { setError('Use at least 8 characters.'); return; } setBusy(true); try { await auth.updatePassword(password); onDone(); } catch (e) { setError(messageOf(e)); } finally { setBusy(false); } }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', padding: 24 }}><View style={{ width: '100%', maxWidth: 400, gap: 24 }}><Brand /><Text style={ui.title}>A fresh start.</Text><Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" /><ErrorMessage message={error} /><Button title="Save new password" onPress={save} loading={busy} /><Button title="Cancel and sign out" secondary disabled={busy} onPress={() => { void auth.signOut().catch(e => setError(messageOf(e))); }} /></View></SafeAreaView>;
}
