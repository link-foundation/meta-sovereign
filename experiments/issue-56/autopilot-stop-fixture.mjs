import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createAutomationRunner } from '../../js/src/automation/runner.js';
import {
  createAutopilot,
  autopilotId,
} from '../../js/src/automation/autopilot.js';
import { saveSettings } from '../../js/src/automation/safety.js';
import { saveVkOutgoingSettings } from '../../js/src/automation/vk-outgoing-settings.js';
import {
  capAutomation,
  capNow,
  confirmedTarget,
} from './automatic-cap-fixture.mjs';

export const deferred = () => Promise.withResolvers();
export const stopFixture = async (t, source, options, check) => {
  const store = createMemoryStore();
  const gate = deferred();
  const entered = deferred();
  const stepDone = deferred();
  const effects = [];
  const states = [];
  const automation = capAutomation();
  automation.pacing = { ...automation.pacing, dailyCap: 10, typing: true };
  const issue = async (draft) => {
    effects.push(draft);
    if (options.phase === 'send') {
      entered.resolve();
      await gate.promise;
      if (options.unknown) {
        throw Object.assign(new Error('Provider reply lost'), {
          ambiguous: true,
        });
      }
    }
    return { via: 'fixture', id: '71' };
  };
  const runner = createAutomationRunner({
    store,
    clock: () => new Date(capNow),
    send: issue,
    sleep: async (_ms, _value, { signal } = {}) => {
      if (options.phase === 'typing' || options.phase === 'vk-queue') {
        entered.resolve({ signal });
        await gate.promise;
      }
    },
  });
  const pilot = createAutopilot({
    store,
    runner: {
      load: runner.load,
      next: async () => {
        if (options.phase === 'plan') {
          entered.resolve();
          await gate.promise;
        }
        return { draft };
      },
      deliverDraft: async (...args) => {
        try {
          return await runner.deliverDraft(...args);
        } finally {
          stepDone.resolve();
        }
      },
    },
    clock: () => new Date(capNow),
    sleep: async (_ms, signal) => {
      if (!signal.aborted) {
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
      }
    },
  });
  let draft;
  let stopping;
  const release = () => gate.resolve();
  t.signal.addEventListener('abort', release, { once: true });
  try {
    await saveSettings(store, { quietHours: { enabled: false } });
    await store.put(automation);
    if (source === 'vk') {
      await saveVkOutgoingSettings(store, {
        enabled: options.phase === 'vk-queue',
      });
    }
    draft = (await confirmedTarget(runner, automation, source, '202'))
      .confirmed[0];
    const put = store.put.bind(store);
    store.put = async (link) => {
      if (link.id === autopilotId(automation)) {
        states.push(link.status);
      }
      return put(link);
    };
    if (options.phase === 'flush') {
      store.flush = async () => {
        const records = await store.query((link) =>
          link.id?.startsWith('outbox:')
        );
        if (records.some((record) => record.status === 'sending')) {
          entered.resolve();
          await gate.promise;
        }
      };
    }
    await pilot.start(automation);
    await entered.promise;
    let settled = false;
    stopping = options.all ? pilot.stopAll() : pilot.stop(automation);
    const pending = Promise.resolve(stopping).then(() => {
      settled = true;
    });
    await turn();
    const premature = settled;
    release();
    await pending;
    if (options.phase !== 'plan') {
      await stepDone.promise;
    }
    await turn();
    await check({ effects, store, automation, states, premature, draft });
  } finally {
    release();
    await stopping;
    await pilot.stop(automation);
    await pilot.stopAll();
    await runner.close();
    await store.close?.();
    t.signal.removeEventListener('abort', release);
  }
};

export const stoppedState = async ({ store, automation, states }) => {
  const state = await store.get(autopilotId(automation));
  assert.equal(state.on, false);
  assert.equal(state.status, 'stopped');
  assert.equal(state.current, null);
  assert.equal(state.nextAt, null);
  assert.equal(states.at(-1), 'stopped');
};
