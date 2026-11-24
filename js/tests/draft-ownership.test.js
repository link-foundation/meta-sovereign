import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  normalizeAutomation,
  planAutomation,
} from '../src/automation/automations.js';
import { queueDrafts } from '../src/automation/drafts.js';

const sources = ['hh', 'telegram', 'vk', 'email', 'whatsapp'];
const at = '2026-11-17T12:00:00.000Z';
const automation = normalizeAutomation({
  id: 'draft-ownership',
  conditions: { personal: false, mutual: false, lastFrom: 'any' },
  action: {
    templates: { informal: 'Automatic text', formal: 'Automatic text' },
  },
});
const plannedDraft = (source) => {
  const result = planAutomation([], automation, {
    targets: [{ source, chat: '201' }],
    now: Date.parse(at),
  });
  assert.equal(result.drafts.length, 1, source);
  return result.drafts[0];
};

test(
  'a delayed ordinary plan retains the pending owner draft across providers',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    try {
      for (const source of sources) {
        const stale = plannedDraft(source);
        const owner = {
          ...stale,
          text: 'Keep the owner’s wording',
          form: 'formal',
          status: 'pending',
          createdAt: '2026-11-17T11:59:00.000Z',
        };
        await store.put(owner);
        const queued = await queueDrafts(store, automation, [stale], at);
        assert.deepEqual(queued, [owner], source);
        assert.deepEqual(await store.get(stale.id), owner, source);
      }
    } finally {
      await store.close?.();
    }
  }
);

test(
  'overlapping draft queues retain the first pending preview and acknowledge it to both callers',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    try {
      for (const source of sources) {
        const stale = plannedDraft(source);
        const owner = {
          ...stale,
          text: 'First reviewed wording',
          form: 'formal',
        };
        const [first, second] = await Promise.all([
          queueDrafts(store, automation, [owner], at),
          queueDrafts(store, automation, [stale], at),
        ]);
        const saved = await store.get(stale.id);
        assert.equal(saved.text, owner.text, source);
        assert.equal(saved.form, owner.form, source);
        assert.equal(saved.createdAt, at, source);
        assert.equal(first[0].text, saved.text, source);
        assert.equal(second[0].text, saved.text, source);
      }
    } finally {
      await store.close?.();
    }
  }
);

test(
  'a refused draft write rejects its caller and does not poison later queue operations',
  { timeout: 5000 },
  async () => {
    const memory = createMemoryStore();
    const draft = plannedDraft('telegram');
    let refuse = true;
    const store = {
      ...memory,
      put: async (record) => {
        if (record.id === draft.id && refuse) {
          refuse = false;
          throw new Error('Synthetic disk refusal');
        }
        return memory.put(record);
      },
    };
    try {
      await assert.rejects(
        queueDrafts(store, automation, [draft], at),
        /disk refusal/u
      );
      assert.equal(await memory.get(draft.id), null);
      const queued = await queueDrafts(store, automation, [draft], at);
      assert.equal(queued[0].text, draft.text);
      assert.equal((await memory.get(draft.id)).status, 'pending');
    } finally {
      await memory.close?.();
    }
  }
);
