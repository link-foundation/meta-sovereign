import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { confirmedCvIndustryIds } from '../src/jobs/cv-watch-industries.js';
import {
  cvWatchFixture,
  cvWatchAttempt,
  cvWatchHash,
  cvWatchRaw,
} from '../../experiments/issue-56/cv-watch-fixture.mjs';
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

test('native Save navigation can destroy one form probe without losing verified readback', async () => {
  let probes = 0;
  let reads = 0;
  const result = await verifyOwnerCvSave({
    session: {
      page: { url: () => cvWatchAttempt().url },
      commander: {
        evaluate: async () => {
          if (++probes === 1) {
            throw new Error(
              'Execution context was destroyed during navigation'
            );
          }
          return null;
        },
      },
    },
    attempt: { ...cvWatchAttempt(), kind: 'about' },
    check: () => {},
    signal: new AbortController().signal,
    readExports: async () => {
      reads++;
      return [{ hash: cvWatchHash, cv: cvWatchRaw(), sha256: 'a'.repeat(64) }];
    },
    pollMs: 1,
    verificationMs: 100,
  });
  assert.equal(probes, 2);
  assert.equal(reads, 1);
  assert.equal(result.exports[0].cv.about, 'Final owner revision');
});

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
