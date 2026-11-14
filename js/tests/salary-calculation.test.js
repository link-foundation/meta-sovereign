import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { normalizeSalary } from '../src/automation/salary-config.js';

// Owner-supplied example rates, not a built-in jurisdiction or legal advice.
const personal = {
  currency: 'RUB',
  bands: [
    { upTo: 2400000, rate: 0.13 },
    { upTo: 5000000, rate: 0.15 },
    { upTo: 20000000, rate: 0.18 },
    { upTo: null, rate: 0.22 },
  ],
};
const salary = {
  enabled: true,
  approved: true,
  defaultCurrency: 'RUB',
  currencies: [
    {
      code: 'RUB',
      keywords: ['RUB', '₽'],
      net: 450000,
      grossMethod: 'personal',
    },
    { code: 'USD', keywords: ['USD', '$'], net: 6000, grossMethod: 'personal' },
    { code: 'EUR', keywords: ['EUR', '€'], net: 5500, grossMethod: 'personal' },
  ],
  taxes: { personal },
  exchange: {
    base: 'RUB',
    rates: { USD: 84.9048, EUR: 93.7693 },
    asOf: '2026-11-09',
    source: 'manual',
    maxAgeDays: 7,
  },
};
const now = Date.parse('2026-11-09T12:00:00Z');
const answer = (code, config = salary, period = 'month') =>
  planAnswer(
    `What ${period === 'hour' ? 'hourly rate' : 'salary'} in ${code} before taxes do you expect?`,
    { salary: config, now }
  );

test('configured progressive annual bands derive independent monthly and hourly gross targets', () => {
  const rub = answer('RUB');
  assert.equal(rub.text, 'From 530 000 ₽ gross per month.');
  assert.equal(rub.requiresReview, false);
  assert.deepEqual(rub.salary.calculation.rates, [0.13, 0.15, 0.18]);
  assert.equal(answer('USD').text, 'From $7 100 gross per month.');
  assert.equal(answer('EUR').text, 'From 6 500 € gross per month.');
  assert.equal(answer('USD', salary, 'hour').text, 'From $45 gross per hour.');
  const usd = answer('USD').salary.calculation;
  assert.equal(usd.method, 'personal');
  assert.equal(usd.exchange.asOf, '2026-11-09');
  assert.equal(usd.exchange.source, 'manual');
});

test('whole-income company bands include payout and normalize cross-currency annual revenue', () => {
  const company = {
    bands: [
      { upTo: 3000000000, currency: 'VND', rate: 0.15 },
      { upTo: 50000000000, currency: 'VND', rate: 0.17 },
      { upTo: null, rate: 0.2 },
    ],
    payout: 0.05,
  };
  const config = {
    ...salary,
    taxes: { personal, company },
    currencies: salary.currencies.map((entry) => ({
      ...entry,
      grossMethod: 'company',
    })),
    exchange: {
      ...salary.exchange,
      rates: { USD: 83.76, EUR: 93.7693, VND: 0.00326652 },
    },
  };
  assert.equal(answer('USD', config).text, 'From $7 500 gross per month.');
  assert.equal(answer('EUR', config).text, 'From 6 900 € gross per month.');
  assert.equal(answer('USD', config).salary.calculation.payout, 0.05);
  const larger = {
    ...config,
    defaultCurrency: 'EUR',
    currencies: [{ ...config.currencies[2], net: 10000 }],
  };
  assert.equal(answer('EUR', larger).salary.calculation.rates[0], 0.17);
  const unavailable = answer('EUR', { ...config, exchange: salary.exchange });
  assert.equal(unavailable.complete, false);
  assert.equal(unavailable.requiresReview, true);
  assert.ok(unavailable.missing.includes('salary_exchange_EUR_VND'));
});

test('missing or stale FX leaves calculated gross unresolved without changing independent net', () => {
  for (const exchange of [
    undefined,
    { ...salary.exchange, rates: {} },
    { ...salary.exchange, asOf: '2026-10-01' },
  ]) {
    const config = { ...salary, exchange };
    const result = answer('USD', config);
    assert.equal(result.complete, false);
    assert.equal(result.requiresReview, true);
    assert.ok(!result.text.includes('7 100'));
    assert.equal(
      planAnswer('What salary in USD do you expect after taxes?', {
        salary: config,
        now,
      }).text,
      'From $6 000 net per month.'
    );
    assert.equal(answer('RUB', config).text, 'From 530 000 ₽ gross per month.');
  }
});

test('gross calculations are opt-in, explicit targets remain independent and selected methods ignore stale explicit gross', () => {
  const entry = { code: 'USD', keywords: ['USD'], net: 6000, gross: 8000 };
  const config = { ...salary, defaultCurrency: 'USD', currencies: [entry] };
  assert.equal(answer('USD', config).text, 'From $8 000 gross per month.');
  assert.equal(
    answer('USD', {
      ...config,
      currencies: [{ ...entry, grossMethod: 'personal' }],
    }).text,
    'From $7 100 gross per month.'
  );
  const missing = answer('USD', {
    ...config,
    currencies: [{ ...entry, gross: undefined }],
  });
  assert.equal(missing.complete, false);
  assert.equal(answer('USD', { ...salary, taxes: undefined }).complete, false);
});

test('flat zero tax, first-band boundary, foreign tax currency and explicit rounding remain bounded', () => {
  const config = {
    ...salary,
    defaultCurrency: 'USD',
    currencies: [
      {
        code: 'USD',
        keywords: ['USD'],
        net: 101,
        grossMethod: 'personal',
        grossStep: 10,
      },
    ],
    taxes: { personal: { currency: 'USD', bands: [{ upTo: null, rate: 0 }] } },
    exchange: undefined,
  };
  assert.equal(answer('USD', config).text, 'From $110 gross per month.');
  const boundary = {
    ...salary,
    currencies: [{ ...salary.currencies[0], net: 174000 }],
  };
  assert.equal(answer('RUB', boundary).salary.calculation.rates.length, 1);
  const overflow = {
    ...config,
    currencies: [{ ...config.currencies[0], net: 1e12 }],
    taxes: {
      personal: { currency: 'USD', bands: [{ upTo: null, rate: 0.99 }] },
    },
  };
  assert.equal(answer('USD', overflow).complete, false);
});

test('company rounding uses the band of the final requested gross amount', () => {
  const config = {
    ...salary,
    defaultCurrency: 'USD',
    exchange: undefined,
    currencies: [
      {
        code: 'USD',
        keywords: ['USD'],
        net: 89,
        grossMethod: 'company',
        grossStep: 100,
      },
    ],
    taxes: {
      company: {
        payout: 0,
        bands: [
          { upTo: 1199, rate: 0.1 },
          { upTo: null, rate: 0.2 },
        ],
      },
    },
  };
  const result = answer('USD', config);
  assert.equal(result.text, 'From $200 gross per month.');
  assert.deepEqual(result.salary.calculation.rates, [0.2]);
});

test('invalid tax schedules, FX values and calculation choices cannot be saved', () => {
  for (const invalid of [
    { ...salary, taxes: { personal: { currency: 'RUB', bands: [] } } },
    {
      ...salary,
      taxes: {
        personal: { currency: 'RUB', bands: [{ upTo: 10, rate: 0.1 }] },
      },
    },
    {
      ...salary,
      taxes: {
        personal: {
          currency: 'RUB',
          bands: [
            { upTo: 10, rate: 0.1 },
            { upTo: 5, rate: 0.2 },
            { upTo: null, rate: 0.3 },
          ],
        },
      },
    },
    {
      ...salary,
      taxes: {
        personal: { currency: 'RUB', bands: [{ upTo: null, rate: 1 }] },
      },
    },
    {
      ...salary,
      taxes: { company: { bands: [{ upTo: null, rate: 0.2 }], payout: -0.1 } },
    },
    { ...salary, exchange: { ...salary.exchange, rates: { USD: Infinity } } },
    { ...salary, exchange: { ...salary.exchange, rates: 1 } },
    { ...salary, exchange: { ...salary.exchange, rates: [null] } },
    { ...salary, taxes: { personal: false } },
    { ...salary, taxes: [] },
    { ...salary, exchange: { ...salary.exchange, rates: { RUB: 2 } } },
    { ...salary, exchange: { ...salary.exchange, asOf: '2026-02-30' } },
    { ...salary, exchange: { ...salary.exchange, maxAgeDays: 0 } },
    {
      ...salary,
      currencies: [{ ...salary.currencies[0], grossMethod: 'unknown' }],
    },
    { ...salary, currencies: [{ ...salary.currencies[0], grossStep: 0 }] },
  ]) {
    assert.throws(() => normalizeSalary(invalid), /salary/u);
  }
});
