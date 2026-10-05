import { PolicyLinks } from '../components/PolicyLinks';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { ArrowRight, Check, LockKeyhole, Layers3, Eye, EyeOff, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../auth/session';
import { serviceReady } from '../lib/supabase';
import { Brand, Button, colors, ErrorMessage, Field, fonts, messageOf, ui } from '../components/ui';
import { CollectionArtwork } from '../components/CollectionArtwork';
import { validatePassword } from '../domain/validation';
import { CaptchaChallenge } from '../components/CaptchaChallenge';
import { SocialSignInButtons } from '../components/SocialSignInButtons';
import { authOperationForMode, mapAuthError, recordCredentialFailure, secondsUntil, type AuthOperation } from '../auth/security';
export function AuthScreen({ onDemo, onExplore, callbackError }: { onDemo: () => void; onExplore: () => void; callbackError?: string }) {
  const wide = useWindowDimensions().width >= 860;
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'verify'>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [, setCaptchaToken] = useState<string | null>(null);
  const [captchaExecutionId, setCaptchaExecutionId] = useState(0);
  const [captchaResetId, setCaptchaResetId] = useState(0);
  const [captchaChecking, setCaptchaChecking] = useState(false);
  const captchaAction = useRef<'submit' | 'resend' | null>(null);
  const submitRef = useRef<((verifiedToken?: string) => Promise<void>) | undefined>(undefined);
  const resendRef = useRef<((verifiedToken?: string) => Promise<void>) | undefined>(undefined);
  const [credentialFailures, setCredentialFailures] = useState<number[]>([]);
  const [cooldowns, setCooldowns] = useState<Partial<Record<AuthOperation, number>>>({});
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const captchaSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';
  const captchaApplies = Boolean(captchaSiteKey) && mode !== 'verify';
  const operation = authOperationForMode(mode);
  const cooldownSeconds = secondsUntil(cooldowns[operation] ?? null, now);
  const operationPaused = cooldownSeconds > 0;
  const handleCaptchaToken = useCallback((token: string) => {
    const action = captchaAction.current;
    captchaAction.current = null;
    setCaptchaToken(token); setCaptchaChecking(false); setError('');
    if (action === 'submit') void submitRef.current?.(token);
    if (action === 'resend') void resendRef.current?.(token);
  }, []);
  const handleCaptchaError = useCallback(() => { captchaAction.current = null; setCaptchaToken(null); setCaptchaChecking(false); }, []);
  useEffect(() => { if (callbackError) setError(callbackError); }, [callbackError]);
  useEffect(() => {
    if (!Object.values(cooldowns).some(value => value && value > Date.now())) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [cooldowns]);
  useEffect(() => {
    setCooldowns(current => {
      const active = Object.fromEntries(Object.entries(current).filter(([, value]) => value && value > now)) as Partial<Record<AuthOperation, number>>;
      return Object.keys(active).length === Object.keys(current).length ? current : active;
    });
  }, [now]);
  function resetCaptcha() { captchaAction.current = null; setCaptchaToken(null); setCaptchaChecking(false); setCaptchaResetId(value => value + 1); }
  function requestCaptcha(action: 'submit' | 'resend') { captchaAction.current = action; setCaptchaToken(null); setCaptchaChecking(true); setCaptchaExecutionId(value => value + 1); }
  function setCooldown(operationName: AuthOperation, retryAt: number | null | undefined) {
    if (!retryAt) return;
    setCooldowns(current => ({ ...current, [operationName]: retryAt }));
    setNow(Date.now());
  }
  function change(next: typeof mode) { setMode(next); setError(''); setNotice(''); setPassword(''); setCanResendConfirmation(false); resetCaptcha(); }
  async function submit(verifiedToken?: string) {
    if (!serviceReady || busy) return;
    const submittedAt = Date.now();
    if (secondsUntil(cooldowns[operation] ?? null, submittedAt) > 0) { setError(`Wait ${secondsUntil(cooldowns[operation] ?? null, submittedAt)} seconds before trying again.`); return; }
    setError(''); setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (mode === 'signin' && !password) { setError('Enter your password.'); return; }
    if (mode === 'signup') { try { validatePassword(password); } catch (reason) { setError(messageOf(reason)); return; } }
    if (captchaApplies && !verifiedToken) { requestCaptcha('submit'); return; }
    setBusy(true);
    const token = verifiedToken;
    if (captchaApplies) setCaptchaToken(null);
    try {
      if (mode === 'signin') { await auth.signIn(email, password, token); setCredentialFailures([]); setCooldowns(current => ({ ...current, signin: undefined })); }
      if (mode === 'signup') { const signedIn = await auth.signUp(email, password, token); if (!signedIn) { change('signin'); setCanResendConfirmation(true); setNotice('Check your email to confirm your account, then sign in here.'); } }
      if (mode === 'reset') { await auth.sendReset(email, token); setMode('verify'); setNotice('If this email has an account, a recovery email is on its way. Enter its code below.'); }
      if (mode === 'verify') await auth.verifyReset(email, code);
    } catch (e) {
      const issue = mapAuthError(e, submittedAt);
      if (mode === 'signin' && issue.kind === 'credentials') {
        const outcome = recordCredentialFailure(credentialFailures, submittedAt);
        setCredentialFailures(outcome.failures);
        if (outcome.retryAt) { setCooldown('signin', outcome.retryAt); setError('Too many incorrect attempts. Wait one hour before trying again.'); }
        else setError(issue.message);
      } else {
        setCooldown(operation, issue.retryAt);
        setError(issue.message);
      }
    } finally { if (captchaApplies) resetCaptcha(); setBusy(false); }
  }
  async function resendConfirmation(verifiedToken?: string) {
    if (!serviceReady || busy) return;
    const submittedAt = Date.now();
    if (secondsUntil(cooldowns.resend ?? null, submittedAt) > 0) { setError(`Wait ${secondsUntil(cooldowns.resend ?? null, submittedAt)} seconds before trying again.`); return; }
    setError(''); setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter the email address you used to sign up.'); return; }
    if (captchaApplies && !verifiedToken) { requestCaptcha('resend'); return; }
    setBusy(true);
    const token = verifiedToken;
    if (captchaApplies) setCaptchaToken(null);
    try { await auth.resendConfirmation(email, token); setNotice('If this email has an unconfirmed account, a new confirmation email is on its way.'); }
    catch (reason) {
      const issue = mapAuthError(reason, submittedAt);
      setCooldown('resend', issue.retryAt);
      setError(issue.message);
    } finally { if (captchaApplies) resetCaptcha(); setBusy(false); }
  }
  submitRef.current = submit;
  resendRef.current = resendConfirmation;
  const heading = mode === 'signup' ? 'A home for your finds.' : mode === 'reset' ? 'Let’s get you back in.' : mode === 'verify' ? 'Check your inbox.' : 'Welcome to your collection.';
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: wide ? 36 : 24 }}><View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', flex: 1 }}><View style={[ui.row, { justifyContent: 'space-between', marginBottom: wide ? 40 : 30 }]}><Brand /><View style={[ui.row, { gap: 6 }]}><LockKeyhole size={14} color={colors.muted} /><Text style={[ui.muted, { fontSize: 12 }]}>Your own little world</Text></View></View><View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 80 : 28 }}>
    <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', padding: wide ? 36 : 0, backgroundColor: wide ? '#EEF0E7' : undefined, borderRadius: 32, alignItems: wide ? 'flex-start' : 'center', alignSelf: wide ? 'stretch' : undefined, justifyContent: 'center', minHeight: wide ? 580 : undefined }}>
      {wide ? <Text style={{ color: colors.coral, fontFamily: fonts.bold, letterSpacing: 2, fontSize: 11, marginBottom: 22 }}>SMALL THINGS. GOOD STORIES.</Text> : null}
      <Text style={[ui.title, { fontSize: wide ? 64 : 38, lineHeight: wide ? 68 : 42, textAlign: wide ? 'left' : 'center' }]}>Every find has{wide ? '\n' : ' '}a story.</Text>
      <Text style={[ui.muted, { fontSize: 16, lineHeight: 26, maxWidth: 320, marginTop: 18, textAlign: wide ? 'left' : 'center' }]}>Keep your favorite finds together, beautifully organized and entirely yours.</Text>
      {wide ? <View style={{ marginVertical: 24, alignSelf: 'center' }}><CollectionArtwork /></View> : null}
      {wide ? <View style={{ gap: 14 }}><View style={ui.row}><Layers3 size={17} color={colors.green} /><Text style={ui.text}>A place for every collection</Text></View><View style={ui.row}><LockKeyhole size={17} color={colors.green} /><Text style={ui.text}>Private, by default. Always yours.</Text></View></View> : null}
    </View>
    <View style={{ width: '100%', maxWidth: 400, paddingVertical: 20, gap: 23 }}>
      <View style={{ gap: 10 }}><Text style={[ui.title, { fontSize: 37, lineHeight: 41 }]}>{heading}</Text><Text style={ui.muted}>{mode === 'signin' ? 'Sign in to pick up where you left off.' : mode === 'signup' ? 'Start saving the things you love.' : 'Recover access to your private collection.'}</Text></View>
      {!serviceReady ? <View style={{ backgroundColor: colors.sand, padding: 15, borderRadius: 12 }}><Text style={[ui.text, { fontFamily: fonts.medium, fontSize: 13 }]}>Take a look around.</Text><Text style={[ui.muted, { fontSize: 12 }]}>Try a sample collection while account sign-in is being set up.</Text></View> : null}
      <View style={{ gap: 8 }}><Button title="Explore shared items" secondary={serviceReady} onPress={onExplore} disabled={busy} icon={Layers3} /><Button title="Try the demo" secondary onPress={onDemo} disabled={busy} icon={Layers3} /><Text style={[ui.muted, { fontSize: 12, textAlign: 'center' }]}>No account needed. Demo changes reset when you leave.</Text></View>
      <View style={{ gap: 18 }}><Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} />
      {mode === 'signin' || mode === 'signup' ? <View><Field label="Password" value={password} onChangeText={setPassword} placeholder={mode === 'signup' ? '8+ characters, upper, lower, number' : 'Your password'} secureTextEntry={!visible} autoCapitalize="none" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} editable={!busy} onSubmitEditing={() => { void submit(); }} style={{ paddingRight: 52 }} /><Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} style={{ position: 'absolute', right: 14, bottom: 14 }}>{visible ? <EyeOff size={21} color={colors.muted} /> : <Eye size={21} color={colors.muted} />}</Pressable></View> : null}
      {mode === 'verify' ? <Field label="Recovery code" value={code} onChangeText={setCode} placeholder="Code from your email" keyboardType="number-pad" autoComplete="one-time-code" editable={!busy} /> : null}
      {mode === 'signin' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => change('reset')} style={{ alignSelf: 'flex-end' }}><Text style={{ color: colors.green, fontFamily: fonts.medium, fontSize: 13 }}>Forgot password?</Text></Pressable> : null}
      {mode === 'signin' ? <SocialSignInButtons disabled={!serviceReady || busy} onError={setError} /> : null}
      {captchaApplies ? <CaptchaChallenge siteKey={captchaSiteKey} executionId={captchaExecutionId} resetId={captchaResetId} onToken={handleCaptchaToken} onError={handleCaptchaError} /> : null}
      {operationPaused ? <Text accessibilityRole="alert" style={[ui.muted, { fontSize: 13 }]}>Wait {cooldownSeconds} seconds before trying again.</Text> : null}
      <ErrorMessage message={error} />{notice ? <Text accessibilityRole="alert" style={[ui.text, { color: colors.green, fontSize: 14 }]}>{notice}</Text> : null}
      <Button title={mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send recovery email' : 'Verify code'} onPress={submit} loading={busy || captchaChecking} disabled={!serviceReady || operationPaused || captchaChecking} icon={ArrowRight} />
      {mode === 'signin' && canResendConfirmation ? <Button title="Resend confirmation email" secondary onPress={() => { void resendConfirmation(); }} loading={busy || captchaChecking} disabled={!serviceReady || Boolean(cooldowns.resend && cooldowns.resend > now) || captchaChecking} /> : null}
      </View>
      <View style={[ui.row, { justifyContent: 'center', flexWrap: 'wrap', gap: 5 }]}><Text style={ui.muted}>{mode === 'signin' ? 'New to Collectibles?' : mode === 'signup' ? 'Already have an account?' : ''}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => change(mode === 'signin' ? 'signup' : 'signin')}><Text style={{ color: colors.green, fontFamily: fonts.bold, fontSize: 14 }}>{mode === 'signin' ? 'Create your account' : 'Back to sign in'}</Text></Pressable></View>
      <View style={[ui.row, { justifyContent: 'center', paddingTop: 12 }]}><LockKeyhole size={13} color={colors.muted} /><Text style={[ui.muted, { fontSize: 12 }]}>Entries stay private until you make them public.</Text></View>
    </View>
  </View><Text style={[ui.muted, { fontSize: 11, textAlign: 'center', marginTop: 32 }]}>MADE FOR THE JOY OF COLLECTING</Text></View><PolicyLinks /></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export function RecoveryScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save() { setError(''); try { validatePassword(password); } catch (reason) { setError(messageOf(reason)); return; } setBusy(true); try { await auth.updatePassword(password); onDone(); } catch (e) { setError(messageOf(e)); } finally { setBusy(false); } }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', padding: 24 }}><View style={{ width: '100%', maxWidth: 400, gap: 24 }}><Brand /><Text style={ui.title}>A fresh start.</Text><Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" /><ErrorMessage message={error} /><Button title="Save new password" onPress={save} loading={busy} /><Button title="Cancel and sign out" secondary disabled={busy} onPress={() => { void auth.signOut().catch(e => setError(messageOf(e))); }} /></View></SafeAreaView>;
}
