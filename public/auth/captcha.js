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
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  };

  if (!isValidSiteKey(siteKey) || !isValidNonce(nonce)) {
    post('error');
    return;
  }

  let rendered = false;
  let expired = false;
  const expire = () => {
    if (expired) return;
    expired = true;
    post('expired');
  };
  const render = () => {
    if (rendered || !window.turnstile || typeof window.turnstile.render !== 'function') return;
    rendered = true;
    try {
      window.turnstile.render('#challenge', {
        sitekey: siteKey,
        theme,
        size: 'flexible',
        callback: token => {
          if (expired) return;
          if (isToken(token)) post('token', token);
          else post('error');
        },
        'error-callback': () => { expired = true; post('error'); },
        'expired-callback': expire,
      });
      post('ready');
    } catch {
      post('error');
    }
  };

  if (window.turnstile) {
    render();
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.addEventListener('load', render, { once: true });
  script.addEventListener('error', () => post('error'), { once: true });
  document.head.appendChild(script);
})();
