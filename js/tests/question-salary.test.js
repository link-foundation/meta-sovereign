import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import {
  normalizeAutomation,
  planAutomation,
} from '../src/automation/automations.js';

const salary = {
  exchangeMode: 'snapshot',
  enabled: true,
  approved: true,
  defaultCurrency: 'RUB',
  defaultBasis: 'net',
  monthlyHours: 160,
  currencies: [
    {
      code: 'RUB',
      keywords: ['RUB', '₽', 'рублях', 'руб'],
      net: 450000,
      gross: 530000,
      hourlyStep: 500,
    },
    {
      code: 'USD',
      keywords: ['USD', '$', 'долларах'],
      net: 6000,
      gross: 7100,
      hourlyStep: 5,
    },
    {
      code: 'EUR',
      keywords: ['EUR', '€', 'евро'],
      net: 5500,
      gross: 6500,
      hourlyStep: 5,
    },
    {
      code: 'USDT',
      keywords: ['USDT', 'blockchain'],
      net: 6000,
      hourlyStep: 5,
    },
  ],
};
const options = { salary };
const oldRule = (question, text) => ({
  id: 'qa-rule:old-pay',
  question,
  answers: [{ text, approved: true, count: 10 }],
});

test('salary uses independent currency and tax targets in the question language', () => {
  assert.equal(
    planAnswer('What salary in USD before taxes do you expect?', options).text,
    'From $7 100 gross per month.'
  );
  assert.equal(
    planAnswer('Ваши зарплатные ожидания на руки?', options).text,
    'От 450 000 ₽ в месяц на руки.'
  );
  assert.equal(
    planAnswer('Ваши зарплатные ожидания в долларах?', options).text,
    'От $6 000 в месяц на руки.'
  );
  assert.equal(
    planAnswer('What salary in USDT do you expect?', options).text,
    'From 6 000 USDT net per month.'
  );
  const missing = planAnswer(
    'What salary in USDT before taxes do you expect?',
    options
  );
  assert.equal(missing.complete, false);
  assert.equal(missing.requiresReview, true);
  assert.ok(missing.missing.includes('salary_gross_usdt'));
  assert.ok(!missing.text.includes('530'));
});

test('hourly targets use configured hours and upward currency-specific rounding', () => {
  assert.equal(
    planAnswer('Какую почасовую ставку (руб/час) рассматриваете?', options)
      .text,
    'От 3 000 ₽ в час на руки.'
  );
  assert.equal(
    planAnswer('What hourly rate in USD do you expect?', options).text,
    'From $40 net per hour.'
  );
  const config = { ...salary, monthlyHours: 187.5 };
  assert.equal(
    planAnswer('Ваши почасовые зарплатные ожидания?', { salary: config }).text,
    'От 2 500 ₽ в час на руки.'
  );
  for (const [hourly, expected] of [
    [2499.99, '2 500 ₽'],
    [2500, '2 500 ₽'],
    [2500.01, '3 000 ₽'],
  ]) {
    const currencies = [{ ...salary.currencies[0], net: hourly * 160 }];
    assert.ok(
      planAnswer('Какую почасовую ставку в рублях ожидаете?', {
        salary: { ...salary, currencies },
      }).text.includes(expected)
    );
  }
  const unavailable = planAnswer('What hourly rate in USD do you expect?', {
    salary: { ...salary, monthlyHours: null },
  });
  assert.equal(unavailable.complete, false);
  const overflow = planAnswer('What hourly rate in USD do you expect?', {
    salary: { ...salary, monthlyHours: 1e-300 },
  });
  assert.equal(overflow.complete, false);
  assert.equal(overflow.requiresReview, true);
  assert.ok(!overflow.text.includes('∞'));
});

test('short salary follow-ups inherit only the nearest related tax basis and period', () => {
  const previous = 'What hourly rate in USD do you expect before taxes?';
  assert.equal(
    planAnswer('And in EUR?', { ...options, recent: [previous] }).text,
    'From 45 € gross per hour.'
  );
  assert.equal(
    planAnswer('А в рублях?', {
      ...options,
      recent: ['Ваши зарплатные ожидания в долларах до вычета налогов?'],
    }).text,
    'От 530 000 ₽ в месяц до вычета налогов.'
  );
  assert.equal(
    planAnswer('USD gross?', {
      ...options,
      recent: ['Ваши зарплатные ожидания?'],
    }).text,
    'От $7 100 в месяц до вычета налогов.'
  );
  for (const input of [
    { question: 'And in EUR?', recent: ['What stack do you use?', previous] },
    { question: 'А в долларах в час?', recent: ['Ваши зарплатные ожидания?'] },
    { question: 'USD gross?', recent: [] },
    {
      question: 'А какая выручка в долларах?',
      recent: ['Ваши зарплатные ожидания?'],
    },
  ]) {
    assert.equal(
      planAnswer(input.question, { ...options, recent: input.recent }).match,
      'unanswered'
    );
  }
});

test('current targets replace plain stale amounts and monthly wording under an hourly question', () => {
  const question = 'What hourly rate in USD do you expect?';
  const result = planAnswer(question, {
    ...options,
    rules: [oldRule(question, 'From $4 000 net per month.')],
  });
  assert.equal(result.text, 'From $40 net per hour.');
  assert.equal(result.requiresReview, false);
  const reason = 'What salary in USD do you expect and why?';
  const detailed = planAnswer(reason, {
    ...options,
    rules: [oldRule(reason, 'From $4000, because of my experience.')],
  });
  assert.equal(detailed.text, 'From $4000, because of my experience.');
  assert.equal(detailed.requiresReview, true);
});

test('past pay, offered ranges, unrelated requests and multi-question messages never get a pay-only automatic reply', () => {
  for (const question of [
    'What was your previous hourly rate?',
    'Does a salary of USD 2000 suit you?',
    'Какая зарплата была на прошлом месте?',
    'Подходит ли почасовая ставка 1000 рублей?',
    'Какие зарплатные карты использовали?',
    'How do you calculate payroll taxes?',
    'What annual salary do you expect?',
    'Thanks for sharing your salary expectations. Could you share your GitHub profile?',
  ]) {
    assert.equal(planAnswer(question, options).match, 'unanswered', question);
  }
  const combined = planAnswer(
    '1. What salary in USD do you expect?\n2. What is your GitHub?',
    options
  );
  assert.equal(combined.match, 'assembled');
  assert.equal(combined.requiresReview, true);
  assert.equal(combined.complete, false);
  assert.ok(combined.text.includes('{{answer:2}}'));
});

test('unknown or ambiguous currencies and unapproved targets remain reviewable', () => {
  for (const question of [
    'What salary in GBP do you expect?',
    'What salary in gbp do you expect?',
    'What salary in £ do you expect?',
    'What salary in RUB or USD do you expect?',
  ]) {
    const result = planAnswer(question, options);
    assert.equal(result.complete, false, question);
    assert.equal(result.requiresReview, true, question);
  }
  const result = planAnswer('What salary do you expect?', {
    salary: { ...salary, approved: false },
  });
  assert.equal(result.complete, true);
  assert.equal(result.requiresReview, true);
  assert.equal(
    planAnswer('What salary do you expect?', {
      salary: { ...salary, enabled: false },
    }).text,
    ''
  );
});

test('salary choices use the unique containing band with numeric scales, tax basis and period', () => {
  const question = 'What salary in RUB net do you expect?';
  const choices = [
    'До 100 тыс. руб',
    'От 221 тыс. руб до 240 тыс. руб',
    'Свыше 241 тыс. руб',
    'Own variant',
  ];
  assert.equal(
    planAnswer(question, { ...options, options: choices }).text,
    choices[2]
  );
  assert.equal(
    planAnswer('What hourly rate in RUB do you expect?', {
      ...options,
      options: ['До 2500 руб', 'От 2501 до 3500 руб', 'Свыше 3500 руб'],
    }).text,
    'От 2501 до 3500 руб'
  );
  for (const choices of [
    ['До 100 тыс. руб', 'От 121 тыс. руб до 140 тыс. руб'],
    ['От 400 до 500 тыс. руб', 'От 400 до 600 тыс. руб'],
    ['USD 1000–5000', 'USD 5001–10000'],
    ['До 500 тыс. руб gross', 'Свыше 500 тыс. руб gross'],
  ]) {
    assert.equal(
      planAnswer(question, { ...options, options: choices }).requiresReview,
      true
    );
  }
  const euro = {
    ...salary,
    currencies: salary.currencies.map((currency) => ({
      ...currency,
      net: currency.code === 'EUR' ? 1750 : currency.net,
    })),
  };
  assert.equal(
    planAnswer('What salary in EUR net do you expect?', {
      salary: euro,
      options: ['EUR 1,5k–2k', 'EUR 2k–3k'],
    }).text,
    'EUR 1,5k–2k'
  );
});

test('all providers use the same configured salary plan and persisted approval', () => {
  const automation = normalizeAutomation({
    id: 'pay',
    action: { kind: 'answer-questions', salary },
    conditions: { mutual: false, cooldownDays: 0 },
  });
  assert.deepEqual(automation.action.salary, salary);
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    const message = {
      id: `msg:${source}:1:1`,
      source,
      chat: '1',
      sender: 'them',
      body: 'What salary in USD do you expect?',
      timestamp: '2026-11-09T10:00:00Z',
    };
    const plan = planAutomation([message, automation], automation, {
      self: ['me'],
      targets: [{ source, chat: '1' }],
    });
    assert.equal(plan.drafts[0]?.text, 'From $6 000 net per month.', source);
  }
});

test('salary configuration rejects invalid hours, amounts, defaults and duplicate currencies', () => {
  const normalize = (salary) =>
    normalizeAutomation({ action: { kind: 'answer-questions', salary } });
  for (const invalid of [
    { ...salary, monthlyHours: 0 },
    { ...salary, monthlyHours: Infinity },
    { ...salary, defaultCurrency: 'GBP' },
    { ...salary, currencies: [...salary.currencies, salary.currencies[0]] },
    { ...salary, currencies: [{ ...salary.currencies[0], net: NaN }] },
    { ...salary, currencies: [{ ...salary.currencies[0], net: -1 }] },
    { ...salary, currencies: [{ ...salary.currencies[0], hourlyStep: 0 }] },
  ]) {
    assert.throws(() => normalize(invalid), /salary/u);
  }
});

test('ambiguous periods, tax bases and rejected generated answers cannot become approved replies', () => {
  for (const question of [
    'What hourly and monthly salary in USD do you expect?',
    'What salary in USD net or gross do you expect?',
  ]) {
    const result = planAnswer(question, options);
    assert.equal(result.complete, false);
    assert.equal(result.requiresReview, true);
  }
  const result = planAnswer('What salary in USD do you expect?', {
    ...options,
    policy: { rejected: ['From $6 000 net per month.'] },
  });
  assert.equal(result.text, '');
  assert.equal(result.requiresReview, true);
  assert.equal(
    planAnswer('The salary is excellent.', options).match,
    'unanswered'
  );
  for (const question of ['Thanks.', 'And?', 'Please.']) {
    assert.equal(
      planAnswer(question, {
        ...options,
        recent: ['What salary in USD do you expect?'],
      }).match,
      'unanswered'
    );
  }
});
