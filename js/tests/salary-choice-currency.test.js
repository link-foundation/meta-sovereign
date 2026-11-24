import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { approvedBrowserPlan } from '../src/automation/question-browser-plan.js';
import { assertStoredSalaryPreviews } from './helpers/salary-preview-surfaces.mjs';
import { choiceCurrencyCase as input } from '../../experiments/issue-56/salary-choice-currency-fixture.mjs';

const selected = (result) => {
  assert.equal(result.text, input.options[1]);
  assert.equal(result.salary.currency, 'USD');
  assert.equal(result.salary.amount, 6000);
  assert.equal(result.requiresReview, false);
  assert.equal(
    result.contexts.find((entry) => entry.key === 'salary_currency').source,
    'options'
  );
};

test('a unique currency in salary choices supplies the question currency', () => {
  for (const extra of [
    {},
    { recent: [{ text: 'Salary is in RUB', outgoing: false }] },
    {
      salary: {
        ...input.salary,
        defaultCurrency: 'RUB',
        currencies: [
          ...input.salary.currencies,
          { code: 'RUB', keywords: ['RUB'], net: 600000 },
        ],
      },
    },
    { questionMode: 'field' },
  ]) {
    const parameters = { ...input, ...extra };
    const original = JSON.stringify(parameters);
    const result = planAnswer(input.question, parameters);
    selected(result);
    assert.equal(approvedBrowserPlan(result), true);
    assert.equal(JSON.stringify(parameters), original);
  }
});

test('choice currency never converts explicit questions or fills missing amounts', () => {
  for (const parameters of [
    { ...input, options: ['up to 5000', '5001–7999'] },
    { ...input, options: [...input.options, 'EUR 5001–7999'] },
    { ...input, options: [...input.options, 'CHF 5001–7999'] },
    {
      ...input,
      salary: {
        ...input.salary,
        currencies: [{ code: 'USD', keywords: ['USD'] }],
      },
    },
    { ...input, question: 'What salary in EUR net do you expect?' },
  ]) {
    const result = planAnswer(parameters.question, parameters);
    assert.equal(result.complete, false);
    assert.equal(result.requiresReview, true);
    assert.equal(approvedBrowserPlan(result), false);
  }
});

test(
  'unique choice currency shares CLI, offline and both Lino previews',
  { timeout: 15000 },
  async () => {
    await assertStoredSalaryPreviews({
      ...input,
      id: 'choice-currency',
      verify: selected,
    });
  }
);
