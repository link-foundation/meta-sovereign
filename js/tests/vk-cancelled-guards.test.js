import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readVkCancelledSettings,
  saveVkCancelled,
  cancelledLedgerId,
} from '../src/automation/vk-cancelled-settings.js';
import { saveSettings } from '../src/automation/safety.js';
import {
  cancelledNow,
  cancelledAdapter,
  withCancelledJob,
  cancelledServer,
} from '../../experiments/issue-56/vk-cancelled-fixture.mjs';

test('follow-up admission checks after the actual limiter and acknowledged intent catch late changes', async () => {
  for (const boundary of ['limiter', 'intent']) {
    for (const mode of ['history', 'policy', 'credential', 'clock']) {
      let armed = false;
      let changed = false;
      let fixture;
      let token = 'fixture-user-token';
      let now = cancelledNow;
      const change = async () => {
        if (changed) {
          return;
        }
        changed = true;
        if (mode === 'history') {
          fixture.adapter.addMessage(9, 'A late reply', { out: 0 });
        }
        if (mode === 'credential') {
          token = 'changed-fixture-token';
        }
        if (mode === 'clock') {
          now += 300001;
        }
        if (mode === 'policy') {
          await saveVkCancelled(fixture.store, {
            ...(await readVkCancelledSettings(fixture.store)),
            priorityIds: [9],
          });
        }
      };
      const adapter = cancelledAdapter({
        ids: [9],
        limiter: {
          wait: async () => {
            if (armed && boundary === 'limiter') {
              await change();
            }
          },
        },
      });
      await withCancelledJob(
        async (owned) => {
          fixture = owned;
          const { store, job } = owned;
          const plan = (await job.preview()).plan;
          store.flush = async () => {
            if (
              boundary === 'intent' &&
              (await store.get(cancelledLedgerId(1, 9, 'prompt')))?.status ===
                'pending'
            ) {
              await change();
            }
          };
          armed = true;
          const answer = await job.run({ planId: plan.planId, confirm: true });
          assert.equal(changed, true, `${boundary}/${mode}`);
          assert.equal(answer.last.status, 'refused', `${boundary}/${mode}`);
          assert.deepEqual(adapter.effects, []);
        },
        { adapter, now: () => now, optionsFor: async () => ({ token }) }
      );
    }
  }
});

test('automatic follow-up respects quiet hours, acknowledges its interval and owns one timer', async () => {
  const timers = [];
  const cleared = [];
  await withCancelledJob(
    async ({ store, adapter, job }) => {
      job.start();
      job.start();
      assert.equal(timers.length, 1);
      await saveSettings(store, {
        timezone: 'UTC',
        quietHours: { enabled: true, from: '11:00', to: '13:00' },
      });
      assert.equal((await job.run({ scheduled: true })).last.status, 'refused');
      assert.deepEqual(adapter.effects, []);
      assert.equal((await job.run({ scheduled: true })).skipped, 'not-due');
      await job.stop();
      assert.equal(cleared.length, 1);
    },
    {
      settings: { enabled: true, limit: 1 },
      setInterval: (fn, milliseconds) => {
        const timer = { fn, milliseconds, unref() {} };
        timers.push(timer);
        return timer;
      },
      clearInterval: (timer) => cleared.push(timer),
    }
  );
});

test(
  'server starts follow-up only after port ownership and aborts owned pacing before draining',
  { timeout: 10000 },
  async () => {
    const timers = [];
    const cleared = [];
    let entered;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    const clock = {
      setInterval: (fn, ms) => {
        const timer = { fn, ms, unref() {} };
        timers.push(timer);
        return timer;
      },
      clearInterval: (timer) => cleared.push(timer),
      sleep: async (ms, signal) => {
        assert.equal(ms, 15000);
        entered();
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
      },
    };
    const fixture = await cancelledServer({
      scheduler: true,
      vkCancelled: clock,
    });
    let running;
    try {
      assert.equal(timers.length, 1);
      await assert.rejects(
        cancelledServer({
          scheduler: true,
          port: fixture.port,
          vkCancelled: clock,
        })
      );
      assert.equal(timers.length, 1);
      await saveVkCancelled(fixture.store, {
        ...(await readVkCancelledSettings(fixture.store)),
        enabled: true,
      });
      running = timers[0].fn();
      await waiting;
      await fixture.close();
      await running;
      assert.equal(fixture.effects.length, 1);
      assert.ok(cleared.length >= 1);
    } finally {
      await fixture.close();
      await running;
    }
  }
);
