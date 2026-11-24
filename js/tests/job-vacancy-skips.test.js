import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';
import {
  vacancySkipResult,
  vacancySkipId,
} from '../src/jobs/vacancy-skip-data.js';
import { observeVacancySkip } from '../src/jobs/vacancy-skip-service.js';
import { privateSyncId } from '../src/sync/reconcile-records.js';
import {
  applicationInput,
  applicationFixture,
} from '../../experiments/issue-56/application-fixture.mjs';
import {
  observedSkip,
  skipSnapshot,
} from '../../experiments/issue-56/vacancy-skip-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';
import { discoveryFixture } from '../../experiments/issue-56/discovery-fixture.mjs';
import {
  applicationBatchFixture,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import { verifyUncertainHold } from '../../experiments/issue-56/application-hold-fixture.mjs';

test('a later employer link updates the same refusal without counting another attempt', async (t) => {
  const f = applicationFixture();
  t.after(() => f.close());
  let receipt = await f.enter();
  f.state.page.external = true;
  const read = async () => {
    receipt = await f.service['application-read']({
      ...applicationInput,
      revision: receipt.revision,
    });
    return f.service['skips-stored']({});
  };
  const before = await read();
  assert.equal(before.entries[0].externalUrl, null);
  assert.equal(before.entries[0].prefillCommand, null);
  f.state.page.externalUrl = 'https://employer.example/later';
  const after = await read();
  const entry = after.entries[0];
  assert.notEqual(after.revision, before.revision);
  assert.equal(entry.externalUrl, f.state.page.externalUrl);
  assert(entry.prefillCommand.includes('--url='));
  assert.equal(entry.attempts, before.entries[0].attempts);
  assert.equal(entry.time, before.entries[0].time);
  assert.equal(entry.requestId, before.entries[0].requestId);
  delete f.state.page.externalUrl;
  assert.deepEqual(await read(), after, 'missing links retain known metadata');
  const restarted = createVacancyService({ store: f.store });
  try {
    assert.deepEqual(await restarted['skips-stored']({}), after);
  } finally {
    await restarted.stop();
  }
  assert.equal(f.state.submitted, 0);
});

test('clearing a recorded refusal cannot release an uncertain provider dispatch', async (t) => {
  const { fixture, receipt } = await verifyUncertainHold(
    t,
    'resumeNotVisible',
    true,
    'resume-not-visible'
  );
  const snapshot = await fixture.service['skips-stored']({});
  assert.equal(snapshot.entries[0].reason, 'resume_not_visible');
  await fixture.service['application-close']({
    ...applicationInput,
    revision: receipt.revision,
  });
  await fixture.service['skip-clear']({
    revision: snapshot.revision,
    url: applicationInput.url,
  });
  const status = await fixture.service['application-status'](applicationInput);
  assert.equal(status.delivery, 'unknown');
  assert.equal(status.attempted.submit, true);
  const reopened = await fixture.service['application-open'](applicationInput);
  assert.equal(reopened.delivery, 'unknown');
  assert.equal(fixture.state.opened, 1);
});

for (const reason of [
  'external_site',
  'resume_not_visible',
  'vacancy_unavailable',
]) {
  test(
    `native ${reason} refusals are private, durable and separate from owner choices`,
    { timeout: 5000 },
    async (t) => {
      const directory = await mkdtemp(join(tmpdir(), 'ms-native-skip-'));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const filename = join(directory, 'private.lino');
      const store = await createLinoTextStore(filename);
      const f = await observedSkip(t, reason, { store });
      const entry = f.snapshot.entries[0];
      assert.equal(entry.url, applicationInput.url);
      assert.equal(entry.reason, reason);
      assert.equal(entry.title, 'Python engineer');
      assert.equal(entry.attempts, 1);
      assert(Number.isFinite(Date.parse(entry.time)));
      assert.equal(
        entry.externalUrl,
        reason === 'external_site' ? 'https://employer.example/apply' : null
      );
      assert.equal(privateSyncId(vacancySkipId('jobs')), true);
      assert.deepEqual((await f.service['choices-stored']({})).entries, []);
      const read = await f.service['application-read'](f.identity);
      assert.deepEqual(
        await f.service['skips-stored']({}),
        f.snapshot,
        'polling cannot invent additional attempts'
      );
      await f.service['application-close']({
        ...f.identity,
        revision: read.revision,
      });
      await f.close();
      const reopened = await createLinoTextStore(filename);
      const restarted = createVacancyService({
        store: reopened,
        openSession: async () => assert.fail('Skipped vacancy must not open'),
      });
      try {
        assert.deepEqual(await restarted['skips-stored']({}), f.snapshot);
        assert.deepEqual(
          (await restarted['skips-stored']({ browserSlot: 'other' })).entries,
          []
        );
        await assert.rejects(restarted['application-open'](applicationInput), {
          code: 'jobs-application-skipped',
        });
        const cleared = await restarted['skip-clear']({
          revision: f.snapshot.revision,
          url: entry.url,
        });
        assert.deepEqual(cleared.entries, []);
        assert.notEqual(cleared.revision, f.snapshot.revision);
        const status = await restarted['application-status'](applicationInput);
        assert.equal(
          status.attempted.enter,
          true,
          'clearing does not erase issued reservations'
        );
        assert.equal(status.delivery, 'none');
        assert.equal(f.state.submitted, 0);
      } finally {
        await restarted.stop();
        await reopened.close();
      }
    }
  );
}

test('skip clears require a current revision and never erase other reasons or owner choices', async (t) => {
  const f = await observedSkip(t);
  await assert.rejects(
    f.service['skip-clear']({
      revision: f.snapshot.revision,
      url: applicationInput.url,
    }),
    { code: 'jobs-busy' }
  );
  await f.service['application-close'](f.identity);
  const owner = await f.service['choice-save']({
    ...applicationInput,
    revision: 'empty',
    state: 'deferred',
    title: 'Owner',
    note: 'Keep this',
  });
  await assert.rejects(
    f.service['skip-clear']({ revision: 'empty', reason: 'external_site' }),
    { code: 'jobs-skip-conflict' }
  );
  assert.throws(() => f.service['skip-clear']({ reason: 'external_site' }));
  assert.throws(() =>
    f.service['skip-clear']({
      revision: f.snapshot.revision,
      reason: 'external_site',
      url: applicationInput.url,
    })
  );
  const unchanged = await f.service['skip-clear']({
    revision: f.snapshot.revision,
    reason: 'resume_not_visible',
  });
  assert.deepEqual(unchanged.entries, f.snapshot.entries);
  const cleared = await f.service['skip-clear']({
    revision: unchanged.revision,
    reason: 'external_site',
  });
  assert.deepEqual(cleared.entries, []);
  await assert.rejects(
    f.service['skip-clear']({
      revision: unchanged.revision,
      reason: 'external_site',
    }),
    { code: 'jobs-skip-conflict' }
  );
  assert.deepEqual(await f.service['choices-stored']({}), owner);
});

test('only bound native refusal evidence records a skip; positive delivery removes it', async () => {
  const store = createMemoryStore();
  const row = {
    ...applicationInput,
    browserSlot: 'jobs',
    delivery: 'none',
    vacancy: { title: 'Engineer' },
    page: { bound: true, external: true },
  };
  try {
    for (const page of [
      { bound: false, external: true },
      { bound: true, external: true, challenge: true },
      { bound: true, external: true, dailyLimit: true },
      { bound: true },
    ]) {
      await observeVacancySkip(store, { ...row, page });
      assert.equal(await store.get(vacancySkipId('jobs')), null);
    }
    await observeVacancySkip(store, row, () => 0);
    const first = await store.get(vacancySkipId('jobs'));
    await observeVacancySkip(store, {
      ...row,
      page: { bound: true, delivered: true },
    });
    assert.deepEqual(
      await store.get(vacancySkipId('jobs')),
      first,
      'unconfirmed page text cannot erase the refusal'
    );
    await observeVacancySkip(
      store,
      { ...row, requestId: 'another-run' },
      () => 1000
    );
    assert.equal(
      (await store.get(vacancySkipId('jobs'))).entries[0].attempts,
      2
    );
    await observeVacancySkip(store, {
      ...row,
      delivery: 'provider-confirmed',
      page: { bound: true, delivered: true },
    });
    assert.deepEqual((await store.get(vacancySkipId('jobs'))).entries, []);
  } finally {
    await store.close?.();
  }
});

test('failed native skip persistence preserves the issued journal and can be retried without sending', async (t) => {
  const f = applicationFixture();
  t.after(() => f.close());
  let receipt = await f.enter();
  const flush = f.store.flush?.bind(f.store) ?? (async () => {});
  let fail = true;
  f.store.flush = async () => {
    if (fail && (await f.store.get(vacancySkipId('jobs')))) {
      fail = false;
      throw new Error('skip flush refused');
    }
    return flush();
  };
  f.state.page.resumeNotVisible = true;
  await assert.rejects(
    f.service['application-read']({
      ...applicationInput,
      revision: receipt.revision,
    }),
    /skip flush refused/u
  );
  assert.deepEqual((await f.service['skips-stored']({})).entries, []);
  receipt = await f.service['application-status'](applicationInput);
  assert.equal(receipt.attempted.enter, true);
  assert.equal(receipt.state, 'resume-not-visible');
  await f.service['application-read']({
    ...applicationInput,
    revision: receipt.revision,
  });
  assert.equal((await f.service['skips-stored']({})).entries[0].attempts, 1);
  assert.equal(f.state.submitted, 0);
});

test(
  'skip readers and Stop drain a failed clear before exposing the restored acknowledged snapshot',
  { timeout: 3000 },
  async (t) => {
    const f = await observedSkip(t);
    await f.service['application-close'](f.identity);
    const started = gate(),
      release = gate();
    f.store.flush = async () => {
      started.resolve();
      await release.promise;
      throw new Error('clear flush refused');
    };
    const rejected = assert.rejects(
      f.service['skip-clear']({
        revision: f.snapshot.revision,
        reason: 'external_site',
      }),
      /clear flush refused/u
    );
    await started.promise;
    let readDone = false,
      stopDone = false;
    const reading = f.service['skips-stored']({}).then((value) => {
      readDone = true;
      return value;
    });
    const stopping = f.service.stop().then(() => {
      stopDone = true;
    });
    await Promise.resolve();
    assert.equal(readDone, false);
    assert.equal(stopDone, false);
    release.resolve();
    await Promise.all([rejected, stopping]);
    assert.deepEqual(await reading, f.snapshot);
  }
);

test('skip records refuse foreign identities, malformed metadata and registry overflow without overwriting data', async () => {
  const good = skipSnapshot();
  const entry = good.entries[0];
  for (const bad of [
    { ...good, browserSlot: 'other' },
    { ...good, revision: 'empty' },
    { ...good, entries: [entry, entry] },
    ...[
      { reason: 'invented' },
      { time: 'never' },
      { attempts: 0 },
      { requestId: '../other' },
      { externalUrl: 'javascript:alert(1)' },
      { url: 'https://hh.ru.evil.test/vacancy/123' },
    ].map((change) => ({ ...good, entries: [{ ...entry, ...change }] })),
  ]) {
    assert.throws(() => vacancySkipResult(bad));
  }
  const full = skipSnapshot({
    entries: Array.from({ length: 1000 }, (_, index) => ({
      ...entry,
      url: `https://hh.ru/vacancy/${1000 + index}`,
    })),
  });
  const store = createMemoryStore();
  try {
    await store.put({ id: vacancySkipId('jobs'), ...full });
    await assert.rejects(
      observeVacancySkip(store, {
        ...applicationInput,
        browserSlot: 'jobs',
        page: { bound: true, external: true },
      }),
      { code: 'jobs-skip-state' }
    );
    assert.deepEqual(await store.get(vacancySkipId('jobs')), {
      id: vacancySkipId('jobs'),
      ...full,
    });
  } finally {
    await store.close?.();
  }
});

test(
  'discovery refuses durable native skips before description collection and binds its revision',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t);
    const skips = skipSnapshot();
    await f.store.put({ id: vacancySkipId('jobs'), ...skips });
    await f.start();
    const result = await f.drain();
    const item = result.discovery.entries.find(
      (row) => row.card.url === applicationInput.url
    );
    assert.equal(item.decision.reason, 'native-skip');
    assert.equal(item.decision.skipReason, 'external_site');
    assert.equal(item.skipRevision, skips.revision);
    assert.equal(
      f.descriptions.some(
        (row) =>
          row === applicationInput.url || row.url === applicationInput.url
      ),
      false
    );
  }
);

test(
  'batch admission excludes durable refusals without opening or submitting a vacancy',
  { timeout: 5000 },
  async (t) => {
    const f = applicationBatchFixture(t);
    const snapshot = skipSnapshot();
    await f.store.put({
      id: vacancySkipId('jobs'),
      ...snapshot,
      entries: batchUrls.map((url) => ({ ...snapshot.entries[0], url })),
    });
    await f.start();
    await f.service['application-batch-drain']({});
    const result = await f.status();
    assert.equal(result.batch.phase, 'completed');
    assert.equal(result.batch.cursor, 2);
    assert.equal(result.batch.skipped, 2);
    assert.equal(f.state.opened, 0);
    assert.equal(f.state.submitted, 0);
  }
);
