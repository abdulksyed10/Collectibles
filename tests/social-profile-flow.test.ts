import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileSetupState } from '../src/social/profileFlow.ts';
import { buildCollectorUrl, buildItemUrl, socialDestinationFromUrl } from '../src/social/links.ts';
import { clearPendingSocialDestination, consumePendingSocialDestination, setPendingSocialDestination } from '../src/social/pendingDestination.ts';
import { socialProfileErrorMessage } from '../src/social/messages.ts';

const profile = { publisherId: '11111111-1111-4111-8111-111111111111', username: 'alex_pins', introCompletedAt: null };
const itemId = '22222222-2222-4222-8222-222222222222';

test('profile setup appears only when profiles are enabled and the introduction is incomplete', () => {
  assert.equal(profileSetupState({ profilesEnabled: false, socialWritesEnabled: false, friendsSharingEnabled: false, likesEnabled: false }, profile), 'disabled');
  assert.equal(profileSetupState({ profilesEnabled: true, socialWritesEnabled: false, friendsSharingEnabled: false, likesEnabled: false }, profile), 'intro');
  assert.equal(profileSetupState({ profilesEnabled: true, socialWritesEnabled: false, friendsSharingEnabled: false, likesEnabled: false }, { ...profile, introCompletedAt: '2026-10-09T12:00:00Z' }), 'ready');
});

test('collector and entry links contain only an opaque public id', () => {
  const collectorUrl = buildCollectorUrl('https://www.sharecollectibles.com/?code=auth-secret#recovery', profile.publisherId);
  assert.equal(collectorUrl, `https://www.sharecollectibles.com/?collector=${profile.publisherId}`);
  assert.equal(buildItemUrl('https://www.sharecollectibles.com/?code=auth-secret#recovery', itemId), `https://www.sharecollectibles.com/?item=${itemId}`);
  assert.deepEqual(socialDestinationFromUrl(collectorUrl), { type: 'collector', id: profile.publisherId });
  assert.deepEqual(socialDestinationFromUrl(`collectibles://?item=${itemId}`), { type: 'item', id: itemId });
  assert.equal(socialDestinationFromUrl(`https://www.sharecollectibles.com/?collector=${profile.publisherId}&email=alex@example.test`), null);
  assert.equal(socialDestinationFromUrl(`https://www.sharecollectibles.com/?collector=${profile.publisherId}&item=${itemId}`), null);
  assert.equal(socialDestinationFromUrl('https://other.example/?collector=11111111-1111-4111-8111-111111111111'), null);
});

test('pending social destinations are internal data, consumed once, and cleared on session changes', () => {
  clearPendingSocialDestination();
  setPendingSocialDestination({ type: 'collector', id: profile.publisherId });
  assert.deepEqual(consumePendingSocialDestination(), { type: 'collector', id: profile.publisherId });
  assert.equal(consumePendingSocialDestination(), null);
  setPendingSocialDestination({ type: 'item', id: itemId });
  clearPendingSocialDestination();
  assert.equal(consumePendingSocialDestination(), null);
});

test('profile errors remain actionable without exposing database details', () => {
  assert.equal(socialProfileErrorMessage({ code: '23505', message: 'duplicate key value violates constraint private.collector_profiles_username_key' }), 'That username is already taken.');
  assert.equal(socialProfileErrorMessage({ code: '42901', message: 'Username changes are limited for today.' }), 'Username changes are limited for today.');
  assert.equal(socialProfileErrorMessage({ code: '22023', message: 'Choose a different username.' }), 'Choose a different username.');
  assert.equal(socialProfileErrorMessage({ code: 'XX000', message: 'internal provider connection failed' }), 'Unable to update your profile. Try again.');
});