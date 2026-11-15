import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendsAdapter } from '../../experiments/issue-56/vk-friends-fixture.mjs';
test('actual VK adapter exposes bounded retention and acknowledged provider deletion', () => {
  const { live } = friendsAdapter();
  for (const method of [
    'retentionSnapshot',
    'retentionState',
    'deleteRetention',
  ]) {
    assert.equal(typeof live[method], 'function', method);
  }
});
