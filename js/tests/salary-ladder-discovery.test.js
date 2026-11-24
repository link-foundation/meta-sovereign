import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSalary } from '../src/automation/salary-config.js';
import {
  discoveryOptions,
  discoveryResult,
} from '../src/jobs/discovery-data.js';
import {
  salaryLadderStart,
  salaryTierSearch,
  assessVacancySalary,
  freshSalaryLadder,
} from '../src/jobs/salary-ladder.js';
import {
  discoveryFixture,
  discoveryInput,
} from '../../experiments/issue-56/discovery-fixture.mjs';
import {
  ladderSalary,
  ladderSearch,
} from '../../experiments/issue-56/salary-ladder-fixture.mjs';
import { discoveredReviewUrls } from '../src/web/application-batch-view.js';

const settings = (extra = {}) =>
  discoveryOptions({
    ...discoveryInput,
    salary: undefined,
    page: 5,
    salaryConfig: ladderSalary,
    ...extra,
  });

test('matching salary tiers preserve explicit filters, exact targets, pagination and opt-out', () => {
  const options = settings();
  const first = salaryTierSearch(options);
  assert.equal(first.salary, 450000);
  assert.equal(first.page, 0);
  assert.equal(first.currency, 'RUR');
  assert.equal(first.query, 'Python');
  assert.equal(first.resume, 'fixture_cv');
  assert.equal(first.remote, true);
  assert.equal(salaryTierSearch(options, 1).salary, 400000);
  assert.equal(salaryTierSearch(settings({ salary: 400000, page: 3 })).page, 3);
  const foreign = settings({ salary: 6000, currency: 'USD' });
  assert.equal(salaryLadderStart(foreign).floorRub, 480000);
  assert.equal(salaryTierSearch(foreign, 1).salary, 5375);
  assert.equal(salaryTierSearch(settings({ salary: 0 }), 0).salary, 0);
  for (const extra of [
    { salaryLadder: false },
    { resume: '' },
    { salaryConfig: undefined },
  ]) {
    assert.equal(salaryLadderStart(settings(extra)), null);
  }
  assert.throws(() => settings({ salaryLadder: 'true' }));
});

test('advertised hard caps, exact half, minimum-only pay, monthly equivalents and unknown pay stay distinct', () => {
  const config = normalizeSalary(ladderSalary);
  const action = (text, floor = 450000) =>
    assessVacancySalary(text, config, floor).action;
  for (const text of [
    'до 224 999 ₽ в месяц',
    '100 000–200 000 ₽',
    '200000 RUB',
    'up to $2999 per month',
    'до 2749 EUR',
    'до 1000000 ₸',
    'up to $24000 per year',
    'from 160 000 up to 220 000 ₽ per month, after taxes',
  ]) {
    assert.equal(action(text), 'exclude', text);
  }
  for (const text of [
    'до 225000 ₽',
    'up to $3000',
    '2750 EUR',
    'from 100000 ₽',
    'Salary from 100000 ₽, full-time',
    'from 204 000 up to 325 900 ₽ per month, before tax',
  ]) {
    assert.equal(action(text), 'defer', text);
  }
  for (const text of [
    '',
    'from $6000',
    '5000000 KZT',
    'от 3000 ₽ в час',
    '10000 ₽ за смену',
    '20000 ₽ за проект',
    'Pay negotiable',
    '2000 XYZ',
  ]) {
    assert.equal(action(text), 'apply', text);
  }
  assert.equal(action('from 100000 ₽', 0), 'apply');
  assert.equal(action('до 200000 ₽', 0), 'exclude');
});

test('foreign filters use dated rates and refuse stale snapshots without silently changing the floor', () => {
  const options = settings({ salary: 6000, currency: 'USD' });
  assert.equal(
    freshSalaryLadder(options, Date.UTC(2026, 10, 17)).floorRub,
    480000
  );
  assert.throws(() => freshSalaryLadder(options, Date.UTC(2028, 0, 1)), {
    code: 'jobs-salary-rates-stale',
  });
  assert.equal(
    freshSalaryLadder(
      { ...options, salaryLadder: false },
      Date.UTC(2028, 0, 1)
    ),
    null
  );
  const noRates = settings({
    salary: 6000,
    currency: 'USD',
    salaryConfig: { ...ladderSalary, exchange: undefined },
  });
  assert.equal(salaryLadderStart(noRates), null);
  assert.equal(salaryTierSearch(noRates).salary, 6000);
  assert.equal(
    assessVacancySalary('до 2999 USD', noRates.salaryConfig, null).action,
    'exclude'
  );
  assert.equal(
    assessVacancySalary('2000 CAD', noRates.salaryConfig, null).reason,
    'unknown-pay'
  );
});

test(
  'discovery exhausts each tier before stepping, releases deferred rows and never copies low caps into batches',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t, { readSearch: ladderSearch });
    await f.start({
      salary: undefined,
      salaryConfig: ladderSalary,
      maxPages: 11,
    });
    const receipt = await f.drain();
    const job = receipt.discovery;
    assert.equal(job.phase, 'completed');
    assert.equal(job.reason, 'exhausted');
    assert.equal(job.pages, 11);
    assert.equal(job.salaryTier, 9);
    assert.deepEqual(
      f.searches.slice(0, 3).map(({ url }) => {
        const p = new URL(url).searchParams;
        return [p.get('salary'), p.get('page')];
      }),
      [
        ['450000', '0'],
        ['450000', '1'],
        ['400000', '0'],
      ]
    );
    assert.deepEqual(
      job.entries.map((row) => row.pay.action),
      ['apply', 'exclude', 'apply', 'apply']
    );
    assert.equal(job.entries[0].pay.tier, 1);
    assert.equal(f.descriptions.length, 3);
    assert.equal((await f.service.stored()).entries.length, 3);
    assert.deepEqual(discoveredReviewUrls({ receipt }), [
      'https://hh.ru/vacancy/801',
      'https://hh.ru/vacancy/803',
    ]);
    discoveryResult(receipt, {});
    const reads = f.searches.length;
    await f.start({
      salary: undefined,
      salaryConfig: ladderSalary,
      maxPages: 11,
    });
    assert.equal(f.searches.length, reads);
    assert(
      !(await f.store.query(() => true)).some((row) =>
        row.id.startsWith('secret:jobs-vacancy-choice')
      )
    );
    const changed = globalThis.structuredClone(receipt);
    changed.discovery.entries[1].pay.action = 'apply';
    assert.throws(() => discoveryResult(changed, {}));
    changed.discovery.entries[1].pay.tier = 100;
    assert.throws(() => discoveryResult(changed, {}));
  }
);

test(
  'page limits, failed reads and explicit zero never masquerade as exhausted salary tiers',
  { timeout: 5000 },
  async (t) => {
    const limited = discoveryFixture(t, { readSearch: ladderSearch });
    await limited.start({
      salary: undefined,
      salaryConfig: ladderSalary,
      maxPages: 2,
    });
    const job = (await limited.drain()).discovery;
    assert.equal(job.reason, 'page-limit');
    assert.equal(job.salaryTier, 0);
    assert.equal(job.entries[0].pay.action, 'defer');
    const broken = discoveryFixture(t, {
      readSearch: () => {
        throw Object.assign(new Error('loading'), {
          code: 'jobs-search-unavailable',
        });
      },
    });
    await broken.start({ salary: undefined, salaryConfig: ladderSalary });
    const failed = (await broken.drain()).discovery;
    assert.equal(failed.phase, 'failed');
    assert.equal(failed.salaryTier, 0);
    assert.equal(failed.pages, 0);
    const zero = discoveryFixture(t, { readSearch: ladderSearch });
    await zero.start({ salary: 0, salaryConfig: ladderSalary });
    assert.equal((await zero.drain()).discovery.pages, 1);
  }
);
