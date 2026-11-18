import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { modelFingerprint } from '../src/automation/answer-model-context.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { createInMemoryDriver } from '../src/storage/browser-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes } from './helpers/vacancy-routes.mjs';
import {
  legacyVacancy,
  legacyNotation,
  withLegacyVacancies,
} from '../../experiments/issue-56/vacancy-legacy-fixture.mjs';

const url = 'https://hh.ru/vacancy/123';
const cacheId = async () => `assignment-vacancy:${await modelFingerprint(url)}`;
const originals = (store) =>
  store.query((row) => row.id.startsWith('vacancy-legacy:'));

test(
  'legacy private vacancies migrate automatically with exact originals and canonical cache reuse',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, legacy, open }) => {
      const text = legacyNotation();
      await write();
      const { store, service } = await open();
      const result = await service.stored();
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].url, url);
      assert.equal(result.entries[0].description, legacyVacancy().description);
      assert.equal(
        result.entries[0].descriptionHtml,
        legacyVacancy().descriptionHtml
      );
      assert.deepEqual(result.entries[0].skills, ['Python', 'SQL']);
      assert.equal(result.entries[0].capturedAt, legacyVacancy().lastSeenAt);
      assert.deepEqual(result.cacheMigration, {
        imported: 1,
        existing: 0,
        invalid: [],
      });
      const [original] = await originals(store);
      assert.equal(original.text, text);
      assert.equal(original.complete, true);
      assert.equal(original.vacancyId, await cacheId());
      assert.equal(
        await fs.readFile(path.join(legacy, '123.lino'), 'utf8'),
        text
      );
      assert.equal(
        (await service.collect({ url: `${url}?from=search` })).descriptionHtml,
        legacyVacancy().descriptionHtml
      );
    });
  }
);

test(
  'acknowledged migrated records survive reopening and do not resurrect an owner deletion',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, open }) => {
      await write();
      const causal = { decorateStore: withCausalWrites };
      const first = await open(causal);
      const before = (await first.service.stored()).entries;
      assert.equal(before.length, 1);
      await first.service.stop();
      await first.store.close();
      const second = await open(causal);
      assert.deepEqual((await second.service.stored()).entries, before);
      assert.deepEqual((await second.service.stored()).cacheMigration, {
        imported: 0,
        existing: 1,
        invalid: [],
      });
      await second.store.delete(await cacheId());
      await second.service.stop();
      await second.store.close();
      const third = await open(causal);
      assert.deepEqual((await third.service.stored()).entries, []);
      assert.equal((await originals(third.store)).length, 1);
    });
  }
);

test(
  'legacy migration preserves newer app snapshots and every original field',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, open }) => {
      await write();
      const { store, service } = await open();
      const current = {
        id: await cacheId(),
        version: 1,
        tokens: ['assignment', 'vacancy'],
        children: [],
        ...legacyVacancy(),
        url,
        description: 'Newer owner snapshot.',
        capturedAt: '2026-11-18T00:00:00Z',
      };
      // The source's numeric ID is distinct from the shared store identity.
      current.id = await cacheId();
      await store.put(current);
      await service.stored();
      assert.deepEqual(await store.get(current.id), current);
      const [original] = await originals(store);
      assert.equal(original.text, legacyNotation());
      assert.match(original.text, /Older employer metadata/);
    });
  }
);

test(
  'malformed, conflicting, unsafe and oversized legacy files never enter the success cache',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, legacy, open }) => {
      await write('201.lino', legacyNotation(legacyVacancy({ id: '202' })));
      await write(
        '202.lino',
        legacyNotation(
          legacyVacancy({ id: '202', url: 'https://hh.ru/vacancy/999' })
        )
      );
      await write(
        '203.lino',
        legacyNotation(
          legacyVacancy({
            id: '203',
            url: 'https://hh.ru/vacancy/203',
            description: '',
          })
        )
      );
      await write(
        '204.lino',
        `${legacyNotation(
          legacyVacancy({ id: '204', url: 'https://hh.ru/vacancy/204' })
        )}title\n  "Duplicate"\n`
      );
      await write('205.lino', 'id\n  "205"\ntitle\n  "unfinished\n');
      await write('206.lino', 'x'.repeat(512001));
      await write('207.lino', Buffer.from([0xff, 0xfe]));
      await fs.mkdir(path.join(legacy, '208.lino'));
      if (process.platform !== 'win32') {
        await fs.symlink(
          path.join(legacy, '201.lino'),
          path.join(legacy, '209.lino')
        );
      }
      await write('../ignored.lino', 'Private unrelated data.');
      await write('unrelated.lino', legacyNotation());
      const { store, service } = await open();
      const result = await service.stored();
      assert.deepEqual(result.entries, []);
      const count = process.platform === 'win32' ? 8 : 9;
      assert.equal(result.cacheMigration.invalid.length, count);
      assert.deepEqual(await originals(store), []);
    });
  }
);

test(
  'concurrent cache readers await one complete sequential migration',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, open }) => {
      await write();
      const { store, service } = await open();
      const saved = store.put.bind(store);
      let writes = 0;
      store.put = async (...args) => {
        writes++;
        return saved(...args);
      };
      const results = await Promise.all([
        service.stored(),
        service.stored(),
        service.collect({ url }),
      ]);
      assert.equal(results[0].entries.length, 1);
      assert.deepEqual(results[0], results[1]);
      assert.equal(results[2].description, legacyVacancy().description);
      assert.equal(
        writes,
        3,
        'Only one original/cache/completion sequence is admitted'
      );
    });
  }
);

test(
  'a refused migration save restores the cache and retries without losing originals',
  { timeout: 5000 },
  async () => {
    const driver = createInMemoryDriver();
    let refuse = true;
    await withLegacyVacancies(
      async ({ write, open }) => {
        await write();
        const { store, service } = await open();
        await assert.rejects(service.stored(), {
          code: 'jobs-vacancy-cache-import',
        });
        assert.equal(await store.get(await cacheId()), null);
        const [original] = await originals(store);
        assert.equal(original.text, legacyNotation());
        assert.equal(original.complete, false);
        const recovered = await service.stored();
        assert.equal(recovered.entries.length, 1);
        assert.equal(recovered.cacheMigration.imported, 1);
        assert.equal((await originals(store))[0].complete, true);
      },
      {
        driver: {
          load: driver.load,
          async save(snapshot) {
            if (
              refuse &&
              snapshot.links.some((row) =>
                row.id.startsWith('assignment-vacancy:')
              )
            ) {
              refuse = false;
              throw Object.assign(new Error('fixture quota'), {
                code: 'ENOSPC',
              });
            }
            await driver.save(snapshot);
          },
        },
      }
    );
  }
);

test(
  'a newer snapshot arriving at migration admission retains its exact causal record',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, open }) => {
      await write();
      const { store, service } = await open({
        decorateStore: withCausalWrites,
      });
      const update = store.update.bind(store);
      const put = store.put.bind(store);
      let owner;
      let armed = true;
      store.update = async (id, change, options) => {
        if (id === (await cacheId()) && armed) {
          armed = false;
          owner = await put({
            ...legacyVacancy(),
            id,
            version: 1,
            tokens: ['assignment', 'vacancy'],
            children: [],
            url,
            description: 'Current synchronized snapshot.',
            capturedAt: '2026-11-18T00:00:00Z',
          });
        }
        return update(id, change, options);
      };
      const result = await service.stored();
      assert.equal(
        result.entries[0].description,
        'Current synchronized snapshot.'
      );
      assert.deepEqual(result.cacheMigration, {
        imported: 0,
        existing: 1,
        invalid: [],
      });
      assert.deepEqual(await store.get(owner.id), owner);
    });
  }
);

test(
  'migration failure recovery retains an owner replacement made after admission',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, open }) => {
      await write();
      const { store, service } = await open({
        decorateStore: withCausalWrites,
      });
      const update = store.update.bind(store);
      const put = store.put.bind(store);
      let owner;
      let armed = true;
      store.update = async (id, change, options) => {
        const value = await update(id, change, options);
        if (id === (await cacheId()) && armed) {
          armed = false;
          owner = await put({
            ...value,
            description: 'Owner replacement after migration admission.',
          });
          throw Object.assign(
            new Error('fixture interrupted acknowledgement'),
            { code: 'ENOSPC' }
          );
        }
        return value;
      };
      await assert.rejects(service.stored(), {
        code: 'jobs-vacancy-cache-import',
      });
      assert.deepEqual(await store.get(owner.id), owner);
      const result = await service.stored();
      assert.equal(result.entries[0].description, owner.description);
      assert.deepEqual(await store.get(owner.id), owner);
      assert.equal((await originals(store))[0].complete, true);
    });
  }
);

test(
  'an unrelated explicit store and absent legacy directories keep cached reads unchanged',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ open }) => {
      const { service } = await open();
      assert.deepEqual(await service.stored(), { entries: [] });
    });
  }
);

test(
  'only the default store discovers old app and repository directories with app precedence',
  { timeout: 5000 },
  async () => {
    const previousStore = process.env.META_SOVEREIGN_STORE_DIR;
    const previousLegacy = process.env.VACANCY_CACHE_DIR;
    const previousCwd = process.cwd();
    try {
      await withLegacyVacancies(async ({ directory, legacy, open }) => {
        const app = path.join(directory, 'old-private-app');
        const repository = path.join(directory, 'data', 'vacancies');
        await fs.mkdir(app);
        await fs.mkdir(repository, { recursive: true });
        await fs.writeFile(path.join(app, '123.lino'), legacyNotation());
        await fs.writeFile(
          path.join(repository, '123.lino'),
          legacyNotation(
            legacyVacancy({ description: 'Older repository prose.' })
          )
        );
        process.chdir(directory);
        process.env.VACANCY_CACHE_DIR = app;
        process.env.META_SOVEREIGN_STORE_DIR = path.join(
          directory,
          'another-workspace'
        );
        const isolated = await open();
        assert.deepEqual((await isolated.service.stored()).entries, []);
        assert.deepEqual(await fs.readdir(legacy), []);
        await isolated.service.stop();
        await isolated.store.close();
        process.env.META_SOVEREIGN_STORE_DIR = directory;
        const selected = await open();
        const result = await selected.service.stored();
        assert.equal(result.entries.length, 1);
        assert.equal(
          result.entries[0].description,
          legacyVacancy().description
        );
        assert.deepEqual(result.cacheMigration, {
          imported: 1,
          existing: 1,
          invalid: [],
        });
        assert.equal((await originals(selected.store)).length, 2);
        assert.equal(
          await fs.readFile(path.join(repository, '123.lino'), 'utf8'),
          legacyNotation(
            legacyVacancy({ description: 'Older repository prose.' })
          )
        );
      });
    } finally {
      process.chdir(previousCwd);
      if (previousStore === undefined) {
        delete process.env.META_SOVEREIGN_STORE_DIR;
      } else {
        process.env.META_SOVEREIGN_STORE_DIR = previousStore;
      }
      if (previousLegacy === undefined) {
        delete process.env.VACANCY_CACHE_DIR;
      } else {
        process.env.VACANCY_CACHE_DIR = previousLegacy;
      }
    }
  }
);

test(
  'legacy cache CLI and offline browser API reuse migrated private snapshots',
  { timeout: 5000 },
  async () => {
    await withLegacyVacancies(async ({ write, open }) => {
      await write();
      const { store } = await open();
      const commands = createVacancyCommands({ openStore: async () => store });
      const output = [];
      assert.equal(
        await commands['vacancies-stored']({}, (line) => output.push(line)),
        0
      );
      const answer = decodeWire(output[0]);
      assert.equal(answer.entries.length, 1);
      const api = createVacancyApi({
        get: async () => null,
        report: async () => null,
        local: async () => store,
      });
      assert.deepEqual((await api.vacancyStored()).entries, answer.entries);
    });
  }
);

for (const media of [LINO_TEXT, LINO_BINARY]) {
  test(
    `legacy private cache reads share ${media} without request-selected host paths`,
    { timeout: 5000 },
    async () => {
      await withLegacyVacancies(async ({ write, open }) => {
        await write();
        const { store } = await open();
        await withRoutes(
          async (base) => {
            const response = await fetch(
              `${base}/api/vacancies/stored?legacyVacancyDirectories=/never-read`,
              {
                headers: { accept: media },
              }
            );
            assert.equal(response.status, 200);
            const result = decodeWire(
              await response.arrayBuffer(),
              response.headers.get('content-type')
            );
            assert.equal(result.entries.length, 1);
            assert.equal(
              result.entries[0].descriptionHtml,
              legacyVacancy().descriptionHtml
            );
            assert.deepEqual(result.cacheMigration, {
              imported: 1,
              existing: 0,
              invalid: [],
            });
          },
          { store }
        );
      });
    }
  );
}
