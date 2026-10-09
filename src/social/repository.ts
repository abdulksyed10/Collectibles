import { requireClient } from '../lib/supabase';
import { socialProfileErrorMessage } from './messages';
import type { CollectorProfile, CursorPage, LikeState, OwnSocialProfile, PeopleList, Relationship, SharedEntry, SocialCapabilities, SocialRepository, VisibleCollection } from './types';

export const disabledSocialCapabilities: SocialCapabilities = {
  profilesEnabled: false,
  socialWritesEnabled: false,
  friendsSharingEnabled: false,
  likesEnabled: false,
};

function unavailable(): never { throw new Error('This social feature is not available yet.'); }

function readCapabilities(value: unknown): SocialCapabilities {
  if (!value || typeof value !== 'object') return disabledSocialCapabilities;
  const data = value as Record<string, unknown>;
  return {
    profilesEnabled: data.profilesEnabled === true,
    socialWritesEnabled: data.socialWritesEnabled === true,
    friendsSharingEnabled: data.friendsSharingEnabled === true,
    likesEnabled: data.likesEnabled === true,
  };
}

function readProfile(value: unknown): OwnSocialProfile {
  if (!value || typeof value !== 'object') throw new Error('Unable to load your profile. Try again.');
  const data = value as Record<string, unknown>;
  if (typeof data.publisherId !== 'string' || typeof data.username !== 'string' || (data.introCompletedAt !== null && typeof data.introCompletedAt !== 'string')) throw new Error('Unable to load your profile. Try again.');
  return { publisherId: data.publisherId, username: data.username, introCompletedAt: data.introCompletedAt as string | null };
}

async function profileRpc(name: 'ensure_social_profile' | 'complete_profile_intro' | 'update_username', args: Record<string, unknown> = {}) {
  const { data, error } = await requireClient().rpc(name, args);
  if (error) throw new Error(socialProfileErrorMessage(error));
  return readProfile(data);
}

export const socialRepository: SocialRepository = {
  async getSocialCapabilities() {
    const { data, error } = await requireClient().rpc('get_social_capabilities');
    return error ? disabledSocialCapabilities : readCapabilities(data);
  },
  async ensureSocialProfile() { return profileRpc('ensure_social_profile'); },
  async completeProfileIntro(username) { return profileRpc('complete_profile_intro', { p_username: username }); },
  async updateUsername(username) { return profileRpc('update_username', { p_username: username }); },
  async getCollector(_publisherId): Promise<CollectorProfile | null> { return unavailable(); },
  async searchCollectors(_query, _cursor): Promise<CursorPage<CollectorProfile>> { return unavailable(); },
  async listPeople(_kind: PeopleList, _cursor): Promise<CursorPage<CollectorProfile>> { return unavailable(); },
  async setFollowing(_publisherId, _following): Promise<Relationship> { return unavailable(); },
  async removeFollower(_publisherId): Promise<Relationship> { return unavailable(); },
  async blockCollector(_publisherId): Promise<void> { return unavailable(); },
  async listFollowingEntries(_cursor, _friendsOnly): Promise<CursorPage<SharedEntry>> { return unavailable(); },
  async listCollectorEntries(_publisherId, _cursor): Promise<CursorPage<SharedEntry>> { return unavailable(); },
  async readVisibleCollection(_collectionId, _cursor): Promise<VisibleCollection | null> { return unavailable(); },
  async readSharedEntry(_itemId): Promise<SharedEntry | null> { return unavailable(); },
  async setItemLiked(_itemId, _liked): Promise<void> { return unavailable(); },
  async getEntrySocialState(_itemIds): Promise<Record<string, LikeState>> { return unavailable(); },
};