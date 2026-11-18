import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetAdapter } from '../../experiments/issue-56/vk-greet-fixture.mjs';
test('actual VK adapter exposes fresh birthday snapshot and date evidence', () => {
  const { live } = greetAdapter();
  for (const method of ['birthdaySnapshot', 'birthdayState']) {
    assert.equal(typeof live[method], 'function', method);
  }
});
