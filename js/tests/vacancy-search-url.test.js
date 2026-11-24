import test from 'node:test';
import assert from 'node:assert/strict';
import { hhSearchUrl } from '../src/jobs/options.js';
import {
  confirmedVacancySearch,
  validateVacancySearch,
} from '../src/jobs/search-result.js';
import {
  discoveryOptions,
  discoveryResult,
} from '../src/jobs/discovery-data.js';
import { salaryTierSearch } from '../src/jobs/salary-ladder.js';
import { createVacancyService } from '../src/jobs/service.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { searchFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';
import { ladderSalary } from '../../experiments/issue-56/salary-ladder-fixture.mjs';

const searchUrl =
  'https://hh.ru/search/vacancy?resume=original&area=1&area=2&experience=between3And6&employment=part&text=C%2B%2B&salary=300000&currency=RUR&order_by=publication_time&page=2';

test('an owner search URL preserves repeated native filters and only explicit overrides replace them', () => {
  const input = { url: searchUrl };
  assert.equal(hhSearchUrl(input), searchUrl);
  assert.equal(input.url, searchUrl);
  const actual = new URL(hhSearchUrl({ ...input, resume: 'chosen', page: 3 }));
  const expected = new URL(searchUrl);
  expected.searchParams.set('resume', 'chosen');
  expected.searchParams.set('page', '3');
  assert.equal(actual.href, expected.href);
  assert.deepEqual(actual.searchParams.getAll('area'), ['1', '2']);
  const changed = new URL(
    hhSearchUrl({ ...input, query: '', salary: 0, remote: true })
  );
  assert.equal(changed.searchParams.has('text'), false);
  assert.equal(changed.searchParams.get('salary'), '0');
  assert.equal(changed.searchParams.get('work_format'), 'REMOTE');
  assert.equal(
    hhSearchUrl({ url: '', resume: 'chosen' }),
    hhSearchUrl({ resume: 'chosen' })
  );
});

test('native URL pages bind API receipts and refuse any changed extra filter on continuation', () => {
  const next = new URL(searchUrl);
  next.searchParams.set('page', '3');
  const read = { ...searchFixture(searchUrl), next: next.href };
  const confirmed = validateVacancySearch(read, searchUrl);
  assert.equal(confirmedVacancySearch(confirmed, { url: searchUrl }).page, 2);
  next.searchParams.set('experience', 'noExperience');
  assert.throws(
    () => validateVacancySearch({ ...read, next: next.href }, searchUrl),
    { code: 'jobs-search-ambiguous' }
  );
  assert.throws(
    () => confirmedVacancySearch({ ...confirmed, page: 0 }, { url: searchUrl }),
    { code: 'jobs-unconfirmed' }
  );
});

test('discovery checkpoints and salary tiers retain opaque filters and explicit URL pay', () => {
  const input = {
    url: searchUrl,
    requestId: 'url-discovery',
    salaryConfig: ladderSalary,
  };
  const options = discoveryOptions(input);
  assert.equal(hhSearchUrl(options.search), searchUrl);
  assert.deepEqual(discoveryOptions(options), options);
  assert.equal(hhSearchUrl(salaryTierSearch(options)), searchUrl);
  const next = new URL(hhSearchUrl(salaryTierSearch(options, 1)));
  assert.equal(next.searchParams.get('salary'), '250000');
  assert.equal(next.searchParams.get('page'), '0');
  assert.deepEqual(next.searchParams.getAll('area'), ['1', '2']);
  assert.equal(next.searchParams.get('employment'), 'part');
});

test(
  'owned discovery preserves URL filters through real saved checkpoints and restart without replay',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const urls = [];
    const options = {
      store,
      readSearch: async (url) => {
        urls.push(url);
        const next = new URL(url);
        next.searchParams.set('page', '3');
        return validateVacancySearch(
          {
            ...searchFixture(url, []),
            next: urls.length === 1 ? next.href : null,
          },
          url
        );
      },
    };
    const input = { url: searchUrl, requestId: 'preserved-url', confirm: true };
    let service = createVacancyService(options);
    try {
      await service['discovery-start'](input);
      await service['discovery-drain']();
      const receipt = discoveryResult(
        await service['discovery-status'](input),
        input
      );
      assert.equal(receipt.discovery.phase, 'completed');
      assert.equal(receipt.discovery.pages, 2);
      assert.equal(urls[0], searchUrl);
      const next = new URL(searchUrl);
      next.searchParams.set('page', '3');
      assert.equal(urls[1], next.href);
      await service.stop();
      service = createVacancyService(options);
      assert.equal(
        (await service['discovery-start'](input)).discovery.phase,
        'completed'
      );
      assert.equal(urls.length, 2);
      await assert.rejects(
        service['discovery-start']({
          ...input,
          url: searchUrl.replace('employment=part', 'employment=full'),
        }),
        { code: 'jobs-discovery-conflict' }
      );
    } finally {
      await service.stop();
    }
  }
);

test('invalid search destinations and ambiguous URL controls refuse before browser admission', async () => {
  let reads = 0;
  const service = createVacancyService({
    store: createMemoryStore(),
    readSearch: async () => {
      reads++;
    },
  });
  try {
    const credentialed = new URL(searchUrl);
    credentialed.username = 'fixture-user';
    credentialed.password = 'fixture-secret';
    for (const url of [
      'https://evil.test/search/vacancy',
      'http://hh.ru/search/vacancy',
      'https://hh.ru.evil.test/search/vacancy',
      credentialed.href,
      'https://hh.ru/vacancy/123',
      `${searchUrl}#private`,
      `${searchUrl}&token=secret`,
      `${searchUrl}&page=3`,
      `${searchUrl}&resume=other`,
      `${searchUrl}&salary=1`,
      searchUrl.replace('page=2', 'page=1000'),
      searchUrl.replace('salary=300000', 'salary=100000001'),
      searchUrl.replace('currency=RUR', 'currency=BAD'),
      searchUrl.replace('resume=original', 'resume=bad%26hash'),
      `${searchUrl}&text=%0Ahidden`,
      ` ${searchUrl}`,
      `${searchUrl}&x=${'x'.repeat(1001)}`,
      `${searchUrl}&${Array.from({ length: 101 }, (_, i) => `x${i}=1`).join('&')}`,
      {},
      null,
    ]) {
      assert.throws(() => service.search({ url }), { code: 'jobs-input' });
    }
    assert.equal(reads, 0);
  } finally {
    await service.stop();
  }
});

test('typed searches without a URL retain their original defaults', () => {
  const parsed = new URL(
    hhSearchUrl({ resume: 'chosen', query: 'Python', remote: true })
  );
  assert.equal(parsed.searchParams.get('resume'), 'chosen');
  assert.equal(parsed.searchParams.get('text'), 'Python');
  assert.equal(parsed.searchParams.get('work_format'), 'REMOTE');
  assert.equal(parsed.searchParams.get('page'), '0');
  assert.equal(parsed.searchParams.get('order_by'), 'salary_desc');
});
