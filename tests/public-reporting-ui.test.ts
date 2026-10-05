import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controls = readFileSync('src/components/PublicSafetyControls.tsx', 'utf8');
const library = readFileSync('src/screens/LibraryScreen.tsx', 'utf8');

test('public reporting is exposed only after a signed-in session and explains the five-member threshold', () => {
  assert.match(controls, /supabase\.auth\.getSession/);
  assert.match(controls, /canReport && !showReport/);
  assert.match(controls, /Sign in to report public content/);
  assert.match(controls, /five different members/);
});

test('the review queue appears only behind a server-backed admin context', () => {
  assert.match(library, /repository\.getAdminContext\(\)/);
  assert.match(library, /isAdmin && !onExitDemo/);
  assert.match(library, /<AdminReviewScreen/);
});