import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { cvPrepareFixture } from '../../experiments/issue-56/cv-prepare-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

const withFixture = async (work) => {
  const f = await cvPrepareFixture();
  try {
    await work(f);
  } finally {
    await f.close();
  }
};
const identity = ({ requestId, browserSlot }) => ({ requestId, browserSlot });

test('cancelling an unreceived preparation durably blocks its late POST and survives restart', async () => {
  await withFixture(async (f) => {
    const input = identity(f.input);
    const cancelled = await f.service['cv-prepare-cancel'](input);
    assert.equal(cancelled.preparation, null);
    assert.equal(cancelled.cancellation.state, 'cancelled');
    assert.equal(cancelled.cancellation.providerSaved, false);
    assert.equal(cancelled.cancellation.requestId, input.requestId);
    assert.equal(Object.hasOwn(cancelled.cancellation, 'language'), false);
    assert.deepEqual(await f.service['cv-prepare'](f.input), cancelled);
    assert.deepEqual(await f.service['cv-prepare-cancel'](input), cancelled);
    assert.deepEqual(await f.service['cv-prepare-status'](input), cancelled);
    const second = createVacancyService({ store: f.store });
    try {
      assert.deepEqual(await second['cv-prepare'](f.input), cancelled);
      assert.deepEqual(await second['cv-prepare-status'](input), cancelled);
    } finally {
      await second.stop();
    }
    assert.deepEqual(f.calls, { attached: 0, detached: 0, prepared: 0 });
    await assert.rejects(
      f.service['cv-prepare-cancel']({ ...input, browserSlot: 'different' }),
      { code: 'jobs-cv-state' }
    );
    await f.service['cv-prepare']({ ...f.input, requestId: randomUUID() });
    assert.equal(f.calls.prepared, 1);
  });
});

test('a failed cancellation flush cannot acknowledge cancellation or open a browser', async () => {
  await withFixture(async (f) => {
    f.store.flush = async () => {
      throw new Error('fixture disk unavailable');
    };
    await assert.rejects(f.service['cv-prepare-cancel'](identity(f.input)));
    assert.equal(
      await f.store.get(`jobs-cv-prepare:${f.input.requestId}`),
      null
    );
    assert.deepEqual(await f.service['cv-prepare-status'](identity(f.input)), {
      preparation: null,
    });
    assert.equal(f.calls.attached, 0);
    delete f.store.flush;
    const retried = await f.service['cv-prepare-cancel'](identity(f.input));
    assert.equal(retried.cancellation.state, 'cancelled');
    assert.deepEqual(await f.service['cv-prepare'](f.input), retried);
    assert.equal(f.calls.attached, 0);
  });
});

test('cancellation waits for admitted preparation and never claims to undo a native draft', async () => {
  await withFixture(async (f) => {
    assert.equal(typeof f.service['cv-prepare-cancel'], 'function');
    const entered = gate();
    const release = gate();
    f.prepare(async ({ phase, check }) => {
      await phase('preparing');
      entered.resolve();
      await release.promise;
      check();
    });
    const preparing = f.service['cv-prepare'](f.input);
    await entered.promise;
    let settled = false;
    const cancel = f.service['cv-prepare-cancel'](identity(f.input)).then(
      (answer) => {
        settled = true;
        return answer;
      }
    );
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(f.calls.detached, 0);
    release.resolve();
    const prepared = await preparing;
    assert.deepEqual(await cancel, prepared);
    assert.equal(prepared.preparation.state, 'prepared');
    assert.equal(Object.hasOwn(prepared, 'cancellation'), false);
    assert.equal(f.calls.detached, 1);
  });
});

test('another service sharing the store cannot acknowledge or replay a cancellation before its flush', async () => {
  await withFixture(async (f) => {
    const entered = gate();
    const release = gate();
    f.store.flush = async () => {
      entered.resolve();
      await release.promise;
    };
    const second = createVacancyService({
      store: f.store,
      cvPrepare: f.cvPrepare,
    });
    try {
      const cancellation = f.service['cv-prepare-cancel'](identity(f.input));
      await entered.promise;
      let reads = 0;
      let starts = 0;
      const status = second['cv-prepare-status'](identity(f.input)).then(
        (answer) => {
          reads++;
          return answer;
        }
      );
      const late = second['cv-prepare'](f.input).then((answer) => {
        starts++;
        return answer;
      });
      await setImmediate();
      assert.equal(reads, 0);
      assert.equal(starts, 0);
      assert.equal(f.calls.attached, 0);
      release.resolve();
      const result = await cancellation;
      assert.deepEqual(await status, result);
      assert.deepEqual(await late, result);
      assert.equal(f.calls.attached, 0);
    } finally {
      release.resolve();
      await second.stop();
    }
  });
});
