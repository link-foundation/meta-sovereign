import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { approvedBrowserPlan } from '../src/automation/question-browser-plan.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  salaryBothQuestion as question,
  salaryBothChoices as options,
  salaryOptionConfig,
} from '../../experiments/issue-56/salary-option-fixture.mjs';
import { nearestBasesSalary as salary } from '../../experiments/issue-56/salary-nearest-bases-fixture.mjs';

const reviewed = (result, choice = options[0]) => {
  assert.equal(result.text, choice);
  assert.equal(result.complete, true);
  assert.equal(result.requiresReview, true);
  assert.deepEqual(result.salary.option, { choice, contained: false });
  assert.equal(approvedBrowserPlan(result), false);
};

test('both salary bases can propose their same unique nearest band only for form review', () => {
  reviewed(planAnswer(question, { salary, options, questionMode: 'field' }));
  const chat = planAnswer(question, { salary, options });
  assert.equal(chat.complete, false);
  assert.equal(chat.requiresReview, true);
  assert.equal(approvedBrowserPlan(chat), false);
});

test('a contained salary basis can agree with the other basis nearest reviewed band', () => {
  const choices = ['USD 0–5000', 'USD 6500–8000'];
  reviewed(
    planAnswer(question, {
      salary: salaryOptionConfig,
      options: choices,
      questionMode: 'field',
    }),
    choices[1]
  );
});

test('dual-basis nearest selection holds ties, different picks, overlaps and incompatible units', () => {
  for (const options of [
    ['USD 0–5000', 'USD 8000–10000'],
    ['USD 0–4000', 'USD 8000–10000'],
    ['USD 5000–7000', 'USD 5500–8000'],
    ['EUR 5000–8000'],
    ['USD 5000–8000 net'],
    ['USD 5000–8000 per hour'],
    ['USD 5000–8000', 'EUR 5000–8000'],
  ]) {
    const result = planAnswer(question, {
      salary: salaryOptionConfig,
      options,
      questionMode: 'field',
    });
    assert.equal(result.complete, false, options.join(', '));
    assert.equal(result.requiresReview, true);
    assert.equal(approvedBrowserPlan(result), false);
  }
});

test('native form plans preserve review and owner values for dual-basis nearest choices', async () => {
  const store = createMemoryStore();
  const select = field(question, {
    type: 'select',
    options: options.map((label, index) => ({
      label,
      value: String(index),
      disabled: false,
    })),
  });
  const original = JSON.stringify(select);
  const result = await planFormAnswers(store, {
    inspection: inspection([select]),
    salary,
  });
  const answer = result.fields[0].answer;
  reviewed(answer);
  assert.equal(answer.reuseRequiresReview, true);
  assert.deepEqual(answer.proposal, { value: '0', option: options[0] });
  assert.equal(JSON.stringify(select), original);
  assert.deepEqual(await store.query(() => true), []);
});
