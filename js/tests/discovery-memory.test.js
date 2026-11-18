import test from 'node:test';
import assert from 'node:assert/strict';
import { createVacancyService } from '../src/jobs/service.js';
import { discoveryOptions } from '../src/jobs/discovery-data.js';
import {
  rememberRunVacancy,
  runVacancy,
  clearRunVacancies,
} from '../src/assignments/vacancy-run-context.js';
import { resolveAssignmentVacancy } from '../src/assignments/vacancy.js';
import {
  discoveryFixture,
  discoveryInput,
} from '../../experiments/issue-56/discovery-fixture.mjs';
import { vacancySnapshotFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';

const options = { timeout: 5000 };
const memory = { collectVacancies: false };
const run = async (f, input = {}) => {
  await f.start({ ...memory, ...input });
  return (await f.drain()).discovery;
};
const descriptions = (store) =>
  store.query((row) => row.id.startsWith('assignment-vacancy:'));

test(
  'discovery freezes explicit collection flags without changing legacy signatures',
  options,
  () => {
    const legacy = discoveryOptions(discoveryInput);
    assert.equal(Object.hasOwn(legacy, 'collectVacancies'), false);
    for (const value of [true, false]) {
      assert.equal(
        discoveryOptions({ ...discoveryInput, collectVacancies: value })
          .collectVacancies,
        value
      );
    }
    for (const value of [null, 0, 'false', [], {}]) {
      assert.throws(
        () => discoveryOptions({ ...discoveryInput, collectVacancies: value }),
        { code: 'jobs-discovery-unconfirmed' }
      );
    }
  }
);

test(
  'disabled discovery collection still filters complete descriptions and shares bounded RAM with planners',
  options,
  async (t) => {
    const f = discoveryFixture(t);
    const job = await run(f);
    assert.equal(job.phase, 'completed');
    assert.equal(job.options.collectVacancies, false);
    assert.deepEqual(
      job.entries.map((row) => row.decision.reason),
      ['review', 'responded', 'configured-text']
    );
    assert.equal(f.descriptions.length, 2);
    assert.deepEqual(await descriptions(f.store), []);
    const url = job.entries[0].card.url;
    const temporary = runVacancy(f.store, url);
    assert.equal(temporary.description, 'A complete eligible description.');
    const resolved = await resolveAssignmentVacancy(
      {
        store: f.store,
        readVacancy: () => assert.fail('reuse current context'),
      },
      { vacancyUrl: url },
      {}
    );
    assert.equal(resolved.vacancy.description, temporary.description);
    const journal = JSON.stringify(await f.store.query());
    assert(!journal.includes(temporary.description));
    assert(!journal.includes('An excluded description.'));
    await run(f, { requestId: 'second' });
    assert.equal(
      f.descriptions.length,
      2,
      'another finite run reuses current RAM'
    );
    assert.deepEqual(await descriptions(f.store), []);
  }
);

test(
  'discovery status survives owner shutdown without restoring descriptions or replaying reads',
  options,
  async (t) => {
    const f = discoveryFixture(t);
    const job = await run(f);
    await f.service.stop();
    assert.equal(runVacancy(f.store, job.entries[0].card.url), null);
    const restarted = createVacancyService(f.serviceOptions);
    t.after(() => restarted.stop());
    const status = await restarted['discovery-status']({});
    assert.deepEqual(status.discovery, job);
    assert.equal(f.descriptions.length, 2);
    const repeated = await restarted['discovery-start']({
      ...discoveryInput,
      ...memory,
    });
    assert.deepEqual(repeated.discovery, job);
    assert.equal(
      f.descriptions.length,
      2,
      'same request never restarts native work'
    );
    assert.deepEqual(await descriptions(f.store), []);
  }
);

test(
  'a disabled refresh preserves acknowledged disk content and later reuses only temporary content',
  options,
  async (t) => {
    let fresh = false;
    const f = discoveryFixture(t, {
      readVacancy: async (url) => ({
        ...vacancySnapshotFixture(),
        url,
        description: fresh
          ? 'New temporary employer description.'
          : 'Original saved employer description.',
      }),
    });
    await f.start();
    await f.drain();
    const saved = await descriptions(f.store);
    await run(f, { requestId: 'cached' });
    assert.equal(
      f.descriptions.length,
      2,
      'existing acknowledged descriptions are reused'
    );
    fresh = true;
    const job = await run(f, { requestId: 'refresh', refresh: true });
    assert.equal(f.descriptions.length, 4);
    assert.deepEqual(await descriptions(f.store), saved);
    assert.equal(
      runVacancy(f.store, job.entries[0].card.url).description,
      'New temporary employer description.'
    );
    await run(f, { requestId: 'reuse-new' });
    assert.equal(f.descriptions.length, 4);
    await f.service.stop();
    assert.deepEqual(await descriptions(f.store), saved);
  }
);

test(
  'a refused temporary refresh retains earlier RAM and publishes no completed entry',
  options,
  async (t) => {
    let refuse = false;
    const f = discoveryFixture(t, {
      readVacancy: async (url) => ({
        ...vacancySnapshotFixture(),
        url: refuse ? 'https://hh.ru/vacancy/999' : url,
      }),
    });
    const job = await run(f);
    const previous = runVacancy(f.store, job.entries[0].card.url);
    refuse = true;
    const failed = await run(f, { requestId: 'refused', refresh: true });
    assert.equal(failed.phase, 'failed');
    assert.deepEqual(failed.entries, []);
    assert.deepEqual(runVacancy(f.store, previous.url), previous);
    assert.deepEqual(await descriptions(f.store), []);
  }
);

test(
  'discovery shutdown clears its own RAM and preserves another owner',
  options,
  async (t) => {
    const f = discoveryFixture(t);
    const other = {};
    const snapshot = {
      ...vacancySnapshotFixture(),
      url: 'https://hh.ru/vacancy/999',
    };
    rememberRunVacancy(f.store, other, snapshot);
    t.after(() => clearRunVacancies(f.store, other));
    const job = await run(f);
    await f.service.stop();
    assert.equal(runVacancy(f.store, job.entries[0].card.url), null);
    assert.equal(
      runVacancy(f.store, snapshot.url).description,
      snapshot.description
    );
  }
);
