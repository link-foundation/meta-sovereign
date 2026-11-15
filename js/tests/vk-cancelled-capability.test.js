import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCancelledJob } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';
test('actual VK adapter prepares a reviewed outgoing friendship question without sending', async () => {
  await withCancelledJob(async ({ job, adapter }) => {
    const review = await job.preview();
    assert.equal(review.plan.status, 'review');
    assert.equal(review.plan.items[0].action, 'prompt');
    assert.equal(review.plan.items[0].evidence, 'outgoing-only');
    assert.deepEqual(adapter.effects, []);
  });
});
