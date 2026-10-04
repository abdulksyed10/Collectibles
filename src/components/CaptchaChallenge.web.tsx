import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, colors, ui } from './ui';

type TurnstileApi = {
  render: (container: string, options: { sitekey: string; callback: (token: string) => void; 'error-callback': () => void; 'expired-callback': () => void }) => string;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi; }
}

function validToken(token: unknown): token is string { return typeof token === 'string' && token.length >= 20 && token.length <= 4096; }

export function CaptchaChallenge({ siteKey, onToken, onError }: { siteKey: string; onToken: (token: string) => void; onError: () => void }) {
  const id = useRef(`turnstile-${Math.random().toString(36).slice(2)}`).current;
  const callbacks = useRef({ onToken, onError });
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const accepted = useRef(false);
  useEffect(() => { callbacks.current = { onToken, onError }; }, [onError, onToken]);
  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let script: HTMLScriptElement | null = null;
    let rendered = false;
    const fail = () => {
      if (!active) return;
      if (widgetId) {
        window.turnstile?.remove?.(widgetId);
        widgetId = undefined;
      }
      setLoadError(true);
      callbacks.current.onError();
    };
    const render = () => {
      if (!active || rendered || !window.turnstile) return;
      rendered = true;
      try {
        widgetId = window.turnstile.render(`#${id}`, {
          sitekey: siteKey,
          callback: token => {
            if (!active) return;
            if (!validToken(token)) { fail(); return; }
            if (accepted.current) return;
            accepted.current = true;
            callbacks.current.onToken(token);
          },
          'error-callback': fail,
          'expired-callback': () => { accepted.current = false; fail(); },
        });
        if (timeout) clearTimeout(timeout);
      } catch { fail(); }
    };
    accepted.current = false;
    setLoadError(false);
    if (window.turnstile) render();
    else {
      script = document.getElementById('collectibles-turnstile') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = 'collectibles-turnstile';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
      }
      script.addEventListener('load', render);
      script.addEventListener('error', fail);
      if (!script.parentNode) document.head.appendChild(script);
      timeout = setTimeout(fail, 12_000);
    }
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', fail);
      if (widgetId) window.turnstile?.remove?.(widgetId);
    };
  }, [attempt, id, siteKey]);
  return <View style={{ minHeight: 80, gap: 6 }}><Text style={[ui.muted, { fontSize: 12 }]}>Security check</Text>{loadError ? <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={[ui.muted, { fontSize: 12 }]}>The security check could not load. Try again.</Text><Button title="Retry security check" secondary onPress={() => setAttempt(value => value + 1)} /></View> : <View nativeID={id} style={{ minHeight: 65, alignItems: 'flex-start', justifyContent: 'center', backgroundColor: colors.card }} />}</View>;
}
