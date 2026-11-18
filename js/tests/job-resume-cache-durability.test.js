import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createBrowserStore } from '../src/storage/browser-store.js';
import { refusedSnapshot } from './helpers/refused-snapshot.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { resumeListFixture } from '../../experiments/issue-56/resume-list-fixture.mjs';

for (const existing of [false, true]) {
  test(
    `rejected resume discovery preserves ${existing ? 'the acknowledged list' : 'an absent list'} through concurrent reads and restart`,
    { timeout: 3000 },
    async () => {
      const { driver, store, entered, release, failure, failNext } =
        await refusedSnapshot();
      let native = resumeListFixture();
      const service = createVacancyService({
        store,
        readResumes: async () => native,
      });
      let rejected, reading, reopened;
      try {
        if (existing) {
          await service.resumes({});
        }
        const before = await service['resumes-stored']();
        native = {
          ...native,
          entries: [{ ...native.entries[0], title: 'Unacknowledged CV' }],
        };
        failNext();
        rejected = assert.rejects(
          service.resumes({}),
          (error) => error === failure
        );
        await entered.promise;
        assert.equal(
          (await store.query())[0].entries[0].title,
          'Unacknowledged CV'
        );
        let readDone = false;
        reading = service['resumes-stored']().then((value) => {
          readDone = true;
          return value;
        });
        await nextTurn();
        const readWasHeld = !readDone;
        release.resolve();
        await rejected;
        assert.deepEqual(await service['resumes-stored'](), before);
        assert.equal(readWasHeld, true);
        assert.deepEqual(await reading, before);
        await service.stop();
        await store.close();
        reopened = await createBrowserStore({ driver });
        const recovered = createVacancyService({
          store: reopened,
          readResumes: () =>
            assert.fail('Recovery must never launch discovery'),
        });
        try {
          assert.deepEqual(await recovered['resumes-stored'](), before);
        } finally {
          await recovered.stop();
        }
      } finally {
        release.resolve();
        await Promise.allSettled([rejected, reading]);
        await service.stop();
        await store.close();
        await reopened?.close();
      }
    }
  );
}
