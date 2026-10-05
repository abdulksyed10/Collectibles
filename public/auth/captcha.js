(() => {
  'use strict';
  const query = new URLSearchParams(window.location.search);
  const siteKey = query.get('siteKey') || '';
  const nonce = query.get('nonce') || '';
  const requestedTheme = query.get('theme') || 'auto';
  const theme = ['light', 'dark', 'auto'].includes(requestedTheme) ? requestedTheme : 'auto';
  const isToken = value => typeof value === 'string' && value.length >= 20 && value.length <= 4096;
  const isValidSiteKey = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/\s/.test(value);
  const isValidNonce = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
  const post = (type, token) => {
    const message = token ? { type, nonce, token } : { type, nonce };
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') window.ReactNativeWebView.postMessage(JSON.stringify(message));
  };
  if (!isValidSiteKey(siteKey) || !isValidNonce(nonce)) { post('error'); return; }
  let widgetId = null;
  const fail = () => post('error');
  const render = () => {
    if (widgetId || !window.turnstile || typeof window.turnstile.render !== 'function') return;
    try {
      widgetId = window.turnstile.render('#challenge', {
        sitekey: siteKey, theme, size: 'flexible', execution: 'execute', appearance: 'interaction-only', retry: 'never',
        'refresh-expired': 'manual', 'refresh-timeout': 'manual',
        callback: token => isToken(token) ? post('token', token) : fail(),
        'error-callback': fail, 'expired-callback': fail, 'timeout-callback': fail,
      });
      post('ready');
    } catch { fail(); }
  };
  const command = event => {
    let value; try { value = JSON.parse(event.data); } catch { return; }
    if (!value || value.nonce !== nonce || !['execute', 'reset'].includes(value.type) || !widgetId || !window.turnstile) return;
    try {
      if (value.type === 'execute' && typeof window.turnstile.execute === 'function') window.turnstile.execute(widgetId);
      if (value.type === 'reset' && typeof window.turnstile.reset === 'function') window.turnstile.reset(widgetId);
    } catch { fail(); }
  };
  window.addEventListener('message', command);
  document.addEventListener('message', command);
  if (window.turnstile) { render(); return; }
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
  script.addEventListener('load', render, { once: true }); script.addEventListener('error', fail, { once: true }); document.head.appendChild(script);
})();