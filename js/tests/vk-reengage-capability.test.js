import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reengageAdapter } from '../../experiments/issue-56/vk-reengage-fixture.mjs';
test('actual VK adapter exposes dormant conversation review and ordered sending', () => {
  const { live } = reengageAdapter();
  for (const method of [
    'reengageSnapshot',
    'reengageState',
    'reengageEffect',
  ]) {
    assert.equal(typeof live[method], 'function', method);
  }
});
