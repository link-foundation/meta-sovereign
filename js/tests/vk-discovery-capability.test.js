import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVkLive } from '../src/sources/vk.js';
test('VK native adapter exposes bounded discovery and current incoming-request rejection', () => {
  const live = createVkLive({ limiter: { wait: async () => {} } });
  for (const method of [
    'discoverySnapshot',
    'discoveryState',
    'rejectFriendRequest',
  ]) {
    assert.equal(typeof live[method], 'function', method);
  }
});
