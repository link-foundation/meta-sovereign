import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticSources } from '../../experiments/issue-56/automatic-cap-fixture.mjs';
import {
  stopFixture,
  stoppedState,
} from '../../experiments/issue-56/autopilot-stop-fixture.mjs';

for (const source of automaticSources) {
  test(
    `${source}: Stop during typing prevents the pending automatic send`,
    { timeout: 5000 },
    async (t) => {
      await stopFixture(t, source, { phase: 'typing' }, async (result) => {
        assert.equal(result.effects.length, 0);
        assert.equal(result.premature, false, 'Stop waits for its owned step');
        await stoppedState(result);
      });
    }
  );
  for (const unknown of [false, true]) {
    test(
      `${source}: Stop drains an issued ${unknown ? 'uncertain' : 'confirmed'} send and retains its receipt`,
      { timeout: 5000 },
      async (t) => {
        await stopFixture(
          t,
          source,
          { phase: 'send', unknown },
          async (result) => {
            assert.equal(
              result.premature,
              false,
              'Do not acknowledge Stop while a provider request is owned'
            );
            assert.equal(result.effects.length, 1);
            const receipts = await result.store.query((link) =>
              link.id?.startsWith('outbox:')
            );
            assert.equal(receipts.length, 1);
            assert.equal(receipts[0].status, unknown ? 'unknown' : 'sent');
            await stoppedState(result);
          }
        );
      }
    );
  }
}

test(
  'Stop while planning drains the owner and retains the terminal state',
  { timeout: 5000 },
  async (t) => {
    await stopFixture(t, 'telegram', { phase: 'plan' }, async (result) => {
      assert.equal(result.premature, false);
      assert.equal(result.effects.length, 0);
      await stoppedState(result);
    });
  }
);

test(
  'Stop reaches the real VK outgoing pacing queue',
  { timeout: 5000 },
  async (t) => {
    await stopFixture(t, 'vk', { phase: 'vk-queue' }, async (result) => {
      assert.equal(result.effects.length, 0);
      assert.equal(result.premature, false);
      await stoppedState(result);
      const queued = await result.store.query((link) =>
        link.id?.startsWith('vk-outgoing:')
      );
      assert.equal(queued.length, 1);
      assert.equal(queued[0].status, 'stopped');
    });
  }
);

test(
  'shutdown drains its issued provider request without replay',
  { timeout: 5000 },
  async (t) => {
    await stopFixture(
      t,
      'telegram',
      { phase: 'send', all: true },
      async (result) => {
        assert.equal(result.premature, false);
        assert.equal(result.effects.length, 1);
        const receipts = await result.store.query((link) =>
          link.id?.startsWith('outbox:')
        );
        assert.equal(receipts[0].status, 'sent');
      }
    );
  }
);

test(
  'Stop during durable admission refuses the unissued effect definitively',
  { timeout: 5000 },
  async (t) => {
    await stopFixture(t, 'telegram', { phase: 'flush' }, async (result) => {
      assert.equal(result.premature, false);
      assert.equal(result.effects.length, 0);
      const records = await result.store.query((link) =>
        link.id?.startsWith('outbox:')
      );
      assert.equal(records.length, 1);
      assert.equal(records[0].status, 'failed');
      assert.equal(records[0].code, 'stopped');
      await stoppedState(result);
    });
  }
);
