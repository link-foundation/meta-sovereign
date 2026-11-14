import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationBatchFixture } from '../../experiments/issue-56/application-batch-fixture.mjs';

test(
  'a clock tick during admission preserves the requested maximum batch lifetime',
  { timeout: 5000 },
  async (t) => {
    let clock = Date.parse('2026-11-14T12:00:00Z');
    const f = applicationBatchFixture(t, {
      application: { now: () => clock++ },
    });
    const receipt = await f.start({ testMode: true });
    assert.equal(receipt.batch.phase, 'completed');
    assert.equal(
      Date.parse(receipt.batch.expiresAt) - Date.parse(receipt.batch.startedAt),
      86400000
    );
    assert.deepEqual((await f.status()).batch, receipt.batch);
    assert.equal(f.state.opened, 0);
  }
);
