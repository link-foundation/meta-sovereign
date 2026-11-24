import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallAdapter } from '../../experiments/issue-56/vk-wall-fixture.mjs';
test('actual VK adapter exposes guarded native wall invitation methods', () => {
  const { live } = wallAdapter();
  for (const method of [
    'wallInviteSnapshot',
    'wallInviteState',
    'wallInvitePostState',
    'wallInviteEffect',
  ]) {
    assert.equal(typeof live[method], 'function', method);
  }
});
