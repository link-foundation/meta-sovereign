import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
test('native About preparation resolves the selected reviewed source and durable receipt without provider Save', async () => {
  await withFixture(async (f) => {
    const result = await f.service['cv-prepare'](f.input);
    assert.equal(result.preparation.state, 'prepared');
    assert.equal(result.preparation.providerSaved, false);
    assert.equal(
      result.preparation.hash,
      f.review.report.changes.find((row) => row.id === 'en:about').hash
    );
    assert.deepEqual(f.calls, { attached: 1, detached: 1, prepared: 1 });
    assert.deepEqual(await f.service['cv-prepare'](f.input), result);
    assert.deepEqual(
      await f.service['cv-prepare-status']({ browserSlot: 'jobs' }),
      result
    );
    assert.equal(f.calls.attached, 1);
    const stored = await f.store.get(`jobs-cv-prepare:${f.input.requestId}`);
    assert.equal(Object.hasOwn(stored, 'about'), false);
    assert.equal(Object.hasOwn(stored, 'before'), false);
    await assert.rejects(
      f.service['cv-prepare']({ ...f.input, changeId: 'ru:about' }),
      { code: 'jobs-cv-conflict' }
    );
    assert.equal(f.calls.attached, 1);
  });
});
test('stale reviews and missing artifact bytes fail durably before attaching', async () => {
  await withFixture(async (f) => {
    const stale = await f.service['cv-prepare']({
      ...f.input,
      fingerprint: 'f'.repeat(64),
    });
    assert.equal(stale.preparation.state, 'failed');
    assert.equal(stale.preparation.code, 'jobs-cv-conflict');
    assert.equal(stale.preparation.hash, null);
    const source = f.review.sources.find(
      (row) => row.cv.language === 'en'
    ).identity;
    await writeFile(
      join(f.artifactRoot, source.exportId, source.hash, 'resume.json'),
      '{}'
    );
    const changed = await f.service['cv-prepare']({
      ...f.input,
      requestId: randomUUID(),
    });
    assert.equal(changed.preparation.state, 'failed');
    assert.equal(f.calls.attached, 0);
  });
});
test('unselected About changes and workplace inputs cannot acquire an editor', async () => {
  await withFixture(async (f) => {
    await assert.rejects(
      f.service['cv-prepare']({ ...f.input, changeId: 'en:jobs.0.description' })
    );
    const row = await f.store.get('jobs-cv-technology-review:jobs');
    row.review.selected = [];
    await f.store.put(row);
    const result = await f.service['cv-prepare'](f.input);
    assert.equal(result.preparation.state, 'failed');
    assert.equal(f.calls.attached, 0);
  });
});
test('failed durability prevents native changes and GET never retries', async () => {
  await withFixture(async (f) => {
    f.store.flush = async () => {
      throw new Error('Disk unavailable');
    };
    await assert.rejects(f.service['cv-prepare'](f.input));
    assert.equal(f.calls.attached, 0);
    assert.deepEqual(await f.service['cv-prepare-status'](f.input), {
      preparation: null,
    });
  });
});
test('partial preparation failure is uncertain and repeated request never replays the keyboard', async () => {
  await withFixture(async (f) => {
    f.prepare(async ({ phase }) => {
      await phase('preparing');
      throw new Error('Native page disappeared');
    });
    const result = await f.service['cv-prepare'](f.input);
    assert.equal(result.preparation.state, 'uncertain');
    await f.service['cv-prepare'](f.input);
    assert.deepEqual(f.calls, { attached: 1, detached: 1, prepared: 0 });
  });
});
test('Stop drains the issued preparation before disconnecting and leaves an uncertain receipt', async () => {
  await withFixture(async (f) => {
    const entered = gate();
    const release = gate();
    f.prepare(async ({ phase, check }) => {
      await phase('preparing');
      entered.resolve();
      await release.promise;
      check();
    });
    const task = f.service['cv-prepare'](f.input);
    await entered.promise;
    const queuedId = randomUUID();
    const queued = assert.rejects(
      f.service['cv-prepare']({ ...f.input, requestId: queuedId }),
      { code: 'jobs-cv-stopped' }
    );
    const stopping = f.service.stop();
    assert.equal(f.calls.detached, 0);
    release.resolve();
    const result = await task;
    await stopping;
    await queued;
    assert.equal(result.preparation.state, 'uncertain');
    assert.equal(f.calls.detached, 1);
    assert.equal(await f.store.get(`jobs-cv-prepare:${queuedId}`), null);
  });
});
test('restart turns an incomplete preparation into an interrupted read without replay', async () => {
  await withFixture(async (f) => {
    await f.service['cv-prepare'](f.input);
    const id = `jobs-cv-prepare:${f.input.requestId}`;
    await f.store.put({ ...(await f.store.get(id)), state: 'preparing' });
    const second = createVacancyService({ store: f.store });
    try {
      assert.equal(
        (await second['cv-prepare-status'](f.input)).preparation.state,
        'interrupted'
      );
      assert.equal(
        (await second['cv-prepare'](f.input)).preparation.state,
        'interrupted'
      );
      assert.equal(f.calls.attached, 1);
    } finally {
      await second.stop();
    }
  });
});
test('busy workspace creates a failed request receipt without attaching another browser', async () => {
  await withFixture(async (f) => {
    const entered = gate();
    const release = gate();
    const other = createVacancyService({
      store: f.store,
      readSearch: async () => {
        entered.resolve();
        await release.promise;
        throw new Error('fixture');
      },
    });
    const held = other.search({ query: 'engineer' }).catch(() => {});
    await entered.promise;
    try {
      const result = await f.service['cv-prepare'](f.input);
      assert.equal(result.preparation.code, 'jobs-busy');
      assert.equal(result.preparation.state, 'failed');
      assert.equal(f.calls.attached, 0);
    } finally {
      release.resolve();
      await held;
      await other.stop();
    }
  });
});
