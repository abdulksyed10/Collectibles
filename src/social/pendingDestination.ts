import type { SocialDestination } from './links';

let pendingDestination: SocialDestination | null = null;

export function setPendingSocialDestination(destination: SocialDestination) { pendingDestination = { ...destination }; }
export function consumePendingSocialDestination() {
  const destination = pendingDestination;
  pendingDestination = null;
  return destination;
}
export function clearPendingSocialDestination() { pendingDestination = null; }