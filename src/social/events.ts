export type SocialInvalidationReason = 'session' | 'profile' | 'relationship' | 'visibility' | 'like';

type Listener = (reason: SocialInvalidationReason) => void;
const listeners = new Set<Listener>();

export function subscribeSocialInvalidation(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function invalidateSocial(reason: SocialInvalidationReason) {
  for (const listener of listeners) listener(reason);
}