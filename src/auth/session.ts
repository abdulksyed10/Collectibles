import { AppState, Platform } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authStorage, supabase, requireClient } from '../lib/supabase';
import { isCurrentRecoveryMarker, recoveryLinkFromUrl, recoveryMarkerFromStorage, recoveryPageUrl } from './recovery';

const recoveryMarkerKey = 'collectibles.password-recovery.v1';

async function markRecovery(userId: string) {
  await authStorage.setItem(recoveryMarkerKey, JSON.stringify({ userId, startedAt: Date.now() }));
}

async function clearRecoveryMarker() {
  await authStorage.removeItem(recoveryMarkerKey);
}

function configuredRecoveryUrl() {
  const configured = process.env.EXPO_PUBLIC_WEB_URL?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!configured) return undefined;
  try { return recoveryPageUrl(configured); } catch { return undefined; }
}

function configuredWebUrl() {
  return process.env.EXPO_PUBLIC_WEB_URL?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let recoveryEventSeen = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        recoveryEventSeen = true;
        setRecovery(true);
        if (next?.user.id) void markRecovery(next.user.id);
      }
      if (event === 'SIGNED_OUT') {
        setRecovery(false);
        void clearRecoveryMarker();
      }
      setSession(next); setLoading(false);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      const marker = recoveryMarkerFromStorage(await authStorage.getItem(recoveryMarkerKey));
      const restoreRecovery = isCurrentRecoveryMarker(marker, data.session?.user.id);
      if (marker && !restoreRecovery) void clearRecoveryMarker();
      if (mounted && !recoveryEventSeen) {
        setRecovery(restoreRecovery);
        setSession(data.session); setLoading(false);
      }
    }).catch(() => { if (mounted) setLoading(false); });
    const state = AppState.addEventListener('change', value => {
      if (value === 'active') supabase?.auth.startAutoRefresh(); else supabase?.auth.stopAutoRefresh();
    });
    if (Platform.OS !== 'web') supabase.auth.startAutoRefresh();
    return () => { mounted = false; subscription.unsubscribe(); state.remove(); supabase?.auth.stopAutoRefresh(); };
  }, []);
  const beginPasswordRecovery = useCallback(async (url: string) => {
    const session = await auth.acceptResetLink(url);
    if (!session.user.id) throw new Error('This password reset link is invalid or expired. Request a new link.');
    await markRecovery(session.user.id);
    setSession(session);
    setRecovery(true);
    setLoading(false);
  }, []);
  return { session, loading, recovery, beginPasswordRecovery, finishRecovery: () => { setRecovery(false); void clearRecoveryMarker(); } };
}
export const auth = {
  async signIn(email: string, password: string, captchaToken?: string) { const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password, options: captchaToken ? { captchaToken } : undefined }); if (error) throw error; },
  async signUp(email: string, password: string, captchaToken?: string) { const { data, error } = await requireClient().auth.signUp({ email: email.trim(), password, options: captchaToken ? { captchaToken } : undefined }); if (error) throw error; return Boolean(data.session); },
  async resendConfirmation(email: string, captchaToken?: string) { const { error } = await requireClient().auth.resend({ type: 'signup', email: email.trim(), options: captchaToken ? { captchaToken } : undefined }); if (error) throw error; },
  async sendReset(email: string, captchaToken?: string) {
    const redirectTo = configuredRecoveryUrl();
    const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), {
      ...(captchaToken ? { captchaToken } : {}),
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (error) throw error;
  },
  async acceptResetLink(url: string) {
    const link = recoveryLinkFromUrl(url, configuredWebUrl());
    if (!link) throw new Error('This password reset link is invalid or expired. Request a new link.');
    const result = link.kind === 'code'
      ? await requireClient().auth.exchangeCodeForSession(link.code)
      : await requireClient().auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
    if (result.error) throw result.error;
    if (!result.data.session) throw new Error('This password reset link is invalid or expired. Request a new link.');
    return result.data.session;
  },
  async updatePassword(password: string) { const { error } = await requireClient().auth.updateUser({ password }); if (error) throw error; },
  async signOut() { const { error } = await requireClient().auth.signOut({ scope: 'local' }); if (error) throw error; },
};
