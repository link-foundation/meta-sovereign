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
import { overlapBandCase } from '../../experiments/issue-56/salary-band-overlap-fixture.mjs';

const { question, salary, options } = overlapBandCase;
const held = (answer) => {
  assert.equal(answer.text, '');
  assert.equal(answer.complete, false);
  assert.equal(answer.requiresReview, true);
};

test('each salary target needs a unique band before their choices can agree', () => {
  for (const choices of [
    options,
    ['USD 0–6500', 'USD 5500–8000'],
    ['USD 5000–7100', 'USD 7100 or more'],
    ['USD 0–6000', 'USD 6000–8000', 'Own variant'],
  ]) {
    for (const questionMode of ['chat', 'field']) {
      held(planAnswer(question, { salary, options: choices, questionMode }));
    }
  }
});

test('unambiguous and equal targets keep their unique containing salary band', () => {
  const safe = ['USD under 6000', 'USD 6000–8000'];
  for (const gross of [7100, 6000]) {
    const configured = {
      ...salary,
      currencies: salary.currencies.map((entry) => ({ ...entry, gross })),
    };
    const answer = planAnswer(question, { salary: configured, options: safe });
    assert.equal(answer.text, safe[1]);
    assert.equal(answer.requiresReview, false);
    assert.equal(answer.salary.option.contained, true);
  }
});

test('reviewed form choices hold a salary band that overlaps for either basis', async () => {
  const store = createMemoryStore();
  const report = await planFormAnswers(store, {
    salary,
    inspection: inspection([
      field(question, {
        type: 'select',
        options: options.map((label, index) => ({
          label,
          value: String(index),
          disabled: false,
        })),
      }),
    ]),
  });
  held(report.fields[0].answer);
  assert.equal(report.fields[0].answer.proposal, null);
});

test(
  'overlapping dual-basis review survives CLI, offline and both Lino previews',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await store.put(
      normalizeAutomation({
        id: 'band-overlap',
        action: { kind: 'answer-questions', salary },
      })
    );
    const original = JSON.stringify(await store.query(() => true));
    await assertQuestionPreviewSurfaces({
      store,
      automationId: 'band-overlap',
      input: { question, salary, options },
      verify: held,
    });
    assert.equal(JSON.stringify(await store.query(() => true)), original);
  }
);
