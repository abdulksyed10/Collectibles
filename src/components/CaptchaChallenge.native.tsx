import React, { useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, ui } from './ui';

function validToken(token: unknown): token is string { return typeof token === 'string' && token.length >= 20 && token.length <= 4096; }

export function CaptchaChallenge({ siteKey, onToken, onError }: { siteKey: string; onToken: (token: string) => void; onError: () => void }) {
  const nonce = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`).current;
  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:transparent}</style></head><body><div id="challenge"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script><script>window.onload=function(){turnstile.render('#challenge',{sitekey:${JSON.stringify(siteKey)},callback:function(token){window.ReactNativeWebView.postMessage(JSON.stringify({type:'token',nonce:${JSON.stringify(nonce)},token:token}))},'error-callback':function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',nonce:${JSON.stringify(nonce)}))},'expired-callback':function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',nonce:${JSON.stringify(nonce)}))}})}</script></body></html>`, [nonce, siteKey]);
  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type?: unknown; nonce?: unknown; token?: unknown };
      if (data.nonce !== nonce) return;
      if (data.type === 'token' && validToken(data.token)) onToken(data.token);
      else if (data.type === 'error') onError();
    } catch { onError(); }
  }
  return <View style={{ gap: 6 }}><Text style={[ui.muted, { fontSize: 12 }]}>Security check</Text><WebView source={{ html }} originWhitelist={['about:blank', 'https://challenges.cloudflare.com/*']} javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} onMessage={handleMessage} onError={onError} onShouldStartLoadWithRequest={request => {
    try { const url = new URL(request.url); return url.protocol === 'about:' || (url.protocol === 'https:' && url.hostname === 'challenges.cloudflare.com'); }
    catch { return false; }
  }} style={{ height: 72, backgroundColor: colors.card }} /></View>;
}
