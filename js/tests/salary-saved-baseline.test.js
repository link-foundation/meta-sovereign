import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { approvedBrowserPlan } from '../src/automation/question-browser-plan.js';
import { assertStoredSalaryPreviews } from './helpers/salary-preview-surfaces.mjs';
import {
  savedBaselineInput as input,
  savedBaselineRule,
} from '../../experiments/issue-56/salary-saved-baseline-fixture.mjs';

const selected = (result) => {
  assert.equal(result.text, input.options[2]);
  assert.equal(result.salary.currency, 'RUB');
  assert.equal(result.salary.amount, 450000);
  assert.equal(result.salary.baseline.source, 'saved-answer');
  assert.equal(result.requiresReview, false);
  assert.equal(result.complete, true);
};

test('an approved expanded salary answer supplies a missing numeric choice baseline', () => {
  for (const questionMode of [undefined, 'field']) {
    const parameters = { ...input, questionMode };
    const original = JSON.stringify(parameters);
    const result = planAnswer(input.question, parameters);
    selected(result);
    assert.equal(approvedBrowserPlan(result), true);
    assert.equal(JSON.stringify(parameters), original);
  }
});

test(
  'saved salary baselines share read-only CLI, offline and both Lino previews',
  { timeout: 15000 },
  async () => {
    await assertStoredSalaryPreviews({
      ...input,
      id: 'saved-baseline',
      verify: selected,
    });
  }
);

test('configured targets take precedence and disabled salary configuration stays disabled', () => {
  const salary = {
    enabled: true,
    approved: true,
    currencies: [{ code: 'RUB', keywords: ['RUB'], net: 150000 }],
  };
  const field = planAnswer(input.question, {
    ...input,
    salary,
    questionMode: 'field',
  });
  assert.equal(field.text, input.options[1]);
  assert.equal(field.salary.amount, 150000);
  assert.equal(field.salary.baseline, undefined);
  const chat = planAnswer(input.question, { ...input, salary });
  assert.equal(chat.salary.savedAmountConflict, true);
  assert.equal(approvedBrowserPlan(chat), false);
  const missing = {
    ...salary,
    currencies: [{ code: 'RUB', keywords: ['RUB'] }],
  };
  selected(planAnswer(input.question, { ...input, salary: missing }));
  const disabled = planAnswer(input.question, {
    ...input,
    salary: { ...missing, enabled: false },
  });
  assert.equal(disabled.salary, undefined);
  assert.equal(disabled.requiresReview, true);
  const unapproved = planAnswer(input.question, {
    ...input,
    salary: { ...missing, approved: false },
  });
  assert.equal(unapproved.requiresReview, true);
});

test('saved hourly amounts are used directly and compatible currencies stay independent', () => {
  for (const [code, amount, period] of [
    ['GBP', 30, 'hour'],
    ['JPY', 400000, 'month'],
    ['USD', 6000, 'month'],
  ]) {
    const question = `What salary in ${code} net per ${period} do you expect?`;
    const result = planAnswer(question, {
      options: [`${code} up to ${amount - 1}`, `${code} ${amount} or more`],
      rules: [
        savedBaselineRule(
          `From ${amount} ${code} net per ${period}.`,
          question
        ),
      ],
    });
    assert.equal(result.salary.amount, amount);
    assert.equal(result.salary.period, period);
    assert.equal(result.salary.currency, code);
    assert.equal(result.requiresReview, false);
  }
  const question = 'What salary net do you expect?';
  const result = planAnswer(question, {
    options: ['up to 5000', '5001–7999'],
    rules: [savedBaselineRule('From USD 6000 net per month.', question)],
  });
  assert.equal(result.salary.currency, 'USD');
  assert.equal(
    result.contexts.find((item) => item.key === 'salary_currency').source,
    'saved-answer'
  );
  assert.equal(result.text, '5001–7999');
});

test('an approved literal offered answer remains literal and carries no derived baseline', () => {
  const result = planAnswer(input.question, {
    ...input,
    rules: [savedBaselineRule(input.options[2])],
  });
  assert.equal(result.text, input.options[2]);
  assert.equal(result.salary, undefined);
  assert.equal(result.requiresReview, false);
});

test('saved baselines cannot bypass configured tax failures or ambiguous question units', () => {
  const question = 'What salary in RUB gross per month do you expect?';
  const rules = [
    savedBaselineRule('From RUB 530000 gross per month.', question),
  ];
  for (const grossMethod of ['personal', 'company']) {
    const result = planAnswer(question, {
      options: ['RUB up to 500000', 'RUB over 500000'],
      questionMode: 'field',
      rules,
      salary: {
        enabled: true,
        approved: true,
        currencies: [
          { code: 'RUB', keywords: ['RUB'], net: 450000, grossMethod },
        ],
      },
    });
    assert.equal(result.requiresReview, true);
    assert.deepEqual(result.missing, [`salary_tax_${grossMethod}`]);
    assert.equal(result.salary.baseline, undefined);
  }
  for (const question of [
    'What salary in RUB net and gross do you expect?',
    'What salary in RUB net per hour and month do you expect?',
  ]) {
    const result = planAnswer(question, {
      ...input,
      rules: [savedBaselineRule(input.rules[0].answers[0].text, question)],
    });
    assert.equal(result.requiresReview, true);
    assert.equal(result.salary.baseline, undefined);
    assert.equal(approvedBrowserPlan(result), false);
  }
});

test('saved salary choices require one approved compatible amount and never invent conversions', () => {
  for (const [question, text, extra] of [
    [input.question, 'От 400 000 до 500 000 ₽ в месяц на руки.'],
    [input.question, '450000 в месяц на руки.'],
    [input.question, '-450000 ₽ в месяц на руки.'],
    [input.question, '0 ₽ в месяц на руки.'],
    [input.question, '1000000000001 ₽ в месяц на руки.'],
    [input.question, '450000 ₽ gross per month.'],
    [input.question, '450000 ₽ net per year.'],
    [input.question, '450000 ₽ net per hour.'],
    [input.question, 'I need 450000 ₽ for relocation.'],
    [input.question, 'From USD 450000 net per month.'],
    [
      input.question,
      undefined,
      {
        rules: [
          {
            ...input.rules[0],
            answers: [
              { text: input.rules[0].answers[0].text, approved: false },
            ],
          },
        ],
      },
    ],
  ]) {
    const result = planAnswer(question, {
      ...input,
      rules: [savedBaselineRule(text, question)],
      ...extra,
    });
    assert.equal(result.requiresReview, true, text);
    assert.equal(approvedBrowserPlan(result), false, text);
  }
});
