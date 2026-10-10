import { AppState, Platform } from 'react-native';
import { useEffect, useRef } from 'react';

/** Rechecks shared content when a viewer returns to the app and at a bounded
 * interval. The server remains the authority for every visibility decision. */
export function useRestrictedRevalidation(onRevalidate: () => void, enabled = true) {
  const callback = useRef(onRevalidate);
  callback.current = onRevalidate;

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { callback.current(); };
    const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(refresh, 30_000);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', refresh);
      return () => { appState.remove(); clearInterval(timer); window.removeEventListener('focus', refresh); };
    }
    return () => { appState.remove(); clearInterval(timer); };
  }, [enabled]);
}
