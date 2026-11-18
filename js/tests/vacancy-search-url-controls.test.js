import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import {
  vacancySearchInput,
  vacancyUrlFilterDisabled,
} from '../src/web/vacancy-search-input.js';
import { hhSearchUrl } from '../src/jobs/options.js';
import { validateVacancySearch } from '../src/jobs/search-result.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { searchFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';

const url =
  'https://hh.ru/search/vacancy?resume=original&area=1&area=2&experience=between3And6&page=2';

test('CLI URL search preserves native filters while changing only the selected résumé', async () => {
  const reads = [];
  const store = createMemoryStore();
  const commands = createVacancyCommands({
    openStore: async () => store,
    readSearch: async (value) => {
      reads.push(value);
      return validateVacancySearch(searchFixture(value), value);
    },
  });
  const output = [];
  assert.equal(
    await commands['vacancies-search']({ url, resume: 'chosen' }, (value) =>
      output.push(decodeWire(value))
    ),
    0
  );
  assert.equal(reads.length, 1);
  assert.deepEqual(new URL(reads[0]).searchParams.getAll('area'), ['1', '2']);
  assert.equal(new URL(reads[0]).searchParams.get('resume'), 'chosen');
  assert.equal(
    new URL(reads[0]).searchParams.get('experience'),
    'between3And6'
  );
  assert.equal(output[0].page, 2);
});

for (const media of [LINO_TEXT, LINO_BINARY]) {
  test(
    `search URL filters and page evidence cross trusted ${media} routes`,
    { timeout: 10000 },
    async () => {
      const reads = [];
      await withRoutes(
        async (base) => {
          const answer = await wirePost(
            base,
            'search',
            { url, resume: 'chosen' },
            media
          );
          assert.equal(answer.status, 200);
          assert.deepEqual(new URL(reads[0]).searchParams.getAll('area'), [
            '1',
            '2',
          ]);
          assert.equal(
            new URL(reads[0]).searchParams.get('experience'),
            'between3And6'
          );
          assert.equal(answer.value.page, 2);
          const denied = await wirePost(
            base,
            'search',
            { url: 'https://foreign.test/search/vacancy' },
            media
          );
          assert.equal(denied.status, 400);
          assert.equal(reads.length, 1);
        },
        {
          service: {
            readSearch: async (value) => {
              reads.push(value);
              return validateVacancySearch(searchFixture(value), value);
            },
          },
        }
      );
    }
  );
}

test('the shared UI sends URL filters without replacing them with disabled field defaults', async () => {
  const values = {
    searchUrl: url,
    resume: '',
    query: 'inactive',
    remote: false,
    area: 'inactive',
    salary: '',
    currency: 'USD',
    order: 'relevance',
    mode: 'inherit',
    browserSlot: 'jobs',
    resumeLanguage: 'en',
    skipResponded: true,
    excludeText: '',
  };
  const input = vacancySearchInput(values, 3);
  assert.equal(input.resumeLanguage, 'en');
  const result = new URL(hhSearchUrl(input));
  assert.equal(result.searchParams.get('resume'), 'original');
  assert.equal(result.searchParams.has('text'), false);
  assert.equal(result.searchParams.get('currency'), 'RUR');
  assert.deepEqual(result.searchParams.getAll('area'), ['1', '2']);
  assert.equal(result.searchParams.get('page'), '3');
  for (const key of [
    'query',
    'area',
    'salary',
    'currency',
    'order',
    'remote',
  ]) {
    assert.equal(vacancyUrlFilterDisabled(values, key), true);
  }
  assert.equal(vacancyUrlFilterDisabled(values, 'resume'), false);
  const api = createVacancyApi({
    report: async () =>
      validateVacancySearch(searchFixture(result.href), result.href),
  });
  assert.equal((await api.vacancySearch(input)).page, 3);
  const typed = vacancySearchInput(
    { ...values, searchUrl: '', area: '1', query: 'Python' },
    0
  );
  assert.equal(new URL(hhSearchUrl(typed)).searchParams.get('text'), 'Python');
  assert.equal(
    vacancyUrlFilterDisabled({ ...values, searchUrl: '' }, 'area'),
    false
  );
});
