import { followAction, type FollowAction } from './relationshipActions';
import type { LikeState, Relationship } from './types';

export function compactLikePresentation(value: LikeState) {
  return { label: value.likedByMe ? 'Unlike' : 'Like', active: value.likedByMe, count: Math.max(0, value.count) };
}

export function compactFollowPresentation(relationship: Relationship): { label: string; action: Exclude<FollowAction, 'unavailable'> } | null {
  const action = followAction(relationship);
  if (action === 'unavailable') return null;
  return { action, label: action === 'unfollow' ? 'Unfollow' : action === 'follow-back' ? 'Follow back' : 'Follow' };
}
