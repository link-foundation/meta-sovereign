import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';

const salary = {
  enabled: true,
  approved: true,
  defaultCurrency: 'USD',
  currencies: [{ code: 'USD', keywords: ['USD', '$'], net: 6000, gross: 7100 }],
};
const question = 'What salary in USD net and gross do you expect?';

test('both requested bases remain explicitly labeled in the question language', () => {
  for (const [text, expected] of [
    [question, 'From $7 100 gross per month ($6 000 net).'],
    [
      'What salary in USD net or gross do you expect?',
      'From $7 100 gross per month ($6 000 net).',
    ],
    [
      'Ваши зарплатные ожидания в USD до вычета налогов и на руки?',
      'От $7 100 в месяц до вычета налогов ($6 000 на руки).',
    ],
  ]) {
    const answer = planAnswer(text, { salary });
    assert.equal(answer.text, expected);
    assert.equal(answer.complete, true);
    assert.equal(answer.requiresReview, false);
    assert.equal(answer.salary.basis, 'both');
    assert.deepEqual(answer.salary.amounts, { net: 6000, gross: 7100 });
  }
});

test('both hourly amounts round independently and keep the requested period', () => {
  const answer = planAnswer(
    'What hourly salary in USD net and gross do you expect?',
    { salary }
  );
  assert.equal(answer.text, 'From $45 gross per hour ($40 net).');
  assert.deepEqual(answer.salary.amounts, { net: 40, gross: 45 });
  const ambiguous = planAnswer(
    'What hourly and monthly salary in USD net and gross do you expect?',
    { salary }
  );
  assert.equal(ambiguous.complete, false);
  assert.equal(ambiguous.requiresReview, true);
});

test('both-basis calculation retains evidence and cannot hide missing, stale or unapproved values', () => {
  const calculated = {
    ...salary,
    currencies: [{ ...salary.currencies[0], grossMethod: 'company' }],
    taxes: { company: { payout: 0.05, bands: [{ upTo: null, rate: 0.2 }] } },
  };
  const answer = planAnswer(question, { salary: calculated });
  assert.equal(answer.text, 'From $7 900 gross per month ($6 000 net).');
  assert.equal(answer.salary.calculation.method, 'company');
  for (const [field, missing] of [
    ['net', 'salary_net_usd'],
    ['gross', 'salary_gross_usd'],
  ]) {
    const incomplete = planAnswer(question, {
      salary: {
        ...salary,
        currencies: [{ ...salary.currencies[0], [field]: undefined }],
      },
    });
    assert.equal(incomplete.complete, false);
    assert.equal(incomplete.requiresReview, true);
    assert.ok(incomplete.missing.includes(missing));
  }
  assert.equal(
    planAnswer(question, { salary: { ...salary, approved: false } })
      .requiresReview,
    true
  );
  const stale = planAnswer(question, {
    salary: {
      ...salary,
      currencies: [{ ...salary.currencies[0], grossMethod: 'personal' }],
      taxes: {
        personal: { currency: 'RUB', bands: [{ upTo: null, rate: 0.13 }] },
      },
      exchange: {
        base: 'RUB',
        rates: [{ code: 'USD', rate: 84 }],
        asOf: '2000-01-01',
        source: 'manual',
      },
    },
  });
  assert.equal(stale.complete, false);
  assert.deepEqual(stale.missing, ['salary_exchange_stale']);
});

test('a dual-basis answer cannot choose a single ambiguous form band or bypass rejected wording', () => {
  const choice = planAnswer(question, {
    salary,
    options: ['USD 5000–7000', 'USD 7001–8000'],
  });
  assert.equal(choice.complete, false);
  assert.equal(choice.optionMismatch, true);
  const rejected = planAnswer(question, {
    salary,
    policy: { rejected: ['From $7 100 gross per month ($6 000 net).'] },
  });
  assert.equal(rejected.text, '');
  assert.equal(rejected.requiresReview, true);
});
