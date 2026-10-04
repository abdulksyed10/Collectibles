import { beginOAuthFlow, handleAuthCallback } from './oauthFlow';
import { webOAuthCallbackUrl, type OAuthProvider } from './oauthCore';

export { handleAuthCallback };
export async function signInWithProvider(provider: OAuthProvider): Promise<'completed' | 'redirected' | 'cancelled'> {
  const configured = process.env.EXPO_PUBLIC_WEB_URL?.trim() || window.location.origin;
  const url = await beginOAuthFlow(provider, webOAuthCallbackUrl(configured));
  window.location.assign(url);
  return 'redirected';
}
