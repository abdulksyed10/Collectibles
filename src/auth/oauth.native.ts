import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { requireClient } from '../lib/supabase';
import { beginOAuthFlow, handleAuthCallback } from './oauthFlow';
import type { OAuthProvider } from './oauthCore';
import { registerAppleGrant } from './providerGrant';

WebBrowser.maybeCompleteAuthSession();
export { handleAuthCallback };

function appleName(credential: AppleAuthentication.AppleAuthenticationCredential) {
  const name = credential.fullName;
  if (!name) return null;
  const fullName = [name.givenName, name.middleName, name.familyName].filter((part): part is string => Boolean(part)).join(' ').trim();
  return fullName ? { full_name: fullName, given_name: name.givenName, family_name: name.familyName } : null;
}

async function signInWithNativeApple(): Promise<'completed' | 'cancelled'> {
  if (!await AppleAuthentication.isAvailableAsync()) throw new Error('Sign in with Apple is not available on this device.');
  const nonce = Crypto.randomUUID();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      nonce: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce),
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw error;
  }
  if (!credential.identityToken) throw new Error('Apple did not return an identity token. Please try again.');
  const { error } = await requireClient().auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
  if (error) throw error;
  try {
    if(!credential.authorizationCode) throw new Error('Apple authorization was incomplete. Please try again.');
    const clientId = process.env.EXPO_PUBLIC_APPLE_NATIVE_CLIENT_ID?.trim();
    if(!clientId) throw new Error('Apple sign-in is not available yet.');
    await registerAppleGrant({code:credential.authorizationCode,clientId});
  } catch(error) { await requireClient().auth.signOut({scope:'local'}); throw error; }
  const name = appleName(credential);
  if (name) await requireClient().auth.updateUser({ data: name });
  return 'completed';
}

export async function signInWithProvider(provider: OAuthProvider): Promise<'completed' | 'redirected' | 'cancelled'> {
  if (provider === 'apple' && Platform.OS === 'ios') return signInWithNativeApple();
  const redirectTo = AuthSession.makeRedirectUri({ scheme: 'collectibles', path: 'auth/callback' });
  const url = await beginOAuthFlow(provider, redirectTo);
  const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
  if (result.type !== 'success') return 'cancelled';
  const handled = await handleAuthCallback(result.url);
  if (handled !== 'handled') throw new Error('The sign-in callback could not be verified. Please try again.');
  return 'completed';
}
