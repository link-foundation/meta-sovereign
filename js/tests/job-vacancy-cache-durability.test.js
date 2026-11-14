import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { createVacancyService } from '../src/jobs/service.js';
import { validateVacancySearch } from '../src/jobs/search-result.js';
import {
  vacancySnapshotFixture,
  searchFixture,
} from '../../experiments/issue-56/vacancy-fixture.mjs';

for (const existing of [false, true]) {
  test(
    `a rejected description put preserves ${existing ? 'acknowledged prose' : 'an absent cache'} for selection`,
    { timeout: 3000 },
    async () => {
      const driver = createInMemoryDriver();
      const entered = Promise.withResolvers();
      const release = Promise.withResolvers();
      const failure = Object.assign(new Error('fixture cache quota'), {
        code: 'ENOSPC',
      });
      let failNext = false;
      const store = await createBrowserStore({
        driver: {
          load: driver.load,
          async save(snapshot) {
            if (failNext) {
              failNext = false;
              entered.resolve();
              await release.promise;
              throw failure;
            }
            await driver.save(snapshot);
          },
        },
      });
      const native = vacancySnapshotFixture();
      let description = 'Acknowledged description.';
      const service = createVacancyService({
        store,
        readVacancy: async () => ({ ...native, description }),
        readSearch: async (url) =>
          validateVacancySearch(
            searchFixture(url, [{ ...native, responded: false }]),
            url
          ),
      });
      let rejected, reading, stopping;
      try {
        if (existing) {
          await service.collect({ url: native.url });
        }
        const before = await service.stored();
        description = 'Unacknowledged exclusion phrase.';
        failNext = true;
        rejected = assert.rejects(
          service.collect({ url: native.url, refresh: true }),
          (error) => error === failure
        );
        await entered.promise;
        assert.equal(
          (await store.query())[0].description,
          description,
          'The actual store admits the attempted prose before persistence'
        );
        let readDone = false;
        reading = service.stored().then((value) => {
          readDone = true;
          return value;
        });
        await nextTurn();
        const readWasHeld = !readDone;
        release.resolve();
        await rejected;
        assert.deepEqual(
          await service.stored(),
          before,
          'A rejected collection must retain only acknowledged descriptions'
        );
        assert.equal(readWasHeld, true);
        assert.deepEqual(await reading, before);
        assert.deepEqual(
          (await driver.load())?.links ?? [],
          before.entries.map((row) => ({
            ...row,
            version: 1,
            tokens: ['assignment', 'vacancy'],
            children: [],
          }))
        );
        const result = await service.search({
          excludeText: 'Unacknowledged exclusion phrase',
        });
        assert.equal(
          result.selection.decisions[0].reason,
          existing ? 'review' : 'needs-description'
        );
        stopping = service.stop();
        await stopping;
      } finally {
        release.resolve();
        await Promise.allSettled([rejected, reading, stopping]);
        await service.stop();
        await store.close();
      }
    }
  );
}
