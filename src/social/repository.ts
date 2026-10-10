import { requireClient } from '../lib/supabase';
import { invalidateSocial } from './events';
import { socialProfileErrorMessage } from './messages';
import type { CollectorIdentity, CollectorProfile, CursorPage, LikeState, OwnSocialProfile, PeopleList, Relationship, SharedEntry, SocialCapabilities, SocialRepository, VisibleCollection } from './types';

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
  if (error.code === '42501') return typeof error.message === 'string' && /follow|block|sign in|available|following/i.test(error.message) ? error.message : 'This action is unavailable.';
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
function readIdentity(value: unknown): CollectorIdentity {
  if (!isRecord(value) || typeof value.publisherId !== 'string' || !UUID.test(value.publisherId) || (value.username !== null && typeof value.username !== 'string')) throw new Error('Unable to load shared entry. Try again.');
  return { publisherId: value.publisherId, username: value.username as string | null };
}
function readProfile(value: unknown): OwnSocialProfile {
  if (!isRecord(value) || typeof value.publisherId !== 'string' || !UUID.test(value.publisherId) || typeof value.username !== 'string' || (value.introCompletedAt !== null && typeof value.introCompletedAt !== 'string')) throw new Error('Unable to load your profile. Try again.');
  return { publisherId: value.publisherId, username: value.username, introCompletedAt: value.introCompletedAt as string | null };
}
function readCollector(value: unknown): CollectorProfile {
  const identity = readIdentity(value);
  if (!isRecord(value)) throw new Error('Unable to load collector details. Try again.');
  return { ...identity, relationship: readRelationship(value.relationship) };
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
function cursorFrom(value: unknown) {
  return value === null ? null : isRecord(value) ? JSON.stringify(value) : (() => { throw new Error('Unable to load shared entries. Try again.'); })();
}
function readCollectorPage(value: unknown): CursorPage<CollectorProfile> {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error('Unable to load collectors. Try again.');
  return { items: value.items.map(readCollector), nextCursor: cursorFrom(value.nextCursor) };
}
function readLikeState(value: unknown): LikeState {
  if (!isRecord(value) || typeof value.count !== 'number' || !Number.isSafeInteger(value.count) || value.count < 0 || typeof value.likedByMe !== 'boolean') throw new Error('Unable to load shared entry. Try again.');
  return { count: value.count, likedByMe: value.likedByMe };
}
function readSharedEntry(value: unknown): SharedEntry {
  if (!isRecord(value) || typeof value.id !== 'string' || !UUID.test(value.id) || typeof value.title !== 'string' || typeof value.hasPhoto !== 'boolean' || typeof value.collectionId !== 'string' || !UUID.test(value.collectionId) || typeof value.collectionName !== 'string' || typeof value.publisherId !== 'string' || !UUID.test(value.publisherId) || typeof value.createdAt !== 'string' || (value.audience !== 'public' && value.audience !== 'friends')) throw new Error('Unable to load shared entry. Try again.');
  const creator = readIdentity(value.creator);
  if (creator.publisherId !== value.publisherId) throw new Error('Unable to load shared entry. Try again.');
  return {
    id: value.id,
    title: value.title,
    hasPhoto: value.hasPhoto,
    collectionId: value.collectionId,
    collectionName: value.collectionName,
    publisherId: value.publisherId,
    creator,
    createdAt: value.createdAt,
    audience: value.audience,
    relationship: readRelationship(value.relationship),
    likes: readLikeState(value.likes),
  };
}
function readSharedPage(value: unknown): CursorPage<SharedEntry> {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error('Unable to load shared entries. Try again.');
  return { items: value.items.map(readSharedEntry), nextCursor: cursorFrom(value.nextCursor) };
}
function readLikeMap(value: unknown): Record<string, LikeState> {
  if (!isRecord(value)) throw new Error('Unable to load item reactions. Try again.');
  const result: Record<string, LikeState> = {};
  for (const [itemId, state] of Object.entries(value)) {
    if (!UUID.test(itemId)) throw new Error('Unable to load item reactions. Try again.');
    result[itemId] = readLikeState(state);
  }
  return result;
}
function readVisibleCollection(value: unknown): VisibleCollection {
  if (!isRecord(value) || !isRecord(value.collection) || typeof value.collection.id !== 'string' || !UUID.test(value.collection.id) || typeof value.collection.name !== 'string') throw new Error('Unable to load this collection. Try again.');
  const count = value.visibleItemCount;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) throw new Error('Unable to load this collection. Try again.');
  return {
    collection: { id: value.collection.id, name: value.collection.name, creator: readIdentity(value.collection.creator) },
    entries: readSharedPage(value.entries),
    visibleItemCount: count,
  };
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
  async listFollowingEntries(cursor, friendsOnly = false) {
    const { data, error } = await requireClient().rpc('list_following_entries', { p_cursor: readCursor(cursor), p_friends_only: friendsOnly });
    if (error) throw new Error(socialActionMessage(error, 'Unable to load Following. Try again.'));
    return readSharedPage(data);
  },
  async listCollectorEntries(publisherId, cursor) {
    const { data, error } = await requireClient().rpc('list_collector_entries', { p_publisher_id: requireId(publisherId), p_cursor: readCursor(cursor) });
    if (error) throw new Error(socialActionMessage(error, 'Unable to load shared entries. Try again.'));
    return readSharedPage(data);
  },
  async readVisibleCollection(collectionId, cursor) {
    const { data, error } = await requireClient().rpc('get_visible_collection', { p_collection_id: requireId(collectionId, 'Collection unavailable.'), p_cursor: readCursor(cursor) });
    if (error) throw new Error(socialActionMessage(error, 'Unable to load this collection. Try again.'));
    return data === null ? null : readVisibleCollection(data);
  },
  async readSharedEntry(itemId) {
    const { data, error } = await requireClient().rpc('get_shared_entry', { p_item_id: requireId(itemId, 'Entry unavailable.') });
    if (error) throw new Error(socialActionMessage(error, 'Unable to load this entry. Try again.'));
    return data === null ? null : readSharedEntry(data);
  },
  async setItemLiked(itemId, liked) {
    const { error } = await requireClient().rpc('set_item_liked', { p_item_id: requireId(itemId, 'Entry unavailable.'), p_liked: liked });
    if (error) throw new Error(socialActionMessage(error, 'Unable to update this like. Try again.'));
    invalidateSocial('like');
  },
  async getEntrySocialState(itemIds) {
    const ids = [...new Set(itemIds.map(itemId => requireId(itemId, 'Entry unavailable.')))];
    if (ids.length > 24) throw new Error('Too many entries.');
    const { data, error } = await requireClient().rpc('get_entry_social_state', { p_item_ids: ids });
    if (error) throw new Error(socialActionMessage(error, 'Unable to load item reactions. Try again.'));
    return readLikeMap(data);
  },
};
