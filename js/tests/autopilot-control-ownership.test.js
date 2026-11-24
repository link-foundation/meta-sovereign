import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { createAutopilot, autopilotId } from '../src/automation/autopilot.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveSettings } from '../src/automation/safety.js';
import {
  engagementPreset,
  seedEngagement,
} from '../../experiments/issue-56/vk-engagement-fixture.mjs';
import {
  capAutomation,
  capNow,
} from '../../experiments/issue-56/automatic-cap-fixture.mjs';
import { deferred } from '../../experiments/issue-56/autopilot-stop-fixture.mjs';

const heldOwners = async (t, check) => {
  const store = createMemoryStore();
  const gates = [];
  const signals = [];
  const entered = [];
  const automation = capAutomation();
  const other = capAutomation('independent-owner');
  const release = () => gates.forEach((gate) => gate.resolve());
  t.signal.addEventListener('abort', release, { once: true });
  const pilot = createAutopilot({
    store,
    runner: {
      load: async (value) =>
        typeof value === 'string' ? store.get(value) : value,
      next: async (_id, { signal } = {}) => {
        const gate = deferred();
        gates.push(gate);
        signals.push(signal);
        entered.shift()?.resolve();
        await gate.promise;
        return { draft: null };
      },
    },
    clock: () => new Date(capNow),
  });
  const next = () => {
    const gate = deferred();
    entered.push(gate);
    return gate.promise;
  };
  try {
    await saveSettings(store, { quietHours: { enabled: false } });
    await store.put(automation);
    await store.put(other);
    await check({ pilot, store, automation, other, gates, signals, next });
  } finally {
    release();
    await pilot.stopAll();
    await store.close?.();
    t.signal.removeEventListener('abort', release);
  }
};

test(
  'overlapping restarts drain the preceding owner; a queued Stop owns the terminal state',
  { timeout: 5000 },
  async (t) => {
    await heldOwners(
      t,
      async ({ pilot, automation, store, gates, signals, next }) => {
        const first = next();
        await pilot.start(automation);
        await first;
        let restarted = false;
        const restart = pilot.start(automation).then(() => {
          restarted = true;
        });
        const stopped = pilot.stop(automation);
        await turn();
        const overlapped = restarted;
        gates[0].resolve();
        await restart;
        await turn();
        gates.forEach((gate) => gate.resolve());
        await stopped;
        assert.equal(overlapped, false);
        assert.ok(signals.every((signal) => signal?.aborted));
        assert.equal(
          (await store.get(autopilotId(automation))).status,
          'stopped'
        );
      }
    );
  }
);

test(
  'a held owner does not block another automation; shutdown signals every owner before draining',
  { timeout: 5000 },
  async (t) => {
    await heldOwners(
      t,
      async ({ pilot, automation, other, gates, signals, next }) => {
        const first = next();
        await pilot.start(automation);
        await first;
        const second = next();
        await pilot.start(other);
        await second;
        let drained = false;
        const stopping = Promise.resolve(pilot.stopAll()).then(() => {
          drained = true;
        });
        await turn();
        const aborted = signals.every((signal) => signal?.aborted);
        const premature = drained;
        gates.forEach((gate) => gate.resolve());
        await stopping;
        assert.equal(aborted, true);
        assert.equal(premature, false);
        await assert.rejects(pilot.start(automation), /owner closed/u);
      }
    );
  }
);

test(
  'Stop between ordered reply effects retains the acknowledged sticker without sending text',
  { timeout: 5000 },
  async (t) => {
    const store = await seedEngagement();
    const entered = deferred();
    const release = deferred();
    const automation = { ...engagementPreset(), mode: 'auto' };
    const calls = [];
    const runner = createAutomationRunner({
      store,
      sleep: async () => {},
      send: async (draft) => {
        calls.push(draft);
        entered.resolve();
        await release.promise;
        return { via: 'api', result: 919 };
      },
    });
    let pilot;
    let stopping;
    t.signal.addEventListener('abort', () => release.resolve(), { once: true });
    try {
      await saveSettings(store, { quietHours: { enabled: false } });
      await store.put(automation);
      const planned = await runner.plan(automation, {
        targets: [{ source: 'vk', chat: '41' }],
      });
      assert.equal(planned.drafts.length, 1);
      pilot = createAutopilot({
        store,
        runner: { ...runner, next: async () => ({ draft: planned.drafts[0] }) },
      });
      await pilot.start(automation);
      await entered.promise;
      stopping = pilot.stop(automation);
      await turn();
      release.resolve();
      await stopping;
      assert.equal(calls.length, 1);
      assert.equal(calls[0].sticker.id, '59431');
      const receipts = await store.query((link) =>
        link.id?.startsWith('outbox:')
      );
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].status, 'sent');
      assert.equal(receipts[0].vkReceipt.id, 'msg:vk:919');
      assert.equal(
        (await store.get(autopilotId(automation))).status,
        'stopped'
      );
    } finally {
      release.resolve();
      await stopping;
      await pilot?.stopAll();
      await runner.close();
      await store.close?.();
    }
  }
);

test(
  'ordinary Stop permits a fresh explicitly started owner',
  { timeout: 5000 },
  async (t) => {
    await heldOwners(t, async ({ pilot, automation, gates, signals, next }) => {
      const first = next();
      await pilot.start(automation);
      await first;
      const stopped = pilot.stop(automation);
      await turn();
      gates[0].resolve();
      await stopped;
      await turn();
      const second = next();
      const restarted = await pilot.start(automation);
      await second;
      assert.equal(restarted.on, true);
      assert.equal(gates.length, 2);
      assert.equal(signals[1]?.aborted ?? false, false);
      const finalStop = pilot.stop(automation);
      gates[1].resolve();
      await finalStop;
    });
  }
);
