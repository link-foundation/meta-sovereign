import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withReengageJob,
  reengageAdapter,
  runReengage,
} from '../../experiments/issue-56/vk-reengage-fixture.mjs';
import { verifyPersonalAdmission } from '../../experiments/issue-56/vk-personal-admission.mjs';
import { reengageLedgerId } from '../src/automation/vk-reengage-settings.js';

test('real rate wait and acknowledged intent recheck late conversation, consent, identity, settings and receipts', async () => {
  await verifyPersonalAdmission({
    createAdapter: reengageAdapter,
    withJob: (check, options) => withReengageJob('topic', check, options),
    ledgerId: reengageLedgerId('topic', 1, 9),
    field: 'questions',
    foreignStatus: 'unknown',
  });
});
test('failed durable intent has no effect; failed post-send persistence retains unknown and stops the sequence', async () => {
  for (const stage of ['intent', 'receipt']) {
    await withReengageJob('music', async ({ job, store, adapter }) => {
      const put = store.put.bind(store);
      let reject = true;
      store.put = async (row) => {
        if (
          reject &&
          row.id === reengageLedgerId('music', 1, 9) &&
          row.status === (stage === 'intent' ? 'pending' : 'partial')
        ) {
          reject = false;
          throw new Error('Fixture durable receipt refused');
        }
        return put(row);
      };
      const result = await runReengage(job);
      assert.equal(
        result.last.status,
        stage === 'intent' ? 'refused' : 'unknown'
      );
      assert.equal(adapter.effects.length, stage === 'intent' ? 0 : 1);
      if (stage === 'receipt') {
        assert.equal((await job.preview()).plan.items[0].reason, 'unknown');
        await runReengage(job);
        assert.equal(adapter.effects.length, 1);
      }
    });
  }
});
test('owned scheduler coalesces and shutdown aborts pacing before further provider effects', async () => {
  let callback;
  let cleared = 0;
  let paused;
  const waiting = new Promise((resolve) => {
    paused = resolve;
  });
  await withReengageJob(
    'music',
    async ({ job, adapter }) => {
      job.start();
      job.start();
      const running = job.run({ scheduled: true });
      assert.equal(job.run({ scheduled: true }), running);
      assert.equal(typeof callback, 'function');
      await waiting;
      assert.equal(adapter.effects.length, 1);
      await job.stop();
      const result = await running;
      assert.equal(result.last.status, 'refused');
      assert.equal(adapter.effects.length, 1);
      assert.equal(cleared, 1);
    },
    {
      settings: { enabled: true },
      setInterval: (fn) => {
        callback = fn;
        return 17;
      },
      clearInterval: () => {
        cleared++;
      },
      sleep: (_ms, signal) =>
        new Promise((_resolve, reject) => {
          paused();
          signal.addEventListener(
            'abort',
            () => reject(new Error('Fixture stopped')),
            { once: true }
          );
        }),
    }
  );
});
