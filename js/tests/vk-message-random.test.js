import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vkMessageRandomId } from '../src/automation/vk-message-random.js';
import { withCancelledJob } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';

test('follow-up planner preserves the upper signed VK message identity', async (t) => {
  t.mock.method(globalThis.crypto, 'getRandomValues', (bytes) => {
    bytes[0] = 0xffffffff;
    return bytes;
  });
  await withCancelledJob(async ({ job, adapter }) => {
    const { plan } = await job.preview();
    assert.equal(plan.items[0].randomId, 0x7fffffff);
    assert.equal(adapter.effects.length, 0);
  });
});

test('VK message identity retains every positive 31-bit value and rejects only zero', () => {
  const samples = [0, 0x80000000, 1, 0x7fffffff, 0xffffffff];
  const crypto = {
    getRandomValues: (bytes) => {
      bytes[0] = samples.shift();
      return bytes;
    },
  };
  assert.equal(vkMessageRandomId(crypto), 1);
  assert.equal(vkMessageRandomId(crypto), 0x7fffffff);
  assert.equal(vkMessageRandomId(crypto), 0x7fffffff);
  assert.deepEqual(samples, []);
});

test('a broken zero-only random source refuses within a finite number of draws', () => {
  let calls = 0;
  assert.throws(
    () =>
      vkMessageRandomId({
        getRandomValues: (bytes) => {
          calls++;
          bytes[0] = 0;
          return bytes;
        },
      }),
    /nonzero VK message identity/
  );
  assert.equal(calls, 8);
});
