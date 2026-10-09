import type { Relationship } from './types';

export type FollowAction = 'follow' | 'follow-back' | 'unfollow' | 'unavailable';

export function followAction(relationship: Relationship): FollowAction {
  if (!relationship.interactionAllowed) return 'unavailable';
  if (relationship.isFollowing) return 'unfollow';
  return relationship.isFollower ? 'follow-back' : 'follow';
}

export function needsFriendConfirmation(relationship: Relationship) {
  return relationship.interactionAllowed && relationship.isFollower && !relationship.isFollowing;
}