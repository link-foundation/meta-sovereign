import test from 'node:test';
import assert from 'node:assert/strict';
import { withPilotSdkStop } from '../../experiments/issue-56/dispatch-stop-pilot-fixture.mjs';

const assertDurableData = (value) => {
  assert.notEqual(typeof value, 'function');
  assert.equal(value instanceof globalThis.AbortSignal, false);
  if (value && typeof value === 'object') {
    for (const [key, field] of Object.entries(value)) {
      assert.equal(['signal', 'dispatch', 'beforeIssue'].includes(key), false);
      assertDurableData(field);
    }
  }
};

for (const variant of ['vk-limiter', 'telegram-entity', 'email-smtp-data']) {
  for (const stage of ['prepare', 'issued']) {
    test(
      `automatic Stop drains ${variant} ${stage} and retains the real outbox outcome`,
      { timeout: 5000 },
      async () => {
        await withPilotSdkStop(
          variant,
          stage,
          async ({ store, effects, outcome }) => {
            const status = stage === 'prepare' ? 'failed' : 'sent';
            assert.equal(outcome.status, status);
            assert.equal(
              outcome.code,
              stage === 'prepare' ? 'stopped' : undefined
            );
            assert.deepEqual(effects, stage === 'prepare' ? [] : ['api']);
            const records = await store.query(() => true);
            const outbox = records.filter((record) =>
              record.id.startsWith('outbox:')
            );
            assert.equal(outbox.length, 1);
            assert.equal(outbox[0].status, status);
            assert.equal(outbox[0].code, outcome.code);
            assertDurableData(records);
          }
        );
      }
    );
  }
}
