import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { vkOutgoingFor } from '../src/automation/vk-outgoing-queue.js';

test(
  'a later foreground owner gets a fresh queue only after the stopped owner drains',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const first = vkOutgoingFor(store);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const flight = first.run({ key: 'first-owner', draft: {} }, async () => {
      entered.resolve();
      await release.promise;
      return 'first receipt';
    });
    await entered.promise;
    const closing = first.close();
    try {
      const during = vkOutgoingFor(store);
      assert.equal(during, first);
      await assert.rejects(
        during.run({ key: 'during-close', draft: {} }, () =>
          assert.fail('overlapping work')
        ),
        { code: 'stopped' }
      );
    } finally {
      release.resolve();
      await closing;
      assert.equal(await flight, 'first receipt');
    }
    const next = vkOutgoingFor(store);
    assert.notEqual(next, first);
    try {
      assert.equal(vkOutgoingFor(store), next);
      await first.close();
      assert.equal(
        await next.run(
          { key: 'next-owner', draft: {} },
          async () => 'second receipt'
        ),
        'second receipt'
      );
    } finally {
      await next.close();
    }
  }
);
