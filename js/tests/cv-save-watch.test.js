import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVacancyService } from '../src/jobs/service.js';
import { attachCvWatchBrowser } from '../src/jobs/cv-watch-browser.js';
import {
  cvSaveAttempt,
  verifyCvSave,
} from '../src/jobs/cv-watch-verification.js';
import {
  cvWatchOptions,
  cvWatchResult,
  cvSnapshotsResult,
} from '../src/jobs/cv-watch-record.js';
import {
  cvWatchFixture,
  cvWatchAttempt,
  cvWatchHash,
  cvWatchRaw,
} from '../../experiments/issue-56/cv-watch-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

const input = () => ({
  browserSlot: 'jobs',
  requestId: randomUUID(),
  durationMs: 1000,
});
const withWatch = async (work) => {
  const fixture = cvWatchFixture();
  try {
    await work(fixture, input());
  } finally {
    await fixture.service.stop();
  }
};
test('existing CV attachment binds the saved browser and exact target without launch or navigation', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'ms-cv-attach-'));
  let connections = 0;
  let detach = 0;
  const saved = {
    userDataDir: folder,
    remoteDebuggingPort: 9333,
    webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/browser/abc-123',
    targetId: 'ABC123',
  };
  const file = path.join(folder, '.browser-commander-session.json');
  const loadCommander = async () => ({
    connectBrowser: async (options) => {
      connections++;
      assert.deepEqual(options, {
        engine: 'playwright',
        wsEndpoint: saved.webSocketDebuggerUrl,
        targetId: 'ABC123',
        fallback: false,
        timeout: 10000,
      });
      return {
        page: { url: () => cvWatchAttempt().url },
        detach: async () => {
          detach++;
        },
      };
    },
    makeBrowserCommander: () => ({ destroy: async () => {} }),
  });
  try {
    await writeFile(file, JSON.stringify(saved));
    const session = await attachCvWatchBrowser({
      browserSlot: 'jobs',
      profileDir: folder,
      loadCommander,
    });
    await session.detach();
    assert.equal(detach, 1);
    for (const patch of [
      { userDataDir: '/wrong' },
      { webSocketDebuggerUrl: 'ws://evil.test:9333/devtools/browser/abc' },
      { targetId: 'missing/target' },
      { remoteDebuggingPort: 9444 },
    ]) {
      await writeFile(file, JSON.stringify({ ...saved, ...patch }));
      await assert.rejects(
        attachCvWatchBrowser({
          browserSlot: 'jobs',
          profileDir: folder,
          loadCommander,
        })
      );
    }
    assert.equal(connections, 1);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('trusted final Save is verified by fresh saved values and only then replaces a snapshot', async () =>
  withWatch(async (f, request) => {
    await f.service['cv-watch'](request);
    assert.deepEqual((await f.service['cv-snapshots']({})).snapshots, []);
    await f.emit('save');
    const saved = await f.wait('saved');
    assert.equal(saved.watch.saves, 1);
    const snapshots = await f.service['cv-snapshots']({});
    assert.equal(snapshots.snapshots[0].cv.about, 'Final owner revision');
    assert.equal(
      snapshots.snapshots[0].evidence,
      'verified-owner-save-native-export'
    );
    const row = await f.store.get(`jobs-cv-watch:${request.requestId}`);
    assert.ok(row.fingerprint);
    assert.equal(JSON.stringify(row).includes('Final owner revision'), false);
    await f.service['cv-watch-stop'](request);
    assert.equal(f.page.listenerCount('domcontentloaded'), 0);
    assert.deepEqual(f.counts(), { attached: 1, detached: 1, reads: 1 });
  }));
test('mismatched or still-open saves retain prior snapshots and expose not-saved', async () =>
  withWatch(async (f, request) => {
    await f.service['cv-watch'](request);
    await f.emit('save');
    await f.wait('saved');
    const before = await f.service['cv-snapshots']({});
    f.exports([
      {
        hash: cvWatchHash,
        cv: { ...cvWatchRaw(), about: 'Old server value' },
        sha256: 'b'.repeat(64),
      },
    ]);
    await f.emit('save');
    assert.equal((await f.wait('not-saved')).watch.code, 'jobs-cv-mismatch');
    assert.deepEqual(await f.service['cv-snapshots']({}), before);
    const reads = f.counts().reads;
    f.formOpen(true);
    await f.emit('save');
    assert.equal((await f.wait('not-saved')).watch.code, 'jobs-cv-form-open');
    assert.equal(f.counts().reads, reads);
  }));
for (const event of ['cancel', 'edit']) {
  test(`${event} invalidates pending native readback without publishing or replaying Save`, async () =>
    withWatch(async (f, request) => {
      const read = gate();
      const entered = gate();
      f.beforeRead(async () => {
        entered.resolve();
        await read.promise;
      });
      await f.service['cv-watch'](request);
      await f.emit('save');
      await entered.promise;
      await f.emit(event);
      read.resolve();
      await f.wait(event === 'cancel' ? 'cancelled' : 'edited');
      assert.deepEqual((await f.service['cv-snapshots']({})).snapshots, []);
      await f.service['cv-watch-stop'](request);
      assert.equal(f.counts().reads, 1);
    }));
}
test('Stop drains a pending native readback and disconnects without closing the owner tab', async () =>
  withWatch(async (f, request) => {
    const read = gate();
    const entered = gate();
    f.beforeRead(async () => {
      entered.resolve();
      await read.promise;
    });
    await f.service['cv-watch'](request);
    await f.emit('save');
    await entered.promise;
    let finished = false;
    const stop = f.service['cv-watch-stop'](request).then((result) => {
      finished = true;
      return result;
    });
    await Promise.resolve();
    assert.equal(finished, false);
    read.resolve();
    assert.equal((await stop).watch.state, 'stopped');
    assert.equal(f.counts().detached, 1);
    assert.equal((await f.service['cv-snapshots']({})).snapshots.length, 0);
  }));
test('watch admission is durable and repeat IDs or restart status never attach again', async () =>
  withWatch(async (f, request) => {
    const first = await f.service['cv-watch'](request);
    assert.equal(
      (await f.service['cv-watch'](request)).watch.requestId,
      first.watch.requestId
    );
    await assert.rejects(
      f.service['cv-watch']({ ...request, durationMs: 2000 }),
      { code: 'jobs-cv-conflict' }
    );
    await assert.rejects(f.service.resumes({}), { code: 'jobs-busy' });
    const restarted = createVacancyService(f.options);
    try {
      assert.equal(
        (await restarted['cv-watch-status'](request)).watch.state,
        'interrupted'
      );
      assert.equal(
        (await restarted['cv-watch'](request)).watch.state,
        'interrupted'
      );
      assert.equal(f.counts().attached, 1);
    } finally {
      await restarted.stop();
    }
  }));
test('wrong frames and malformed fields cannot create saved snapshots', async () =>
  withWatch(async (f, request) => {
    await f.service['cv-watch'](request);
    await f.emit('save', cvWatchAttempt(), { page: f.page, frame: {} });
    assert.equal(f.counts().reads, 0);
    await f.emit('save', { ...cvWatchAttempt(), hash: 'different' });
    await f.wait('failed');
    assert.equal(f.counts().reads, 0);
  }));
test('failed snapshot durability rolls back data and never acknowledges a verified save', async () =>
  withWatch(async (f, request) => {
    await f.service['cv-watch'](request);
    let fail = true;
    f.store.flush = async () => {
      if (fail && (await f.store.get('jobs-cv-snapshots:jobs'))) {
        fail = false;
        throw new Error('disk fixture');
      }
    };
    await f.emit('save');
    await f.wait('not-saved');
    assert.deepEqual((await f.service['cv-snapshots']({})).snapshots, []);
    assert.equal((await f.service['cv-watch-status']({})).watch.saves, 0);
  }));
test('workplace verification checks exact dates, all CV selections and every visible metadata field', () => {
  const raw = {
    kind: 'workplace',
    url: 'https://hh.ru/profile/edit/experience/123',
    recordId: '123',
    company: 'Employer',
    position: 'Engineer',
    description: 'Final work',
    start: 'January 2020',
    end: 'May 2024',
    current: false,
    metadataEditable: true,
    area: 'London',
    website: 'https://example.org/',
    industryText: 'Software, finance',
    resumes: [
      { hash: 'english', checked: true },
      { hash: 'russian', checked: false },
    ],
  };
  const attempt = cvSaveAttempt(raw);
  const job = {
    company: 'Employer',
    position: 'Engineer',
    description: 'Final work',
    start: '2020-01',
    end: '2024-05',
    current: false,
    area: 'London',
    website: 'example.org',
    industries: [{ id: '1.2', name: 'Software, finance', parent: 'Services' }],
  };
  const exports = [
    { hash: 'english', cv: { jobs: [job] }, industryEntries: job.industries },
    { hash: 'russian', cv: { jobs: [] } },
  ];
  assert.equal(verifyCvSave(attempt, exports), true);
  for (const patch of [
    { start: '2020-02' },
    { end: '2024-06' },
    { area: 'Paris' },
    { website: 'other.test' },
    { industries: [] },
    { description: 'Other record' },
  ]) {
    assert.equal(
      verifyCvSave(attempt, [
        { ...exports[0], cv: { jobs: [{ ...job, ...patch }] } },
        exports[1],
      ]),
      false
    );
  }
  assert.equal(verifyCvSave(attempt, [exports[0]]), false);
  assert.equal(
    verifyCvSave(attempt, [
      exports[0],
      {
        hash: 'russian',
        cv: {
          jobs: [{ ...job, description: 'An older shared record variant' }],
        },
      },
    ]),
    false
  );
  assert.equal(
    verifyCvSave(attempt, [
      exports[0],
      { hash: 'russian', cv: { jobs: [job] } },
    ]),
    false
  );
  assert.equal(
    verifyCvSave(attempt, [
      { ...exports[0], cv: { jobs: [job, job] } },
      exports[1],
    ]),
    false
  );
  assert.equal(
    verifyCvSave({ ...attempt, metadataEditable: false }, exports),
    false
  );
  assert.throws(() => cvSaveAttempt({ ...raw, start: '2020' }));
});
test('finite options and public state/snapshot validation reject contradictory identities', () => {
  for (const durationMs of [0, 999, 7200001, Infinity, '1000']) {
    assert.throws(() => cvWatchOptions({ ...input(), durationMs }));
  }
  assert.throws(() =>
    cvSaveAttempt({ ...cvWatchAttempt(), about: 'a'.repeat(24001) })
  );
  assert.throws(() => cvWatchResult({ state: 'saved' }));
  assert.throws(() =>
    cvSnapshotsResult({ browserSlot: 'jobs', snapshots: [{ hash: 'abc' }] })
  );
});
