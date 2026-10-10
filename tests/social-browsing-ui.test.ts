import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const catalog = readFileSync('src/screens/PublicCatalog.tsx', 'utf8');
const visibleCollection = readFileSync('src/social/VisibleCollectionScreen.tsx', 'utf8');
const card = readFileSync('src/social/SharedEntryCard.tsx', 'utf8');

test('signed-in Explore can open Following and shared collector profiles without turning a photo tap into a profile tap', () => {
  assert.match(catalog, /onFollowing/);
  assert.match(catalog, /CollectorProfileScreen/);
  assert.match(catalog, /setProfileId/);
  assert.match(visibleCollection, /CollectorProfileScreen/);
  assert.match(card, /onOpenCollector \? <Pressable/);
  assert.match(card, /onPress=\{onOpen\}/);
});
