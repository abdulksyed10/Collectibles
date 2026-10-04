import type { OAuthProvider } from './oauthCore';

export declare function signInWithProvider(provider: OAuthProvider): Promise<'completed' | 'redirected' | 'cancelled'>;
export declare function handleAuthCallback(url: string): Promise<'handled' | 'ignored'>;
