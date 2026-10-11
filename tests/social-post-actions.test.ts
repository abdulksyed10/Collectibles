import assert from 'node:assert/strict';
import test from 'node:test';
import { compactFollowPresentation, compactLikePresentation } from '../src/social/postActions.ts';

const none = { isFollowing: false, isFollower: false, isFriend: false, blockedByMe: false, interactionAllowed: true };

test('compact like controls expose a red active heart state without changing the count', () => {
  assert.deepEqual(compactLikePresentation({ count: 2, likedByMe: false }), { label: 'Like', active: false, count: 2 });
  assert.deepEqual(compactLikePresentation({ count: 2, likedByMe: true }), { label: 'Unlike', active: true, count: 2 });
});

test('compact follow controls describe the action that will happen', () => {
  assert.deepEqual(compactFollowPresentation(none), { label: 'Follow', action: 'follow' });
  assert.deepEqual(compactFollowPresentation({ ...none, isFollower: true }), { label: 'Follow back', action: 'follow-back' });
  assert.deepEqual(compactFollowPresentation({ ...none, isFollowing: true }), { label: 'Unfollow', action: 'unfollow' });
  assert.equal(compactFollowPresentation({ ...none, interactionAllowed: false }), null);
});
