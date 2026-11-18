import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { createVacancyService } from '../src/jobs/service.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { vacancyContent } from '../src/assignments/vacancy-content.js';
import { analyzeTechnologies } from '../src/jobs/technology-analysis.js';
import { validateVacancySearch } from '../src/jobs/search-result.js';
import {
  technologyCatalog,
  defaultTechnologyEntries,
} from '../src/jobs/technology-catalog.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { searchFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';
import { seedVacancyCorpus } from '../../experiments/issue-56/vacancy-corpus-fixture.mjs';
import {
  technologyFixture,
  technologyCv,
} from '../../experiments/issue-56/technology-fixture.mjs';

const projected = (rows) =>
  rows.map((row) => ({ id: row.id, ...vacancyContent(row) }));
const offline = (store) =>
  createVacancyApi({ get: async () => null, local: async () => store });
const noProvider = () => assert.fail('Cached reads must not open a provider');

test(
  'complete cached descriptions survive restart and keep their observation order offline',
  { timeout: 5000 },
  async () => {
    const driver = createInMemoryDriver();
    let store = await createBrowserStore({ driver });
    let service;
    try {
      const rows = await seedVacancyCorpus(store);
      await store.close();
      store = await createBrowserStore({ driver });
      service = createVacancyService({ store, openSession: noProvider });
      const saved = await service.stored();
      assert.equal(saved.entries.length, 101);
      assert.deepEqual(saved.entries, projected(rows));
      assert.deepEqual(
        (await offline(store).vacancyStored()).entries,
        saved.entries
      );
      assert.equal(saved.entries.at(-1).status, 'applied');
      assert.equal(
        saved.entries.at(-1).descriptionHtml,
        rows.at(-1).descriptionHtml
      );
      assert.deepEqual(
        (await driver.load()).links.map((row) => row.id),
        [...rows].reverse().map((row) => row.id)
      );
    } finally {
      await service?.stop();
      await store.close();
    }
  }
);

test(
  'offline cached descriptions include every record in the same newest-first order',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const rows = await seedVacancyCorpus(store);
    assert.deepEqual(
      (await offline(store).vacancyStored()).entries,
      projected(rows)
    );
  }
);

test(
  'CLI cached descriptions include the oldest acknowledged full description',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const rows = await seedVacancyCorpus(store);
    const commands = createVacancyCommands({
      openStore: async () => store,
      openSession: noProvider,
    });
    const output = [];
    assert.equal(
      await commands['vacancies-stored']({}, (value) =>
        output.push(decodeWire(value))
      ),
      0
    );
    assert.deepEqual(output[0].entries, projected(rows));
  }
);

test(
  'exclusion review reuses an older description instead of treating it as missing',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const rows = await seedVacancyCorpus(store);
    const oldest = rows.at(-1);
    const service = createVacancyService({
      store,
      openSession: noProvider,
      readSearch: async (url) =>
        validateVacancySearch(
          searchFixture(url, [{ ...oldest, responded: false }]),
          url
        ),
    });
    try {
      const result = await service.search({
        excludeText: 'Private corpus entry 100',
      });
      assert.equal(result.selection.decisions[0].reason, 'configured-text');
      assert.equal(result.selection.decisions[0].field, 'description');
      assert.equal(
        result.selection.decisions[0].descriptionCapturedAt,
        oldest.capturedAt
      );
    } finally {
      await service.stop();
    }
  }
);

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `complete cache and technology analysis retain all 101 descriptions with ${type}`,
    { timeout: 10000 },
    async () => {
      const fixture = await technologyFixture();
      try {
        for (const row of fixture.rows.filter((row) =>
          row.id.startsWith('assignment-vacancy:')
        )) {
          await fixture.store.delete(row.id);
        }
        const rows = await seedVacancyCorpus(fixture.store);
        await withRoutes(
          async (base, calls) => {
            const get = async (path) => {
              const response = await fetch(`${base}${path}`, {
                headers: { accept: type },
              });
              assert.equal(response.status, 200);
              return decodeWire(
                await response.arrayBuffer(),
                response.headers.get('content-type')
              );
            };
            const api = createVacancyApi({
              get,
              report: async (path, input) => {
                const answer = await wirePost(
                  base,
                  path.split('/').at(-1),
                  input,
                  type
                );
                assert.equal(answer.status, 200);
                return answer.value;
              },
            });
            assert.deepEqual(
              (await api.vacancyStored()).entries,
              projected(rows)
            );
            const catalog = await api.vacancyTechnologyCatalog();
            const answer = await api.vacancyTechnologyAnalyze({
              ...fixture.input,
              revision: catalog.revision,
            });
            assert.equal(answer.analysis.vacancies.length, 101);
            assert.deepEqual(
              answer.analysis.vacancies.map((row) => row.url),
              rows.map((row) => row.url)
            );
            assert.equal(
              answer.analysis.statistics.find(
                (row) => row.canonical === 'Python'
              ).vacancies,
              101
            );
            assert.equal(answer.analysis.vacancies.at(-1).status, 'applied');
            assert.ok(
              answer.analysis.vacancies.every(
                (row) => row.descriptionHtml === undefined
              )
            );
            assert.deepEqual(
              await api.vacancyTechnologyAnalysisStored({
                browserSlot: 'jobs',
              }),
              answer
            );
            const disconnected = offline(fixture.store);
            assert.deepEqual(
              await disconnected.vacancyTechnologyAnalysisStored({
                browserSlot: 'jobs',
              }),
              answer
            );
            assert.deepEqual(calls, []);
          },
          {
            store: fixture.store,
            service: {
              artifactRoot: fixture.artifactRoot,
              openSession: noProvider,
            },
          }
        );
      } finally {
        await fixture.close();
      }
    }
  );
}

test(
  'older corrupt cache identities fail explicitly instead of being hidden after 100 records',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const rows = await seedVacancyCorpus(store);
    const oldest = rows.at(-1);
    await store.delete(oldest.id);
    await store.put({ ...oldest, id: `assignment-vacancy:${'f'.repeat(64)}` });
    const service = createVacancyService({ store, openSession: noProvider });
    try {
      await assert.rejects(service.stored(), { code: 'jobs-cache-invalid' });
    } finally {
      await service.stop();
    }
  }
);

test(
  'analysis still refuses its finite input byte budget before scanning a large corpus',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const rows = await seedVacancyCorpus(store, 145);
    const catalog = await technologyCatalog(defaultTechnologyEntries());
    await assert.rejects(
      analyzeTechnologies({
        catalog,
        vacancies: rows.map((row) => ({
          ...row,
          description: 'x'.repeat(29900),
        })),
        cv: technologyCv(),
        resume: {},
      }),
      { code: 'jobs-technology-limit' }
    );
  }
);
