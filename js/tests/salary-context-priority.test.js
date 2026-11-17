import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { normalizeSalary } from '../src/automation/salary-config.js';
import { assertStoredSalaryPreviews } from './helpers/salary-preview-surfaces.mjs';
import {
  prioritySalary as salary,
  priorityQuestion as question,
  priorityVacancy as vacancy,
  priorityExpected as expected,
} from '../../experiments/issue-56/salary-priority-fixture.mjs';

test('owner context priority resolves competing vacancy clues while retaining independent targets', () => {
  for (const source of ['hh', 'linkedin', 'telegram', 'vk', 'x']) {
    const result = planAnswer(question, { salary, vacancy, source });
    assert.equal(result.text, expected, source);
    assert.equal(result.requiresReview, false);
    assert.equal(result.salary.currency, 'USDT');
    assert.deepEqual(result.contexts.at(-1), {
      key: 'salary_currency',
      choice: 'USDT',
      source: 'vacancy-description',
      evidence: vacancy.evidence,
    });
  }
  const configured = normalizeSalary(salary);
  assert.equal(configured.currencies.at(-1).contextPriority, 10);
  for (const value of [-1, 1001, 1.5, '10', NaN, Infinity]) {
    assert.throws(() =>
      normalizeSalary({
        ...salary,
        currencies: [{ ...salary.currencies[0], contextPriority: value }],
      })
    );
  }
});

test('explicit questions beat contextual priorities and conflicting explicit currencies stay open', () => {
  assert.equal(
    planAnswer('What salary in USD do you expect?', { salary, vacancy }).text,
    'From $6 000 net per month.'
  );
  const ambiguous = planAnswer('What salary in USD or USDT do you expect?', {
    salary,
    vacancy,
  });
  assert.equal(ambiguous.complete, false);
  assert.equal(ambiguous.requiresReview, true);
  const missing = planAnswer(question, {
    salary: {
      ...salary,
      currencies: salary.currencies.map((entry) =>
        entry.code === 'USDT' ? { ...entry, net: undefined } : entry
      ),
    },
    vacancy,
  });
  assert.equal(missing.complete, false);
  assert.equal(missing.requiresReview, true);
  assert.ok(!missing.text.includes('$6 000'));
});

test('configured word stems match inflections without turning short codes or interior words into currencies', () => {
  for (const description of [
    'Криптовалютная биржа, выплаты в USD',
    'Cryptocurrency services, USD',
  ]) {
    assert.equal(
      planAnswer(question, { salary, vacancy: { description } }).text,
      expected
    );
  }
  for (const description of [
    'рубрикатор',
    'definitions',
    'antiblockchainwork',
    'USDTX',
  ]) {
    assert.equal(
      planAnswer(question, { salary, vacancy: { description } }).salary
        .currency,
      'RUB'
    );
  }
  assert.equal(
    planAnswer(question, { salary, vacancy: { description: 'USDT' } }).salary
      .currency,
    'USDT'
  );
});

test('context priority preserves source precedence, tied priorities, unknown currencies and unrelated-topic barriers', () => {
  const selected = (extra) =>
    planAnswer(question, { salary, vacancy, ...extra });
  assert.equal(
    selected({ vacancy: { ...vacancy, pay: 'USD 5000' } }).salary.currency,
    'USD'
  );
  assert.equal(
    selected({ vacancy: { ...vacancy, pay: '$5000' } }).salary.currency,
    'USD'
  );
  assert.equal(
    selected({ recent: ['My salary expectations are in EUR.'] }).salary
      .currency,
    'EUR'
  );
  assert.equal(selected({ intro: 'Salary in RUB' }).salary.currency, 'RUB');
  const tied = selected({
    salary: {
      ...salary,
      currencies: salary.currencies.map((entry) => ({
        ...entry,
        contextPriority: 0,
      })),
    },
  });
  assert.equal(tied.complete, false);
  assert.equal(tied.requiresReview, true);
  assert.equal(
    selected({ vacancy: { description: 'Blockchain, paid in GBP' } }).complete,
    false
  );
  assert.equal(
    selected({
      recent: [
        'What is the USD payroll budget?',
        'My salary expectations are in EUR.',
      ],
    }).salary.currency,
    'USDT'
  );
  assert.equal(
    selected({ salary: { ...salary, approved: false } }).requiresReview,
    true
  );
});

test(
  'stored contextual priority remains available through CLI, offline and both Lino previews',
  { timeout: 15000 },
  async () => {
    await assertStoredSalaryPreviews({
      id: 'salary-context-priority',
      salary,
      question: 'What salary do you expect for blockchain projects?',
      verify(result) {
        assert.equal(result.text, expected);
        assert.equal(result.requiresReview, false);
      },
    });
  }
);
