import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { confirmedCvIndustryIds } from '../src/jobs/cv-watch-industries.js';
import { cvWatchFixture } from '../../experiments/issue-56/cv-watch-fixture.mjs';
import { cvSaveRecoveryClock } from '../../experiments/issue-56/cv-save-recovery-clock.mjs';
import { verifyOwnerCvSave } from '../src/jobs/cv-save-cycle.js';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

test('industry labels require one complete interpretation within the finite lookup budget', () => {
  const entries = [
    { id: '1', name: 'Software, finance' },
    { id: '2', name: 'Software' },
    { id: '3', name: 'finance' },
  ];
  assert.equal(confirmedCvIndustryIds('Software, finance', entries), null);
  assert.deepEqual(confirmedCvIndustryIds('Software, finance', [entries[0]]), [
    '1',
  ]);
  assert.deepEqual(confirmedCvIndustryIds('', entries), []);
  assert.equal(confirmedCvIndustryIds('Software, Software', entries), null);
  const bounded = Array.from({ length: 10000 }, (_, id) => ({
    id: String(id),
    name: 'a',
  }));
  assert.equal(confirmedCvIndustryIds('a, a, a, a, a, a, a', bounded), null);
});

test('observer URL errors and oversized captures remain explicit failures without publishing', async () => {
  const f = cvWatchFixture();
  try {
    await f.service['cv-watch']({ requestId: randomUUID(), durationMs: 1000 });
    await f.emit('overflow');
    assert.equal((await f.wait('failed')).watch.code, 'jobs-cv-limit');
    assert.deepEqual((await f.service['cv-snapshots']({})).snapshots, []);
    f.page.url = () => 'not a URL';
    await f.emit('save');
    assert.equal((await f.wait('failed')).watch.code, 'jobs-cv-observer');
  } finally {
    await f.service.stop();
  }
});

test(
  'native Save navigation can destroy one form probe without losing verified readback',
  { timeout: 3000 },
  async () => {
    const { state, options } = cvSaveRecoveryClock();
    const result = await verifyOwnerCvSave(options);
    assert.equal(state.probes, 2);
    assert.equal(state.reads, 1);
    assert.equal(state.waits, 2);
    assert.equal(state.elapsed, 2);
    assert.equal(result.exports[0].cv.about, 'Final owner revision');
  }
);

test(
  'the injected verification deadline and five-read bound still refuse unconfirmed saves',
  { timeout: 3000 },
  async () => {
    const deadline = cvSaveRecoveryClock();
    deadline.options.session.commander.evaluate = async () => ({
      formOpen: true,
    });
    await assert.rejects(verifyOwnerCvSave(deadline.options), {
      code: 'jobs-cv-form-open',
    });
    assert.equal(deadline.state.elapsed, 100);
    assert.equal(deadline.state.reads, 0);
    const attempts = cvSaveRecoveryClock();
    attempts.options.session.commander.evaluate = async () => null;
    attempts.options.readExports = async () => {
      attempts.state.reads++;
      return [];
    };
    await assert.rejects(verifyOwnerCvSave(attempts.options), {
      code: 'jobs-cv-mismatch',
    });
    assert.equal(attempts.state.reads, 5);
    assert.equal(attempts.state.elapsed, 5);
  }
);

test('Cancel during snapshot durability rolls back publication before acknowledging it', async () => {
  const f = cvWatchFixture();
  const entered = gate();
  const release = gate();
  let blocked = false;
  f.store.flush = async () => {
    if (!blocked && (await f.store.get('jobs-cv-snapshots:jobs'))) {
      blocked = true;
      entered.resolve();
      await release.promise;
    }
  };
  try {
    await f.service['cv-watch']({ requestId: randomUUID(), durationMs: 1000 });
    await f.emit('save');
    await entered.promise;
    const cancelled = f.emit('cancel');
    release.resolve();
    await cancelled;
    assert.equal((await f.wait('cancelled')).watch.saves, 0);
    assert.deepEqual((await f.service['cv-snapshots']({})).snapshots, []);
  } finally {
    release.resolve();
    await f.service.stop();
  }
});

test('navigation to another CV cannot confirm the original About Save', async () => {
  const f = cvWatchFixture();
  try {
    await f.service['cv-watch']({ requestId: randomUUID(), durationMs: 1000 });
    f.page.url = () => 'https://hh.ru/resume/anotherCV';
    await f.emit('save');
    assert.equal((await f.wait('not-saved')).watch.code, 'jobs-cv-page');
    assert.equal(f.counts().reads, 0);
    assert.deepEqual((await f.service['cv-snapshots']({})).snapshots, []);
  } finally {
    await f.service.stop();
  }
});
