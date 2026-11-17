import assert from 'node:assert/strict';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { normalizeAutomation } from '../../js/src/automation/automations.js';
import { createAutomationRunner } from '../../js/src/automation/runner.js';
import { saveSettings } from '../../js/src/automation/safety.js';
import { createPacedSender } from '../../js/src/automation/paced-send.js';
import { createDelivery } from '../../js/src/automation/deliver.js';
import { vkOutgoingFor } from '../../js/src/automation/vk-outgoing-queue.js';

export const automaticSources = ['hh', 'telegram', 'vk', 'email', 'whatsapp'];
export const capNow = '2026-11-17T12:00:00.000Z';
export const capAutomation = (id = 'shared-cap') =>
  normalizeAutomation({
    id,
    mode: 'auto',
    conditions: { personal: false, mutual: false, lastFrom: 'any' },
    action: {
      templates: { informal: 'Reviewed text', formal: 'Reviewed text' },
    },
    pacing: { dailyCap: 1, typing: false, minDelayMs: 0, maxDelayMs: 0 },
  });

export const withAutomaticCap = async (check, send) => {
  const store = createMemoryStore();
  const effects = [];
  const runners = [];
  const automation = capAutomation();
  const issue = async (draft) => {
    effects.push(draft);
    return send ? send(draft) : { via: 'fixture' };
  };
  const runner = () => {
    const result = createAutomationRunner({
      store,
      clock: () => new Date(capNow),
      sleep: async () => {},
      send: issue,
    });
    runners.push(result);
    return result;
  };
  const paced = () =>
    createPacedSender({
      store,
      clock: () => new Date(capNow),
      sleep: async () => {},
      random: () => 0,
      deliver: createDelivery({
        store,
        send: issue,
        showTyping: async () => {},
        clock: () => new Date(capNow),
        nowIso: () => capNow,
        log: () => {},
        outgoing: vkOutgoingFor(store),
      }),
    });
  try {
    await saveSettings(store, { quietHours: { enabled: false } });
    await store.put(automation);
    return await check({ store, effects, automation, runner, paced });
  } finally {
    for (const active of runners) {
      await active.close();
    }
    await store.close?.();
  }
};

export const confirmedTarget = async (runner, automation, source, chat) => {
  const targets = [{ source, chat }];
  const planned = await runner.plan(automation, { targets });
  assert.equal(planned.drafts.length, 1, 'positive eligible baseline');
  return { targets, confirmed: planned.drafts };
};
