import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withGreetJob,
  greetAdapter,
  greetServer,
} from '../../experiments/issue-56/vk-greet-fixture.mjs';
import {
  vkGreetSettings,
  greetLedgerId,
} from '../src/automation/vk-greet-settings.js';
import { verifyPersonalAdmission } from '../../experiments/issue-56/vk-personal-admission.mjs';

test('provider limiter and durable intent recheck changed history, permission, policy, account, token and time', async () => {
  await verifyPersonalAdmission({
    createAdapter: greetAdapter,
    withJob: (check, options) =>
      withGreetJob(
        (fixture) => check({ ...fixture, policy: vkGreetSettings }),
        options
      ),
    ledgerId: greetLedgerId(1, 9),
    field: 'message',
    foreignStatus: 'confirmed',
  });
});

test('failed intent refuses delivery and a failed outcome retains uncertainty without replay', async () => {
  for (const phase of ['intent', 'outcome']) {
    await withGreetJob(
      async ({ store, job, adapter }) => {
        const { plan } = await job.preview();
        store.flush = async () => {
          const ledger = await store.get(greetLedgerId(1, 9));
          if (
            ledger &&
            ledger.status === (phase === 'intent' ? 'pending' : 'confirmed')
          ) {
            throw Error('Greeting fixture acknowledgement refused');
          }
        };
        if (phase === 'intent') {
          const result = await job.run({ planId: plan.planId, confirm: true });
          assert.equal(result.last.status, 'refused');
        } else {
          await assert.rejects(
            job.run({ planId: plan.planId, confirm: true }),
            /acknowledgement refused/
          );
        }
        assert.equal(adapter.effects.length, phase === 'intent' ? 0 : 1);
        store.flush = async () => {};
        const retry = await job.preview();
        assert.equal(
          retry.plan.items[0].reason,
          phase === 'intent' ? 'eligible' : 'unknown'
        );
        if (phase === 'outcome') {
          await job.run({ planId: retry.plan.planId, confirm: true });
          assert.equal(adapter.effects.length, 1);
        }
      },
      { adapter: greetAdapter({ ids: [9] }) }
    );
  }
});

test(
  'owned schedule starts only after port ownership and shutdown aborts thirty-second pacing',
  { timeout: 10000 },
  async () => {
    let timer, notify;
    const pacing = new Promise((resolve) => {
      notify = resolve;
    });
    const fixture = await greetServer({
      scheduler: true,
      vkGreet: {
        setInterval: (callback) => {
          timer = callback;
          return { unref() {} };
        },
        clearInterval: () => {},
        sleep: async (ms, signal) => {
          assert.equal(ms, 30000);
          notify();
          await new Promise((resolve) =>
            signal.addEventListener('abort', resolve, { once: true })
          );
        },
      },
    });
    try {
      assert.equal(typeof timer, 'function');
      await vkGreetSettings.save(fixture.store, {
        ...(await vkGreetSettings.settings(fixture.store)),
        enabled: true,
      });
      const running = timer();
      await pacing;
      await fixture.close();
      await running;
      assert.equal(fixture.effects.length, 1);
    } finally {
      await fixture.close();
    }
  }
);
