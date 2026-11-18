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
  salaryOptionConfig as salary,
  salaryBothQuestion as question,
  salaryBothChoices as choices,
  salaryGapChoices,
} from '../../experiments/issue-56/salary-option-fixture.mjs';

test('both configured salary bases choose the same unique containing band', () => {
  const result = planAnswer(question, { salary, options: choices });
  assert.equal(result.text, choices[0]);
  assert.equal(result.complete, true);
  assert.equal(result.requiresReview, false);
  assert.deepEqual(result.salary.amounts, { net: 6000, gross: 7100 });
  const explicit = 'USD 5k–8k net and gross';
  assert.equal(
    planAnswer(question, { salary, options: [explicit] }).text,
    explicit
  );
  assert.equal(
    planAnswer(question, {
      salary,
      options: choices,
      rules: [
        {
          question,
          answers: [{ text: 'USD 4000–5000', count: 20, approved: true }],
        },
      ],
    }).text,
    choices[0]
  );
  for (const options of [
    ['USD 5000–7000', 'USD 7001–8000'],
    ['USD 5000–8000', 'USD 5500–9000'],
    ['USD 5000–8000 net'],
    ['USD 5000–8000 gross'],
    ['EUR 5000–8000'],
    ['USD 5000–8000 per hour'],
  ]) {
    const held = planAnswer(question, { salary, options });
    assert.equal(held.complete, false, options.join(','));
    assert.equal(held.requiresReview, true);
  }
  assert.equal(
    planAnswer(question, {
      salary: { ...salary, approved: false },
      options: choices,
    }).requiresReview,
    true
  );
  const rejected = planAnswer(question, {
    salary,
    options: choices,
    policy: { rejected: [choices[0]] },
  });
  assert.equal(rejected.complete, false);
  assert.equal(rejected.text, '');
});

test('nearest salary bands require form review while chat gaps and form ties stay open', () => {
  const question = 'What salary in USD net do you expect?';
  const input = { salary, options: salaryGapChoices };
  assert.equal(planAnswer(question, input).complete, false);
  const proposed = planAnswer(question, { ...input, questionMode: 'field' });
  assert.equal(proposed.text, salaryGapChoices[1]);
  assert.equal(proposed.complete, true);
  assert.equal(proposed.requiresReview, true);
  assert.deepEqual(proposed.salary.option, {
    choice: salaryGapChoices[1],
    contained: false,
  });
  for (const options of [
    ['USD 0–5000', 'USD 7000–8000'],
    ['EUR 0–5000', 'EUR 6500–8000'],
    ['USD 0–5000 gross', 'USD 6500–8000 gross'],
    ['USD 0–5000 per hour', 'USD 6500–8000 per hour'],
    ['USD 5000–7000', 'USD 5500–8000'],
  ]) {
    const held = planAnswer(question, {
      salary,
      options,
      questionMode: 'field',
    });
    assert.equal(held.complete, false, options.join(','));
  }
  assert.equal(
    planAnswer('What salary in USD net and gross do you expect?', {
      salary,
      options: ['USD 0–5000', 'USD 8000–10000'],
      questionMode: 'field',
    }).complete,
    false
  );
});

test('salary form radios and selects propose current numeric targets and retain mandatory review', async () => {
  const store = createMemoryStore();
  const select = field(question, {
    type: 'select',
    options: choices.map((label, index) => ({
      label,
      value: String(index),
      disabled: false,
    })),
  });
  const report = inspection([select]);
  const result = await planFormAnswers(store, { inspection: report, salary });
  assert.deepEqual(result.fields[0].answer.proposal, {
    value: '0',
    option: choices[0],
  });
  assert.equal(result.fields[0].answer.requiresReview, true);
  const radioQuestion = 'What salary in USD net do you expect?';
  const radios = salaryGapChoices.map((label, index) =>
    field(label, {
      id: `frame-1:salary-${index}`,
      type: 'radio',
      name: 'salary',
      value: String(index),
      checked: false,
      group: { id: 'salary', label: radioQuestion },
    })
  );
  const nearest = await planFormAnswers(store, {
    inspection: inspection(radios),
    salary,
  });
  assert.deepEqual(
    nearest.fields.map((item) => item.answer.proposal),
    [{ checked: false }, { checked: true }]
  );
  assert.ok(
    nearest.fields.every(
      (item) => item.answer.requiresReview && item.answer.reuseRequiresReview
    )
  );
  radios[1].disabled = true;
  const disabled = await planFormAnswers(store, {
    inspection: inspection(radios),
    salary,
  });
  assert.equal(disabled.fields[1].answer.proposal, null);
  assert.deepEqual(await store.query(() => true), []);
});

test(
  'CLI, offline and both default Lino transports retain dual-basis salary range decisions',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await store.put(
      normalizeAutomation({
        id: 'salary-options',
        action: { kind: 'answer-questions', salary },
      })
    );
    const before = JSON.stringify(await store.query(() => true));
    await assertQuestionPreviewSurfaces({
      store,
      automationId: 'salary-options',
      input: { question, salary, options: choices },
      verify(answer) {
        assert.equal(answer.text, choices[0]);
        assert.equal(answer.requiresReview, false);
      },
    });
    assert.equal(JSON.stringify(await store.query(() => true)), before);
  }
);
