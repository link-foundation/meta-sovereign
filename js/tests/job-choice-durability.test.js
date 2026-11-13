import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { createVacancyService } from '../src/jobs/service.js';
import { vacancyChoiceId } from '../src/jobs/vacancy-choice.js';

for (const kind of ['choice', 'catalog']) {
  for (const existing of [false, true]) {
    test(
      `a rejected actual snapshot put restores ${existing ? 'the acknowledged' : 'the absent'} ${kind}`,
      { timeout: 3000 },
      async () => {
        const driver = createInMemoryDriver();
        const entered = Promise.withResolvers();
        const release = Promise.withResolvers();
        const error = Object.assign(new Error('fixture snapshot quota'), {
          code: 'ENOSPC',
        });
        let fail = false;
        const store = await createBrowserStore({
          driver: {
            load: driver.load,
            async save(snapshot) {
              if (fail) {
                fail = false;
                entered.resolve();
                await release.promise;
                throw error;
              }
              await driver.save(snapshot);
            },
          },
        });
        const service = createVacancyService({ store });
        const id =
          kind === 'choice'
            ? vacancyChoiceId('jobs')
            : 'jobs-technology-catalog';
        const readCurrent = () =>
          kind === 'choice'
            ? service['choices-stored']({})
            : service['technology-catalog']();
        const save = (before, failed = false) =>
          kind === 'choice'
            ? service['choice-save']({
                browserSlot: 'jobs',
                url: 'https://hh.ru/vacancy/123',
                title: 'Engineer',
                revision: before.revision,
                state: failed ? 'skipped' : 'deferred',
                note: failed
                  ? 'This failed write must not be presented as committed.'
                  : 'Keep this acknowledged note.',
              })
            : service['technology-catalog-save']({
                revision: before.revision,
                entries: [
                  {
                    canonical: failed ? 'Unconfirmed' : 'Confirmed',
                    aliases: [],
                    caseSensitive: false,
                  },
                ],
              });
        let rejected, read, stopping;
        try {
          const initial = await readCurrent();
          const before = existing ? await save(initial) : initial;
          const beforeRow = await store.get(id);
          fail = true;
          rejected = assert.rejects(
            save(before, true),
            (failure) => failure === error
          );
          await entered.promise;
          assert.notEqual(
            (await store.get(id)).revision,
            before.revision,
            'The real browser store admits memory before awaiting persistence'
          );
          let readDone = false,
            stopped = false;
          read = readCurrent().then((value) => {
            readDone = true;
            return value;
          });
          stopping = service.stop().then(() => {
            stopped = true;
          });
          await nextTurn();
          assert.equal(readDone, false);
          assert.equal(stopped, false);
          release.resolve();
          await Promise.all([rejected, stopping]);
          assert.deepEqual(await read, before);
          const saved = (await driver.load())?.links ?? [];
          assert.deepEqual(
            saved.find((row) => row.id === id) ?? null,
            beforeRow
          );
        } finally {
          release.resolve();
          await Promise.allSettled([rejected, read, stopping]);
          await service.stop();
          await store.close();
        }
      }
    );
  }
}
