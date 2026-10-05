import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, colors, ui } from './ui';

type TurnstileApi = {
  render: (container: string, options: Record<string, unknown>) => string;
  execute?: (widgetId: string) => void;
  reset?: (widgetId: string) => void;
  remove?: (widgetId: string) => void;
};

declare global { interface Window { turnstile?: TurnstileApi; } }

function validToken(token: unknown): token is string { return typeof token === 'string' && token.length >= 20 && token.length <= 4096; }

/** Renders an idle, interaction-only Turnstile widget. A parent must explicitly change executionId to run it. */
export function CaptchaChallenge({ siteKey, executionId, resetId, onToken, onError }: { siteKey: string; executionId: number; resetId: number; onToken: (token: string) => void; onError: () => void }) {
  const id = useRef(`turnstile-${Math.random().toString(36).slice(2)}`).current;
  const callbacks = useRef({ onToken, onError });
  const widget = useRef<string | undefined>(undefined);
  const rendered = useRef(false);
  const lastExecution = useRef(executionId);
  const requestedExecution = useRef(executionId);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [executing, setExecuting] = useState(false);
  const accepted = useRef(false);
  useEffect(() => { callbacks.current = { onToken, onError }; }, [onError, onToken]);

  function executeRequested() {
    if (requestedExecution.current === lastExecution.current || !widget.current || !window.turnstile?.execute) return;
    lastExecution.current = requestedExecution.current;
    accepted.current = false;
    setExecuting(true);
    try { window.turnstile.execute(widget.current); } catch { setExecuting(false); setLoadError(true); callbacks.current.onError(); }
  }

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let script: HTMLScriptElement | null = null;
    const fail = () => { if (active) { setExecuting(false); setLoadError(true); callbacks.current.onError(); } };
    const run = () => {
      if (!active || rendered.current || !window.turnstile) return;
      rendered.current = true;
      try {
        widget.current = window.turnstile.render(`#${id}`, {
          sitekey: siteKey,
          execution: 'execute',
          appearance: 'interaction-only',
          retry: 'never',
          'refresh-expired': 'manual',
          'refresh-timeout': 'manual',
          callback: (token: string) => {
            if (!active || !validToken(token) || accepted.current) { if (!validToken(token)) fail(); return; }
            accepted.current = true;
            setExecuting(false);
            callbacks.current.onToken(token);
          },
          'error-callback': fail,
          'expired-callback': fail,
          'timeout-callback': fail,
        });
        executeRequested();
        if (timeout) clearTimeout(timeout);
      } catch { fail(); }
    };
    accepted.current = false; rendered.current = false; widget.current = undefined; setLoadError(false); setExecuting(false);
    if (window.turnstile) run();
    else {
      script = document.getElementById('collectibles-turnstile') as HTMLScriptElement | null;
      if (!script) { script = document.createElement('script'); script.id = 'collectibles-turnstile'; script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; }
      script.addEventListener('load', run); script.addEventListener('error', fail);
      if (!script.parentNode) document.head.appendChild(script);
      timeout = setTimeout(fail, 12000);
    }
    return () => { active = false; if (timeout) clearTimeout(timeout); script?.removeEventListener('load', run); script?.removeEventListener('error', fail); if (widget.current) window.turnstile?.remove?.(widget.current); };
  }, [attempt, id, siteKey]);

  useEffect(() => {
    if (executionId === lastExecution.current) return;
    requestedExecution.current = executionId;
    executeRequested();
  }, [executionId]);

  useEffect(() => {
    if (!widget.current || !window.turnstile?.reset) return;
    accepted.current = false; setExecuting(false);
    try { window.turnstile.reset(widget.current); } catch { /* The next explicit execution can still retry. */ }
  }, [resetId]);

  return <View style={{ minHeight: 44, gap: 6 }}><Text style={[ui.muted, { fontSize: 12 }]}>Security check</Text>{loadError ? <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={[ui.muted, { fontSize: 12 }]}>The security check could not load. Try again.</Text><Button title="Retry security check" secondary onPress={() => setAttempt(value => value + 1)} /></View> : <View nativeID={id} style={{ minHeight: executing ? 65 : 1, alignItems: 'flex-start', justifyContent: 'center', backgroundColor: colors.card }} />}</View>;
}
