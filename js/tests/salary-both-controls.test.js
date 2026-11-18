import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { assertQuestionPreviewSurfaces } from './helpers/question-surfaces.mjs';

const question = 'What salary in USD net and gross do you expect?';
const salary = {
  enabled: true,
  approved: true,
  defaultCurrency: 'USD',
  currencies: [{ code: 'USD', keywords: ['USD'], net: 6000, gross: 7100 }],
};
const expected = 'From $7 100 gross per month ($6 000 net).';
const definition = {
  id: 'both-bases',
  action: { kind: 'answer-questions', salary },
  conditions: { mutual: false, cooldownDays: 0 },
  pacing: { typing: true },
};

test(
  'CLI, offline UI and both Lino APIs produce the same complete dual-basis answer',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await store.put(normalizeAutomation(definition));
    await assertQuestionPreviewSurfaces({
      store,
      automationId: 'both-bases',
      input: { question, salary },
      verify(answer) {
        assert.equal(answer.text, expected);
        assert.equal(answer.requiresReview, false);
        assert.deepEqual(answer.salary.amounts, { net: 6000, gross: 7100 });
      },
    });
  }
);

test(
  'changing either amount after typing prevents a dual-basis delivery and outbox claim',
  { timeout: 5000 },
  async () => {
    for (const basis of ['net', 'gross']) {
      const store = createMemoryStore();
      const automation = normalizeAutomation(definition);
      await store.put(automation);
      await store.put({
        id: 'msg:hh:1:1',
        source: 'hh',
        chat: '1',
        sender: 'them',
        body: question,
        timestamp: '2026-11-09T10:00:00Z',
      });
      let sent = 0;
      const runner = createAutomationRunner({
        store,
        self: ['me'],
        sleep: async () =>
          store.put({
            ...automation,
            action: {
              ...automation.action,
              salary: {
                ...salary,
                currencies: [{ ...salary.currencies[0], [basis]: 8000 }],
              },
            },
          }),
        send: async () => {
          sent++;
          return { status: 'sent' };
        },
      });
      const planned = await runner.plan(automation, {
        targets: [{ source: 'hh', chat: '1' }],
      });
      assert.equal(planned.drafts[0].text, expected);
      const result = await runner.deliverDraft(automation, planned.drafts[0]);
      assert.equal(result.code, 'answer-review-required');
      assert.equal(sent, 0);
      assert.equal(
        (await store.query((link) => link.id?.startsWith('outbox:'))).length,
        0
      );
    }
  }
);
