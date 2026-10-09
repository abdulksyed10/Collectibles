import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followAction, needsFriendConfirmation } from '../src/social/relationshipActions.ts';

const none = { isFollowing: false, isFollower: false, isFriend: false, blockedByMe: false, interactionAllowed: true };

test('follow controls distinguish follow-back, unfollow, and unavailable relationships', () => {
  assert.equal(followAction(none), 'follow');
  assert.equal(followAction({ ...none, isFollower: true }), 'follow-back');
  assert.equal(followAction({ ...none, isFollowing: true }), 'unfollow');
  assert.equal(followAction({ ...none, interactionAllowed: false }), 'unavailable');
  assert.equal(needsFriendConfirmation({ ...none, isFollower: true }), true);
  assert.equal(needsFriendConfirmation({ ...none, isFollowing: true, isFollower: true, isFriend: true }), false);
});