import { AppState, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, requireClient } from '../lib/supabase';
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let authEventSeen = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      authEventSeen = true;
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      setSession(next); setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => { if (mounted && !authEventSeen) { setSession(data.session); setLoading(false); } }).catch(() => { if (mounted) setLoading(false); });
    const state = AppState.addEventListener('change', value => {
      if (value === 'active') supabase?.auth.startAutoRefresh(); else supabase?.auth.stopAutoRefresh();
    });
    if (Platform.OS !== 'web') supabase.auth.startAutoRefresh();
    return () => { mounted = false; subscription.unsubscribe(); state.remove(); supabase?.auth.stopAutoRefresh(); };
  }, []);
  return { session, loading, recovery, finishRecovery: () => setRecovery(false) };
}
export const auth = {
  async signIn(email: string, password: string) { const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; },
  async signUp(email: string, password: string) { const { data, error } = await requireClient().auth.signUp({ email: email.trim(), password }); if (error) throw error; return Boolean(data.session); },
  async sendReset(email: string) { const { error } = await requireClient().auth.resetPasswordForEmail(email.trim()); if (error) throw error; },
  async verifyReset(email: string, token: string) { const { error } = await requireClient().auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'recovery' }); if (error) throw error; },
  async updatePassword(password: string) { const { error } = await requireClient().auth.updateUser({ password }); if (error) throw error; },
  async signOut() { const { error } = await requireClient().auth.signOut({ scope: 'local' }); if (error) throw error; },
};
