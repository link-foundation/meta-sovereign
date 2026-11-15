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
import { cancelledNow } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';
import { saveSettings } from '../src/automation/safety.js';

test('provider limiter and durable intent recheck changed history, permission, policy, account, token and time', async () => {
  for (const stage of ['limiter', 'ack']) {
    for (const change of [
      'history',
      'permission',
      'policy',
      'account',
      'token',
      'time',
      'receipt',
      'online',
      'unread',
      'relationship',
      'optOut',
    ]) {
      let mutate = async () => {};
      let token = 'fixture-user-token';
      let now = cancelledNow;
      const adapter = greetAdapter({
        ids: [9],
        limiter: {
          wait: async () => {
            if (stage === 'limiter') {
              const current = mutate;
              mutate = async () => {};
              await current();
            }
          },
        },
      });
      await withGreetJob(
        async ({ job, store }) => {
          const { plan } = await job.preview();
          const mutation = async () => {
            if (change === 'history') {
              adapter.addMessage(9, 'changed', { out: 0 });
            }
            if (change === 'permission') {
              adapter.canWrite.set(9, false);
            }
            if (change === 'policy') {
              await vkGreetSettings.save(store, {
                ...plan.settings,
                message: 'Changed',
              });
            }
            if (change === 'account') {
              adapter.account(2);
            }
            if (change === 'token') {
              token = 'changed-token';
            }
            if (change === 'time') {
              now += 300001;
            }
            if (change === 'receipt') {
              await store.put({
                id: greetLedgerId(1, 9),
                status: 'confirmed',
                attemptedAt: new Date(now).toISOString(),
                planId: 'other-owner',
              });
            }
            if (change === 'online') {
              adapter.online.set(9, 0);
            }
            if (change === 'unread') {
              adapter.unread.set(9, 1);
            }
            if (change === 'relationship') {
              adapter.relations.set(9, 1);
            }
            if (change === 'optOut') {
              await saveSettings(store, {
                optOut: [{ source: 'vk', chat: '9' }],
              });
            }
          };
          if (stage === 'ack') {
            store.flush = async () => {
              const intent = await store.get(greetLedgerId(1, 9));
              if (intent?.status === 'pending') {
                store.flush = async () => {};
                await mutation();
              }
            };
          } else {
            mutate = mutation;
          }
          const result = await job.run({ planId: plan.planId, confirm: true });
          assert.equal(result.last.status, 'refused', `${stage}/${change}`);
          assert.equal(adapter.effects.length, 0, `${stage}/${change}`);
          if (change === 'receipt') {
            assert.equal(
              (await store.get(greetLedgerId(1, 9))).planId,
              'other-owner'
            );
          }
        },
        { adapter, optionsFor: async () => ({ token }), now: () => now }
      );
    }
  }
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
