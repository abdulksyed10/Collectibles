import type { PublicEntryCard } from '../domain/models';

export type Relationship = {
  isFollowing: boolean;
  isFollower: boolean;
  isFriend: boolean;
  blockedByMe: boolean;
  interactionAllowed: boolean;
};

export type CollectorIdentity = { publisherId: string; username: string | null };
export type OwnSocialProfile = Omit<CollectorIdentity, 'username'> & { username: string; introCompletedAt: string | null };
export type CollectorProfile = CollectorIdentity & { relationship: Relationship };
export type LikeState = { count: number; likedByMe: boolean };
export type SharedEntry = PublicEntryCard & {
  publisherId: string;
  creator: CollectorIdentity;
  createdAt: string;
  audience: 'public' | 'friends';
  relationship: Relationship;
  likes: LikeState;
};
export type CursorPage<T> = { items: T[]; nextCursor: string | null };
export type PeopleList = 'following' | 'followers' | 'friends' | 'blocked';
export type VisibleCollection = {
  collection: { id: string; name: string; creator: CollectorIdentity };
  entries: CursorPage<SharedEntry>;
  visibleItemCount: number;
};
export type SocialCapabilities = {
  profilesEnabled: boolean;
  socialWritesEnabled: boolean;
  friendsSharingEnabled: boolean;
  likesEnabled: boolean;
};

export interface SocialRepository {
  getSocialCapabilities(): Promise<SocialCapabilities>;
  ensureSocialProfile(): Promise<OwnSocialProfile>;
  completeProfileIntro(username: string): Promise<OwnSocialProfile>;
  updateUsername(username: string): Promise<OwnSocialProfile>;
  getCollector(publisherId: string): Promise<CollectorProfile | null>;
  searchCollectors(query: string, cursor?: string): Promise<CursorPage<CollectorProfile>>;
  listPeople(kind: PeopleList, cursor?: string): Promise<CursorPage<CollectorProfile>>;
  setFollowing(publisherId: string, following: boolean): Promise<Relationship>;
  removeFollower(publisherId: string): Promise<Relationship>;
  blockCollector(publisherId: string): Promise<void>;
  listFollowingEntries(cursor?: string, friendsOnly?: boolean): Promise<CursorPage<SharedEntry>>;
  listCollectorEntries(publisherId: string, cursor?: string): Promise<CursorPage<SharedEntry>>;
  readVisibleCollection(collectionId: string, cursor?: string): Promise<VisibleCollection | null>;
  readSharedEntry(itemId: string): Promise<SharedEntry | null>;
  setItemLiked(itemId: string, liked: boolean): Promise<void>;
  getEntrySocialState(itemIds: string[]): Promise<Record<string, LikeState>>;
}