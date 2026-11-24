import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  discoveryFixture,
  discoveryInput,
  discoveryCard,
} from '../../experiments/issue-56/discovery-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { discoveryKey, discoveryResult } from '../src/jobs/discovery-data.js';
import { applicationBatchResult } from '../src/jobs/application-batch-data.js';
import { hhSearchUrl } from '../src/jobs/options.js';
import { validateVacancySearch } from '../src/jobs/search-result.js';
import {
  searchFixture,
  gate,
} from '../../experiments/issue-56/vacancy-fixture.mjs';
import { refusedSnapshot } from './helpers/refused-snapshot.mjs';
import { createMemoryStore } from '../src/storage/universal.js';
import { withApplicationRouteFixture } from './helpers/application-controls.mjs';
import { decodeWire, LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import { createApplicationCommands } from '../src/cli/application-command.js';

const run = async (f, input) => {
  await f.start(input);
  return (await f.drain()).discovery;
};

test('confirmed batches use the exact acknowledged discovery in their slot', async (t) => {
  const f = discoveryFixture(t);
  const discovery = await run(f, { collectVacancies: false });
  await run(f, { requestId: 'newer-discovery', query: 'Other search' });
  const input = {
    requestId: 'fixture-batch',
    discoveryRequestId: discovery.options.requestId,
    testMode: true,
    confirm: true,
  };
  const start = (changes) =>
    f.service['application-batch-start']({ ...input, ...changes });
  const counts = [f.searches.length, f.descriptions.length];
  await assert.rejects(start({ confirm: false }), {
    code: 'jobs-application-confirmation',
  });
  await assert.rejects(start({ browserSlot: 'other' }), {
    code: 'jobs-application-batch-source',
  });
  await assert.rejects(start({ urls: [discoveryCard(125).url] }), {
    code: 'jobs-application-batch-input',
  });
  const receipt = applicationBatchResult(await start(), input);
  assert.equal(receipt.batch.phase, 'completed');
  assert.equal(receipt.batch.discoveryRequestId, discovery.options.requestId);
  assert.equal(receipt.batch.total, 1);
  assert.equal(receipt.batch.settings.collectVacancies, false);
  assert.equal(
    receipt.batch.settings.applicationSearchUrl,
    hhSearchUrl(discovery.options.search)
  );
  const saved = await f.store.get(
    'secret:jobs-application-batch:jobs:fixture-batch'
  );
  assert.deepEqual(saved.options.urls, [discoveryCard(123).url]);
  assert.throws(() =>
    applicationBatchResult({ ...receipt, batch: null }, input)
  );
  assert.throws(() =>
    applicationBatchResult(receipt, {
      ...input,
      discoveryRequestId: 'newer-discovery',
    })
  );
  await assert.rejects(start({ discoveryRequestId: 'newer-discovery' }), {
    code: 'jobs-application-conflict',
  });
  await assert.rejects(start({ collectVacancies: true }), {
    code: 'jobs-application-conflict',
  });
  await f.store.put({ ...discovery, signature: 'unacknowledged' });
  await assert.rejects(start({ requestId: 'another-batch' }), {
    code: 'jobs-application-batch-source',
  });
  const restarted = createVacancyService(f.serviceOptions);
  t.after(() => restarted.stop());
  assert.deepEqual(await restarted['application-batch-start'](input), receipt);
  assert.deepEqual([f.searches.length, f.descriptions.length], counts);
});

test('interrupted and ineligible discoveries cannot admit a new batch', async (t) => {
  const f = discoveryFixture(t);
  const discovery = await run(f, { excludeText: 'description' });
  const start = () =>
    f.service['application-batch-start']({
      requestId: 'unadmitted-batch',
      discoveryRequestId: discovery.options.requestId,
      confirm: true,
    });
  assert.equal(discovery.phase, 'completed');
  assert.equal(
    discovery.entries.some((row) => row.decision.reason === 'review'),
    false
  );
  await assert.rejects(start(), { code: 'jobs-application-batch-source' });
  await f.store.put({ ...discovery, phase: 'running', reason: null });
  await assert.rejects(start(), { code: 'jobs-application-batch-source' });
  assert.equal((await f.service['application-batch-status']()).batch, null);
});

test('a discovery-backed worker rechecks newer owner exclusions before native review', async (t) => {
  const f = discoveryFixture(t);
  const browserSlot = 'named-retained-search';
  await f.start({ browserSlot });
  await f.service['discovery-drain']();
  const { discovery } = await f.status({ browserSlot });
  assert.equal(discovery.phase, 'completed');
  const counts = [f.searches.length, f.descriptions.length];
  await f.service['choice-save']({
    browserSlot,
    url: discoveryCard(123).url,
    revision: 'empty',
    state: 'skipped',
    title: 'Engineer 123',
  });
  const input = {
    browserSlot,
    requestId: 'guarded-batch',
    discoveryRequestId: discovery.options.requestId,
    confirm: true,
  };
  await f.service['application-batch-start'](input);
  await f.service['application-batch-drain']();
  const { batch } = await f.service['application-batch-status'](input);
  assert.equal(batch.phase, 'completed');
  assert.equal(batch.total, 1);
  assert.equal(batch.skipped, 1);
  assert.equal(batch.delivered, 0);
  assert.deepEqual([f.searches.length, f.descriptions.length], counts);
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`the discovery-backed batch restores its provenance through ${type}`, async (t) => {
    const f = discoveryFixture(t);
    const discovery = await run(f);
    await withApplicationRouteFixture(f, type, async (api) => {
      const input = {
        requestId: 'wire-batch',
        discoveryRequestId: discovery.options.requestId,
        testMode: true,
        confirm: true,
      };
      const receipt = await api.vacancyApplicationBatchStart(input);
      assert.equal(
        receipt.batch.discoveryRequestId,
        discovery.options.requestId
      );
      assert.equal(receipt.batch.total, 1);
      assert.deepEqual(
        await api.vacancyApplicationBatchStatus({ requestId: input.requestId }),
        receipt
      );
    });
  });
}

test('the foreground batch CLI accepts a saved discovery without a URL file', async (t) => {
  const f = discoveryFixture(t);
  const discovery = await run(f, { collectVacancies: false });
  const commands = createApplicationCommands({
    ...f.serviceOptions,
    openStore: async () => f.store,
    async *applicationInput() {
      yield 'quit';
    },
  });
  const output = [];
  const input = {
    'request-id': 'cli-batch',
    'discovery-request-id': discovery.options.requestId,
    'test-mode': true,
  };
  assert.equal(
    await commands['vacancies-application-batch'](input, (line) =>
      output.push(decodeWire(line))
    ),
    0
  );
  assert.equal(
    output.at(-1).batch.discoveryRequestId,
    discovery.options.requestId
  );
  assert.equal(output.at(-1).batch.total, 1);
  assert.equal(output.at(-1).batch.settings.collectVacancies, false);
  await assert.rejects(
    commands['vacancies-application-batch'](
      { ...input, 'vacancies-file': '/unused' },
      () => {}
    ),
    /either --vacancies-file or --discovery-request-id/u
  );
});

test(
  'an admission checkpoint consuming the lifetime expires before any browser read',
  { timeout: 5000 },
  async (t) => {
    let now = Date.UTC(2026, 10, 14);
    const store = createMemoryStore();
    const put = store.put.bind(store);
    store.put = async (record) => {
      const result = await put(record);
      if (record.id.startsWith('secret:jobs-discovery-latest:')) {
        now += 1000;
      }
      return result;
    };
    const f = discoveryFixture(t, { store, discovery: { now: () => now } });
    const receipt = await run(f, { durationMs: 1000 });
    assert.equal(receipt.phase, 'expired');
    assert.equal(receipt.entries.length, 0);
    assert.equal(f.searches.length, 0);
    assert.equal(f.descriptions.length, 0);
  }
);

test(
  'discovery freezes filters across native pagination, deduplicates identity and collects full eligible descriptions',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t);
    const receipt = await run(f);
    assert.equal(receipt.phase, 'completed');
    assert.equal(receipt.reason, 'exhausted');
    assert.equal(receipt.pages, 2);
    assert.equal(receipt.duplicates, 1);
    assert.deepEqual(
      receipt.entries.map((r) => r.decision.reason),
      ['review', 'responded', 'configured-text']
    );
    assert.equal(receipt.entries[2].decision.field, 'description');
    assert.equal(f.descriptions.length, 2);
    assert.equal((await f.service.stored()).entries.length, 2);
    const urls = f.searches.map((row) => new URL(row.url));
    assert.deepEqual(
      urls.map((url) => url.searchParams.get('page')),
      ['0', '1']
    );
    const expected = new URL(f.searches[0].url);
    expected.searchParams.delete('page');
    for (const url of urls) {
      url.searchParams.delete('page');
      assert.equal(url.href, expected.href);
    }
    assert.equal(receipt.options.search.resume, discoveryInput.resume);
    assert.equal(receipt.options.search.remote, true);
    discoveryResult(await f.status(), {});
    const searches = f.searches.length;
    await f.start();
    assert.equal(
      f.searches.length,
      searches,
      'Repeating an ID observes without replay'
    );
    await assert.rejects(f.start({ query: 'Changed' }), {
      code: 'jobs-discovery-conflict',
    });
    await f.start({ requestId: 'second-discovery' });
    await f.drain();
    assert.equal(
      f.descriptions.length,
      2,
      'New discovery reuses acknowledged description caches'
    );
  }
);
for (const [input, reason, pages, count] of [
  [{ maxPages: 1 }, 'page-limit', 1, 2],
  [{ maxVacancies: 1 }, 'vacancy-limit', 1, 1],
]) {
  test(
    `discovery completes truthfully at its ${reason}`,
    { timeout: 5000 },
    async (t) => {
      const f = discoveryFixture(t);
      const receipt = await run(f, input);
      assert.equal(receipt.reason, reason);
      assert.equal(receipt.pages, pages);
      assert.equal(receipt.entries.length, count);
      assert.equal(f.searches.length, 1);
    }
  );
}
test(
  'a later positive native response marker dominates the earlier card',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t, { laterResponded: true });
    const receipt = await run(f);
    assert.equal(receipt.entries[0].decision.reason, 'responded');
    assert.equal(receipt.entries[0].card.responded, true);
    assert.equal(f.descriptions.length, 2);
  }
);
test(
  'changed native search settings refuse without collecting descriptions',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t, {
      readSearch: async (url) => {
        const changed = new URL(url);
        changed.searchParams.set('text', 'wrong');
        return validateVacancySearch(searchFixture(changed.href), changed.href);
      },
    });
    const receipt = await run(f);
    assert.equal(receipt.phase, 'failed');
    assert.equal(receipt.code, 'jobs-search-unavailable');
    assert.equal(receipt.entries.length, 0);
    assert.equal(f.descriptions.length, 0);
  }
);
for (const ending of ['stop', 'expiry', 'service']) {
  test(
    `discovery ${ending} drains owned reads; saved status cannot recreate the worker`,
    { timeout: 5000 },
    async (t) => {
      const entered = gate();
      let closed = false;
      const f = discoveryFixture(t, {
        readSearch: async (_url, { signal }) => {
          entered.resolve();
          try {
            await delay(10000, undefined, { signal });
          } finally {
            closed = true;
          }
        },
      });
      await f.start({ durationMs: 1000 });
      await entered.promise;
      await assert.rejects(f.service.search({}), { code: 'jobs-busy' });
      if (ending === 'stop') {
        await f.service['discovery-stop'](discoveryInput);
      }
      if (ending === 'service') {
        await f.service.stop();
      }
      if (ending === 'expiry') {
        await delay(1050);
      }
      const receipt = (await f.drain()).discovery;
      assert.equal(receipt.phase, ending === 'expiry' ? 'expired' : 'stopped');
      assert(closed);
      const restarted = createVacancyService(f.serviceOptions);
      t.after(() => restarted.stop());
      assert.equal(
        (await restarted['discovery-status']({})).discovery.phase,
        receipt.phase
      );
      assert.equal(
        (
          await restarted['discovery-start']({
            ...discoveryInput,
            durationMs: 1000,
          })
        ).discovery.phase,
        receipt.phase
      );
      assert.equal(f.searches.length, 1);
    }
  );
}
for (const existing of [false, true]) {
  test(
    `refused discovery checkpoints preserve ${existing ? 'an acknowledged prefix' : 'an empty acknowledged run'}`,
    { timeout: 5000 },
    async (t) => {
      const failed = await refusedSnapshot();
      const entered = gate();
      const resume = gate();
      const f = discoveryFixture(t, {
        store: failed.store,
        readSearch: async (url) => {
          entered.resolve();
          await resume.promise;
          return validateVacancySearch(
            searchFixture(url, [discoveryCard(123)]),
            url
          );
        },
      });
      let draining;
      try {
        if (existing) {
          await f.service.collect({ url: discoveryCard(123).url });
        }
        await f.start();
        await entered.promise;
        const before = await f.status();
        failed.failNext();
        resume.resolve();
        await failed.entered.promise;
        assert.deepEqual(
          await f.status(),
          before,
          'Attempted writes cannot appear as progress'
        );
        failed.release.resolve();
        draining = f.drain();
        const receipt = (await draining).discovery;
        assert.equal(receipt.phase, 'failed');
        assert.equal(receipt.entries.length, 0);
        const cached = await f.service.stored();
        assert.equal(cached.entries.length, existing ? 1 : 0);
        const restarted = createVacancyService(f.serviceOptions);
        t.after(() => restarted.stop());
        assert.deepEqual(
          await restarted['discovery-status']({}),
          await f.status()
        );
      } finally {
        resume.resolve();
        failed.release.resolve();
        await draining;
      }
    }
  );
}
test(
  'a persisted running checkpoint becomes interrupted after restart and requires a new ID to discover again',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t);
    const receipt = await run(f);
    const key = discoveryKey(discoveryInput);
    await f.store.put({ ...receipt, phase: 'running', reason: null });
    const restarted = createVacancyService(f.serviceOptions);
    t.after(() => restarted.stop());
    assert.equal(
      (await restarted['discovery-status'](key)).discovery.phase,
      'interrupted'
    );
    assert.equal(
      (await restarted['discovery-start'](discoveryInput)).discovery.phase,
      'interrupted'
    );
    assert.equal(f.searches.length, 2);
  }
);

test(
  'owner exclusions and backed retry windows skip description work',
  { timeout: 5000 },
  async (t) => {
    const f = discoveryFixture(t);
    await f.service['choice-save']({
      url: discoveryCard(123).url,
      title: 'Engineer 123',
      state: 'deferred',
      note: 'Owner decision',
      revision: 'empty',
    });
    const receipt = await run(f);
    assert.equal(receipt.entries[0].decision.reason, 'owner-deferred');
    assert.equal(f.descriptions.length, 1);
    const waiting = discoveryFixture(t, {
      discovery: { retryWaiting: ({ url }) => url.endsWith('/123') },
    });
    const held = await run(waiting);
    assert.equal(held.entries[0].decision.reason, 'retry-wait');
    assert.equal(waiting.descriptions.length, 1);
  }
);
