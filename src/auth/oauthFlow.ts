import * as Crypto from 'expo-crypto';
import { authStorage, requireClient } from '../lib/supabase';
import { parseOAuthCallback, type OAuthProvider } from './oauthCore';
import { registerAppleGrant } from './providerGrant';

const contextKey = 'collectibles.oauth.flow.v1';
const maxFlowAgeMs = 15 * 60_000;
const exchanges = new Map<string, Promise<void>>();
type OAuthContext = { provider: OAuthProvider; redirectTo: string; createdAt: number; nonce: string };

function configuredWebUrl() {
  if (process.env.EXPO_PUBLIC_WEB_URL?.trim()) return process.env.EXPO_PUBLIC_WEB_URL.trim();
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

function route(value: string) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}${url.pathname}`;
}

async function readContext(): Promise<OAuthContext | null> {
  const raw = await authStorage.getItem(contextKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OAuthContext>;
    if ((value.provider !== 'google' && value.provider !== 'apple') || typeof value.redirectTo !== 'string' || typeof value.nonce !== 'string' || typeof value.createdAt !== 'number') return null;
    if (value.createdAt + maxFlowAgeMs < Date.now()) return null;
    return value as OAuthContext;
  } catch { return null; }
}

export async function beginOAuthFlow(provider: OAuthProvider, redirectTo: string) {
  const nonce = Array.from(await Crypto.getRandomBytesAsync(18), byte => byte.toString(16).padStart(2, '0')).join('');
  await authStorage.setItem(contextKey, JSON.stringify({ provider, redirectTo, createdAt: Date.now(), nonce } satisfies OAuthContext));
  const { data, error } = await requireClient().auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) {
    await authStorage.removeItem(contextKey);
    throw error ?? new Error('Social sign-in could not start. Please try again.');
  }
  return data.url;
}

/** Exchanges a PKCE code once after an approved callback route and matching local flow context. */
export async function handleAuthCallback(value: string): Promise<'handled' | 'ignored'> {
  const callback = parseOAuthCallback(value, configuredWebUrl());
  if (!callback) return 'ignored';
  const context = await readContext();
  if (!context) return 'ignored';
  if (route(context.redirectTo) !== route(value)) return 'ignored';
  if (callback.kind === 'error') {
    await authStorage.removeItem(contextKey);
    throw new Error(callback.message);
  }
  let exchange = exchanges.get(callback.code);
  if (!exchange) {
    exchange = (async () => {
      try {
        const { data, error } = await requireClient().auth.exchangeCodeForSession(callback.code);
        if (error) throw error;
        if(context.provider==='apple') {
          try {
            const clientId=process.env.EXPO_PUBLIC_APPLE_SERVICE_ID?.trim();
            if(!clientId || !data.session?.provider_refresh_token) throw new Error('Apple browser sign-in is not available yet. Use another sign-in option.');
            await registerAppleGrant({clientId,refreshToken:data.session.provider_refresh_token});
          } catch(error) { await requireClient().auth.signOut({scope:'local'}); throw error; }
        }
      } finally {
        await authStorage.removeItem(contextKey);
      }
    })();
    exchanges.set(callback.code, exchange);
  }
  await exchange;
  return 'handled';
}
