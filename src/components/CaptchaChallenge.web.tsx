import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { colors, ui } from './ui';

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
  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;
    const render = () => {
      if (!active || !window.turnstile) return;
      try {
        widgetId = window.turnstile.render(`#${id}`, {
          sitekey: siteKey,
          callback: token => { if (active && validToken(token)) onToken(token); else if (active) onError(); },
          'error-callback': () => { if (active) onError(); },
          'expired-callback': () => { if (active) onError(); },
        });
      } catch { if (active) onError(); }
    };
    if (window.turnstile) render();
    else {
      let script = document.getElementById('collectibles-turnstile') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = 'collectibles-turnstile';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', render, { once: true });
    }
    return () => { active = false; if (widgetId) window.turnstile?.remove?.(widgetId); };
  }, [id, onError, onToken, siteKey]);
  return <View style={{ minHeight: 80, gap: 6 }}><Text style={[ui.muted, { fontSize: 12 }]}>Security check</Text><View nativeID={id} style={{ minHeight: 65, alignItems: 'flex-start', justifyContent: 'center', backgroundColor: colors.card }} /></View>;
}
