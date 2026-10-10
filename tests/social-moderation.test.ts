import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockSharedCollector, reportSharedContent } from '../src/social/moderation.ts';

const entryId = '00000000-0000-4000-8000-000000000101';
const collectionId = '00000000-0000-4000-8000-000000000102';
const publisherId = '00000000-0000-4000-8000-000000000103';

test('shared entry reports use the authenticated report endpoint with one target', async () => {
  const reports: unknown[] = [];
  await reportSharedContent({ reportPublicContent: async target => { reports.push(target); } }, {
    itemId: entryId,
    reason: 'spam',
    details: 'Misleading listing',
  });
  assert.deepEqual(reports, [{ itemId: entryId, reason: 'spam', details: 'Misleading listing' }]);
});

test('shared collection reports use the same endpoint and reject ambiguous targets before a request', async () => {
  let calls = 0;
  const repository = { reportPublicContent: async () => { calls += 1; } };
  await reportSharedContent(repository, { collectionId, reason: 'other' });
  await assert.rejects(() => reportSharedContent(repository, { itemId: entryId, collectionId, reason: 'other' }));
  assert.equal(calls, 1);
});

test('blocking shared content targets the publisher rather than looking up a public collection', async () => {
  const blocked: string[] = [];
  await blockSharedCollector({ blockCollector: async id => { blocked.push(id); } }, publisherId);
  assert.deepEqual(blocked, [publisherId]);
});
