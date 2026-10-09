import { requireClient } from '../lib/supabase';
import { invalidateSocial } from './events';
import { socialProfileErrorMessage } from './messages';
import type { CollectorProfile, CursorPage, LikeState, OwnSocialProfile, PeopleList, Relationship, SharedEntry, SocialCapabilities, SocialRepository, VisibleCollection } from './types';

export const disabledSocialCapabilities: SocialCapabilities = {
  profilesEnabled: false,
  socialWritesEnabled: false,
  friendsSharingEnabled: false,
  likesEnabled: false,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(): never { throw new Error('This social feature is not available yet.'); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function socialActionMessage(error: { code?: unknown; message?: unknown }, fallback: string) {
  if (error.code === '42901') return 'You have reached a limit. Please try again later.';
  if (error.code === '42501') return typeof error.message === 'string' && /follow|block|sign in|available/i.test(error.message) ? error.message : 'This action is unavailable.';
  if (error.code === '22023') return typeof error.message === 'string' && error.message.length <= 120 ? error.message : fallback;
  return fallback;
}
function requireId(value: string, message = 'Collector unavailable.') {
  if (!UUID.test(value)) throw new Error(message);
  return value;
}
function readCapabilities(value: unknown): SocialCapabilities {
  if (!isRecord(value)) return disabledSocialCapabilities;
  return {
    profilesEnabled: value.profilesEnabled === true,
    socialWritesEnabled: value.socialWritesEnabled === true,
    friendsSharingEnabled: value.friendsSharingEnabled === true,
    likesEnabled: value.likesEnabled === true,
  };
}
function readRelationship(value: unknown): Relationship {
  if (!isRecord(value) || typeof value.isFollowing !== 'boolean' || typeof value.isFollower !== 'boolean' || typeof value.isFriend !== 'boolean' || typeof value.blockedByMe !== 'boolean' || typeof value.interactionAllowed !== 'boolean') throw new Error('Unable to load collector details. Try again.');
  return { isFollowing: value.isFollowing, isFollower: value.isFollower, isFriend: value.isFriend, blockedByMe: value.blockedByMe, interactionAllowed: value.interactionAllowed };
}
function readProfile(value: unknown): OwnSocialProfile {
  if (!isRecord(value) || typeof value.publisherId !== 'string' || !UUID.test(value.publisherId) || typeof value.username !== 'string' || (value.introCompletedAt !== null && typeof value.introCompletedAt !== 'string')) throw new Error('Unable to load your profile. Try again.');
  return { publisherId: value.publisherId, username: value.username, introCompletedAt: value.introCompletedAt as string | null };
}
function readCollector(value: unknown): CollectorProfile {
  if (!isRecord(value) || typeof value.publisherId !== 'string' || !UUID.test(value.publisherId) || (value.username !== null && typeof value.username !== 'string')) throw new Error('Unable to load collector details. Try again.');
  return { publisherId: value.publisherId, username: value.username as string | null, relationship: readRelationship(value.relationship) };
}
function readCursor(cursor?: string) {
  if (!cursor) return null;
  if (cursor.length > 300) throw new Error('Invalid page.');
  try {
    const value = JSON.parse(cursor);
    if (!isRecord(value)) throw new Error();
    return value;
  } catch { throw new Error('Invalid page.'); }
}
function readCollectorPage(value: unknown): CursorPage<CollectorProfile> {
  if (!isRecord(value) || !Array.isArray(value.items) || (value.nextCursor !== null && !isRecord(value.nextCursor))) throw new Error('Unable to load collectors. Try again.');
  return { items: value.items.map(readCollector), nextCursor: value.nextCursor ? JSON.stringify(value.nextCursor) : null };
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
  async getCollector(publisherId) {
    const { data, error } = await requireClient().rpc('get_collector', { p_publisher_id: requireId(publisherId) });
    if (error) throw new Error(socialActionMessage(error, 'Unable to load collector details. Try again.'));
    return data === null ? null : readCollector(data);
  },
  async searchCollectors(query, cursor) {
    const search = query.trim();
    if (search.length < 2 || search.length > 30) throw new Error('Enter at least two characters.');
    const { data, error } = await requireClient().rpc('search_collectors', { p_query: search, p_cursor: readCursor(cursor) });
    if (error) throw new Error(socialActionMessage(error, 'Unable to find collectors. Try again.'));
    return readCollectorPage(data);
  },
  async listPeople(kind: PeopleList, cursor) {
    const { data, error } = await requireClient().rpc('list_people', { p_kind: kind, p_cursor: readCursor(cursor) });
    if (error) throw new Error(socialActionMessage(error, 'Unable to load collectors. Try again.'));
    return readCollectorPage(data);
  },
  async setFollowing(publisherId, following) {
    const { data, error } = await requireClient().rpc('set_following', { p_publisher_id: requireId(publisherId), p_following: following });
    if (error) throw new Error(socialActionMessage(error, 'Unable to update following. Try again.'));
    const relationship = readRelationship(data);
    invalidateSocial('relationship');
    return relationship;
  },
  async removeFollower(publisherId) {
    const { data, error } = await requireClient().rpc('remove_follower', { p_publisher_id: requireId(publisherId) });
    if (error) throw new Error(socialActionMessage(error, 'Unable to remove this follower. Try again.'));
    const relationship = readRelationship(data);
    invalidateSocial('relationship');
    return relationship;
  },
  async blockCollector(publisherId) {
    const { error } = await requireClient().rpc('block_collector', { p_publisher_id: requireId(publisherId) });
    if (error) throw new Error(socialActionMessage(error, 'Unable to block this collector. Try again.'));
    invalidateSocial('relationship');
  },
  async listFollowingEntries(_cursor, _friendsOnly): Promise<CursorPage<SharedEntry>> { return unavailable(); },
  async listCollectorEntries(_publisherId, _cursor): Promise<CursorPage<SharedEntry>> { return unavailable(); },
  async readVisibleCollection(_collectionId, _cursor): Promise<VisibleCollection | null> { return unavailable(); },
  async readSharedEntry(_itemId): Promise<SharedEntry | null> { return unavailable(); },
  async setItemLiked(_itemId, _liked): Promise<void> { return unavailable(); },
  async getEntrySocialState(_itemIds): Promise<Record<string, LikeState>> { return unavailable(); },
};