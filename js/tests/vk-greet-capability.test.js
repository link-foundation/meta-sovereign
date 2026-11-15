import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withGreetJob } from '../../experiments/issue-56/vk-greet-fixture.mjs';
test('actual VK adapter reviews current online friends without sending', async () => {
  await withGreetJob(async ({ job, adapter }) => {
    const { plan } = await job.preview();
    assert.equal(plan.friendCount, 3);
    assert.deepEqual(
      plan.items.map((item) => item.reason),
      ['eligible', 'eligible', 'eligible']
    );
    assert.equal(adapter.effects.length, 0);
  });
});
