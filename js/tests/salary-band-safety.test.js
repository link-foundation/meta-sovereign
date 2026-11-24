import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { assertQuestionPreviewSurfaces } from './helpers/question-surfaces.mjs';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  bandSalary as salary,
  bandQuestion as question,
  bandChoices as options,
  bandMixedChoices,
  bandSavedRule,
} from '../../experiments/issue-56/salary-band-safety-fixture.mjs';

const assertHeld = (result) => {
  assert.equal(result.text, '');
  assert.equal(result.complete, false);
  assert.equal(result.requiresReview, true);
};

test('a specific approved salary amount is not silently replaced by a default chat band', () => {
  for (const amount of ['USD 4000', 'USD 4k', 'USD 4 thousand']) {
    const rules = [bandSavedRule(`From ${amount} net per month.`)];
    const saved = JSON.stringify(rules);
    const result = planAnswer(question, { salary, options, rules });
    assertHeld(result);
    if (amount === 'USD 4000') {
      assert.equal(result.salary.savedAmountConflict, true);
    }
    assert.equal(JSON.stringify(rules), saved);
  }
});

test('current templates, matching amounts and old offered bands retain numeric target decisions', () => {
  for (const text of [
    'From USD 6000 net per month.',
    'From {{salary_net}} net per month.',
    options[0],
    `${options[0]}.`,
  ]) {
    const result = planAnswer(question, {
      salary,
      options,
      rules: [bandSavedRule(text)],
    });
    assert.equal(result.text, options[1], text);
    assert.equal(result.requiresReview, false, text);
  }
  for (const rule of [
    bandSavedRule(undefined, { sources: ['telegram'] }),
    bandSavedRule(undefined, { enabled: false }),
    bandSavedRule(undefined, {
      question: 'What salary in EUR net do you expect?',
    }),
  ]) {
    assert.equal(
      planAnswer(question, {
        salary,
        options,
        rules: [rule],
        source: 'hh',
        approximate: false,
      }).text,
      options[1]
    );
  }
});

test('mixed-currency numeric bands cannot become a unique automatic option by filtering', () => {
  for (const other of [
    bandMixedChoices[1],
    'EUR 0–4000',
    'eur 0–4000',
    'JPY 0–4000',
    '0 EUR–4000 EUR',
  ]) {
    for (const questionMode of ['chat', 'field']) {
      assertHeld(
        planAnswer(question, {
          salary,
          options: [bandMixedChoices[0], other],
          questionMode,
        })
      );
    }
  }
  assert.equal(
    planAnswer(question, {
      salary,
      options: ['USD 5000–8000', 'Own variant'],
    }).text,
    'USD 5000–8000'
  );
});

test('reviewed forms use current targets over saved bands but hold mixed currencies', async () => {
  const store = createMemoryStore();
  await store.put(bandSavedRule());
  const planned = async (labels) =>
    planFormAnswers(store, {
      salary,
      inspection: inspection([
        field(question, {
          type: 'select',
          options: labels.map((label, index) => ({
            label,
            value: String(index),
            disabled: false,
          })),
        }),
      ]),
    });
  const current = await planned(options);
  assert.deepEqual(current.fields[0].answer.proposal, {
    value: '1',
    option: options[1],
  });
  assert.equal(current.fields[0].answer.requiresReview, true);
  const mixed = await planned(bandMixedChoices);
  assert.equal(mixed.fields[0].answer.proposal, null);
  assertHeld(mixed.fields[0].answer);
});

test(
  'saved-amount chat conflicts survive CLI, offline and both Lino previews',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await store.put(bandSavedRule());
    await store.put(
      normalizeAutomation({
        id: 'band-safety',
        action: { kind: 'answer-questions', salary },
      })
    );
    const saved = JSON.stringify(await store.query(() => true));
    await assertQuestionPreviewSurfaces({
      store,
      automationId: 'band-safety',
      input: { question, salary, options },
      verify: assertHeld,
    });
    assert.equal(JSON.stringify(await store.query(() => true)), saved);
  }
);
