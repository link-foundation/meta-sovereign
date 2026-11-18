import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutopilot, autopilotId } from '../src/automation/autopilot.js';
import { outboxId } from '../src/automation/outbox.js';
import {
  capNow,
  confirmedTarget,
  withAutomaticCap,
} from '../../experiments/issue-56/automatic-cap-fixture.mjs';

const capWait = async (
  t,
  {
    store,
    automation,
    runner,
    check,
    wait = 86400000,
    nextAt = '2026-11-18T12:00:00.000Z',
  }
) => {
  const observed = Promise.withResolvers();
  const drained = Promise.withResolvers();
  let waiting = false;
  const pilot = createAutopilot({
    store,
    runner,
    clock: () => new Date(capNow),
    sleep: async (ms, signal) => {
      waiting = true;
      observed.resolve({ ms });
      try {
        if (!signal.aborted) {
          await new Promise((resolve) =>
            signal.addEventListener('abort', resolve, { once: true })
          );
        }
      } finally {
        drained.resolve();
      }
    },
    log: (event) => {
      if (event.event === 'autopilot_failed') {
        observed.resolve({ error: event.error });
      }
    },
  });
  t.signal.addEventListener(
    'abort',
    () => observed.resolve({ aborted: true }),
    {
      once: true,
    }
  );
  try {
    await pilot.start(automation);
    assert.deepEqual(await observed.promise, { ms: wait });
    const state = await store.get(autopilotId(automation));
    assert.equal(state.status, 'capped');
    assert.equal(state.on, true);
    assert.equal(state.failed, 0);
    assert.equal(state.nextAt, nextAt);
    await check?.();
  } finally {
    await pilot.stop(automation);
    if (waiting) {
      await drained.promise;
    }
  }
};

test(
  'an empty zero-cap autopilot waits finitely without planning or invalid dates',
  { timeout: 5000 },
  async (t) => {
    await withAutomaticCap(async ({ store, automation, effects, runner }) => {
      automation.pacing.dailyCap = 0;
      await store.put(automation);
      const active = runner();
      let planned = 0;
      await capWait(t, {
        store,
        automation,
        runner: {
          load: active.load,
          next: async () => {
            planned += 1;
            throw new Error('A zero cap must never plan a send');
          },
        },
        check: () => {
          assert.equal(planned, 0);
          assert.equal(effects.length, 0);
        },
      });
    });
  }
);

test(
  'a daily-cap race rereads the saved lower limit before planning another step',
  { timeout: 5000 },
  async (t) => {
    await withAutomaticCap(async ({ store, automation, effects, runner }) => {
      automation.pacing.dailyCap = 2;
      await store.put(automation);
      const active = runner();
      const planned = await confirmedTarget(
        active,
        automation,
        'telegram',
        '202'
      );
      let steps = 0;
      await capWait(t, {
        store,
        automation,
        runner: {
          load: active.load,
          next: async () => {
            assert.equal(
              ++steps,
              1,
              'The next step must wait for saved capacity'
            );
            await store.put({
              ...automation,
              pacing: { ...automation.pacing, dailyCap: 1 },
            });
            await store.put({
              id: outboxId('concurrent-lifecycle-intent'),
              owner: automation.id,
              source: 'telegram',
              chat: '201',
              status: 'sending',
              at: capNow,
            });
            return { draft: planned.confirmed[0] };
          },
          deliverDraft: active.deliverDraft,
        },
        check: () => {
          assert.equal(steps, 1);
          assert.equal(effects.length, 0);
        },
      });
    });
  }
);

for (const [at, wait, nextAt] of [
  ['2026-11-17T06:00:00.000Z', 64800000, '2026-11-18T06:00:00.000Z'],
  ['2026-11-17T13:00:00.000Z', 90000000, '2026-11-18T13:00:00.000Z'],
]) {
  test(
    `a positive-cap receipt at ${at} retains its original expiry`,
    { timeout: 5000 },
    async (t) => {
      await withAutomaticCap(async ({ store, automation, effects, runner }) => {
        await store.put({
          id: outboxId('existing-cap-receipt'),
          owner: automation.id,
          source: 'telegram',
          chat: '201',
          status: 'unknown',
          at,
        });
        const active = runner();
        await capWait(t, {
          store,
          automation,
          wait,
          nextAt,
          runner: {
            load: active.load,
            next: async () => {
              throw new Error('An uncertain receipt retains capacity');
            },
          },
          check: () => assert.equal(effects.length, 0),
        });
      });
    }
  );
}
