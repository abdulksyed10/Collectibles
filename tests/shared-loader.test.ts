import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendUniqueEntries, createSharedRequestGate } from '../src/social/sharedLoader.ts';

test('a shared request gate discards results from a prior refresh or session', () => {
  const gate = createSharedRequestGate();
  const first = gate.beginRefresh();
  assert.equal(gate.isCurrent(first), true);

  const second = gate.beginRefresh();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);

  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
});

test('a shared request gate permits one pagination request at a time', () => {
  const gate = createSharedRequestGate();
  assert.equal(gate.beginMore(), true);
  assert.equal(gate.beginMore(), false);
  gate.endMore();
  assert.equal(gate.beginMore(), true);
});

test('shared pagination removes duplicate entries without changing first-seen order', () => {
  const merged = appendUniqueEntries(
    [{ id: 'one' }, { id: 'two' }],
    [{ id: 'two' }, { id: 'three' }, { id: 'one' }, { id: 'four' }],
  );
  assert.deepEqual(merged.map(entry => entry.id), ['one', 'two', 'three', 'four']);
});
