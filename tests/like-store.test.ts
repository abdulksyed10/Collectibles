import assert from 'node:assert/strict';
import test from 'node:test';
import { createLikeStore } from '../src/social/likeStore.ts';

test('a like store shares optimistic and authoritative state while suppressing duplicate requests', async () => {
  let writes = 0;
  const store = createLikeStore({
    async setItemLiked() { writes += 1; },
    async getEntrySocialState() { return { entry: { count: 4, likedByMe: true } }; },
  });
  const seen: number[] = [];
  store.subscribe('entry', value => seen.push(value.count));
  store.sync('entry', { count: 3, likedByMe: false });
  await Promise.all([store.toggle('entry'), store.toggle('entry')]);
  assert.equal(writes, 1);
  assert.deepEqual(seen, [3, 4]);
  assert.deepEqual(store.get('entry'), { count: 4, likedByMe: true });
  store.sync('entry', { count: 3, likedByMe: false });
  assert.deepEqual(store.get('entry'), { count: 4, likedByMe: true });
});

test('a failed like request restores the prior value', async () => {
  const store = createLikeStore({
    async setItemLiked() { throw new Error('denied'); },
    async getEntrySocialState() { return {}; },
  });
  store.sync('entry', { count: 3, likedByMe: false });
  await assert.rejects(() => store.toggle('entry'));
  assert.deepEqual(store.get('entry'), { count: 3, likedByMe: false });
});
