import type { OwnSocialProfile, SocialCapabilities } from './types';

export type ProfileSetupState = 'disabled' | 'intro' | 'ready';

export function profileSetupState(capabilities: SocialCapabilities, profile: OwnSocialProfile | null): ProfileSetupState {
  if (!capabilities.profilesEnabled) return 'disabled';
  return profile?.introCompletedAt ? 'ready' : 'intro';
}