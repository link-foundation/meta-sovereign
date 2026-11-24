import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
const advance = (receipt) => ({
  ...applicationInput,
  revision: receipt.revision,
  action: 'enter',
  confirm: true,
});

for (const stage of ['put', 'flush']) {
  test(
    `a failed application ${stage} retains acknowledged intent and holds readers until rollback`,
    { timeout: 3000 },
    async () => {
      const memory = createMemoryStore();
      const entered = Promise.withResolvers();
      const release = Promise.withResolvers();
      let failNext = false;
      const refused = async () => {
        if (!failNext) {
          return;
        }
        failNext = false;
        entered.resolve();
        await release.promise;
        throw Object.assign(new Error('Fixture storage refused'), {
          code: 'fixture-storage',
        });
      };
      const store = {
        ...memory,
        put: async (row) => {
          await memory.put(row);
          if (stage === 'put') {
            await refused();
          }
        },
        flush: stage === 'flush' ? refused : undefined,
      };
      const fixture = applicationFixture({ store });
      let pending, reading;
      try {
        const opened =
          await fixture.service['application-open'](applicationInput);
        failNext = true;
        pending = assert.rejects(
          fixture.service['application-advance'](advance(opened)),
          { code: 'fixture-storage' }
        );
        await entered.promise;
        assert.equal((await memory.query())[0].attempted.enter, true);
        let readDone = false;
        reading = fixture.service['application-status'](applicationInput).then(
          (value) => {
            readDone = true;
            return value;
          }
        );
        await nextTurn();
        const held = !readDone;
        release.resolve();
        await pending;
        assert.equal(held, true);
        const status = await reading;
        assert.equal(status.revision, opened.revision);
        assert.equal(status.attempted.enter, false);
        assert.equal(status.delivery, 'none');
        assert.equal((await memory.query())[0].attempted.enter, false);
        assert.equal(fixture.state.entered, 0);
        await assert.rejects(
          fixture.service['application-advance'](advance(status)),
          { code: 'jobs-application-changed' }
        );
        const refreshed = await fixture.service['application-read']({
          ...applicationInput,
          revision: status.revision,
        });
        await fixture.service['application-advance'](advance(refreshed));
        assert.equal(fixture.state.entered, 1);
      } finally {
        release.resolve();
        await Promise.allSettled([pending, reading]);
        await fixture.close();
      }
    }
  );
}

test(
  'cancellation drains an issued native effect before closing and keeps its unknown reservation',
  { timeout: 3000 },
  async () => {
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const fixture = applicationFixture({
      application: {
        dispatch: async () => {
          entered.resolve();
          await release.promise;
          return { dispatched: true };
        },
      },
    });
    const other = createVacancyService(fixture.serviceOptions);
    let pending, cancelling;
    try {
      const opened =
        await fixture.service['application-open'](applicationInput);
      pending = assert.rejects(
        fixture.service['application-advance'](advance(opened)),
        (error) => error.name === 'AbortError'
      );
      await entered.promise;
      cancelling = fixture.service.cancel();
      await nextTurn();
      assert.equal(fixture.state.closed, 0);
      await assert.rejects(other.search({}), { code: 'jobs-busy' });
      release.resolve();
      await pending;
      assert.deepEqual(await cancelling, { stopped: true });
      assert.equal(fixture.state.closed, 1);
      const status =
        await fixture.service['application-status'](applicationInput);
      assert.equal(status.state, 'interrupted');
      assert.equal(status.attempted.enter, true);
      assert.equal(status.delivery, 'unknown');
      const newSlot = await fixture.service['application-open']({
        ...applicationInput,
        browserSlot: 'other',
      });
      assert.equal(newSlot.browserSlot, 'other');
    } finally {
      release.resolve();
      await Promise.allSettled([pending, cancelling]);
      await other.stop();
      await fixture.close();
    }
  }
);

test(
  'a late browser launch is drained and closed before cancellation releases the workspace',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const launching = Promise.withResolvers();
    const release = Promise.withResolvers();
    const openSession = fixture.serviceOptions.openSession;
    const service = createVacancyService({
      ...fixture.serviceOptions,
      openSession: async (options) => {
        launching.resolve();
        await release.promise;
        return openSession(options);
      },
    });
    let pending, cancelling;
    try {
      pending = assert.rejects(
        service['application-open'](applicationInput),
        (error) => error.name === 'AbortError'
      );
      await launching.promise;
      cancelling = service.cancel();
      await nextTurn();
      assert.equal(fixture.state.opened, 0);
      release.resolve();
      await pending;
      await cancelling;
      assert.equal(fixture.state.opened, 1);
      assert.equal(fixture.state.closed, 1);
      const [row] = await fixture.store.query();
      assert.equal(row.delivery, 'none');
      assert.equal(row.attempted.enter, false);
    } finally {
      release.resolve();
      await Promise.allSettled([pending, cancelling]);
      await service.stop();
      await fixture.close();
    }
  }
);

test(
  'exact automatic submission waits for review and stops when a new question appears',
  { timeout: 3000 },
  async () => {
    const planning = Promise.withResolvers();
    const fixture = applicationFixture();
    const originalPlan = fixture.serviceOptions.application.filling.plan;
    let plans = 0;
    fixture.serviceOptions.application.filling.plan = async (...args) => {
      const report = await originalPlan(...args);
      if (++plans === 2) {
        planning.resolve();
      }
      return report;
    };
    let pending;
    try {
      const review = await fixture.enter(fixture.service, {
        autoExact: true,
        reviewDelayMs: 100,
      });
      pending = fixture.service['application-prefill']({
        ...applicationInput,
        revision: review.revision,
        confirm: true,
      });
      await planning.promise;
      fixture.state.fields[1].answer.source = 'new-question';
      const result = await pending;
      assert.equal(result.state, 'review');
      assert.equal(result.exact, false);
      assert.equal(fixture.state.submitted, 0);
    } finally {
      await pending?.catch(() => {});
      await fixture.close();
    }
  }
);

test(
  'unknown, malformed or mismatched journals never launch a recovery browser',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    let service;
    try {
      await fixture.service['application-open'](applicationInput);
      await fixture.service.stop();
      const [row] = await fixture.store.query();
      for (const altered of [
        { ...row, version: 9 },
        { ...row, signature: 'mismatch' },
        { ...row, requestId: 'foreign' },
        { ...row, attempted: { enter: 'yes', submit: false } },
        { ...row, options: { ...row.options, reviewDelayMs: -1 } },
        {
          ...row,
          vacancy: { ...row.vacancy, url: 'https://hh.ru/vacancy/999' },
        },
      ]) {
        await fixture.store.put(altered);
        service = createVacancyService(fixture.serviceOptions);
        await assert.rejects(
          service['application-open']({ ...applicationInput, recover: true })
        );
        await service.stop();
        assert.equal(fixture.state.opened, 1);
      }
    } finally {
      await service?.stop();
      await fixture.close();
    }
  }
);
