import assert from 'node:assert/strict';
import test from 'node:test';
import { observeImportResources } from '../src/server/resource-diagnostics.js';

const clock = () => {
  let tick;
  let cleared = 0;
  let unref = 0;
  const timer = { unref: () => unref++ };
  return {
    timers: {
      setInterval(callback, interval) {
        assert.equal(interval, 1000);
        tick = callback;
        return timer;
      },
      clearInterval(value) {
        assert.equal(value, timer);
        cleared++;
      },
    },
    tick: () => tick(),
    state: () => ({ cleared, unref }),
  };
};

const sampleEvents = (entries) =>
  entries
    .filter(
      ({ event }) =>
        !['server_resource_high', 'server_resource_recovered'].includes(event)
    )
    .map(({ event }) => event);

// Synthetic counters cross the final sample's threshold without allocating
// memory. The observer reads once before its baseline, then once per sample.
const warnOnFinalSample = (context) => {
  let reads = 0;
  context.mock.method(process, 'memoryUsage', () => ({
    rss: ++reads >= 3 ? 3 * 1024 ** 3 : 0,
    heapUsed: 0,
    heapTotal: 0,
    external: 0,
    arrayBuffers: 0,
  }));
};

test('ordinary imports allocate no resource observer or timer', async () => {
  let loads = 0;
  assert.equal(
    await observeImportResources(
      () => {
        loads++;
        return 'module';
      },
      {
        enabled: false,
        log: () => assert.fail('default-off import emitted resources'),
        timers: {
          setInterval: () => assert.fail('default-off import allocated timer'),
        },
      }
    ),
    'module'
  );
  assert.equal(loads, 1);
});

test('pending imports expose finite opt-in resources and retain their result', async () => {
  const f = clock();
  const entries = [];
  let release;
  let settled = false;
  const pending = observeImportResources(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    { enabled: true, log: (entry) => entries.push(entry), timers: f.timers }
  ).then((result) => {
    settled = true;
    return result;
  });
  assert.equal(entries[0].event, 'server_resource_baseline');
  assert.equal(entries[0].phase, 'importing');
  assert.deepEqual(f.state(), { cleared: 0, unref: 1 });
  for (let index = 0; index < 30; index++) {
    f.tick();
  }
  assert.equal(settled, false, 'observation must not settle the module load');
  assert.equal(
    entries.filter(({ event }) => event === 'server_resources').length,
    30
  );
  assert.deepEqual(f.state(), { cleared: 1, unref: 1 });
  const count = entries.length;
  f.tick();
  assert.equal(entries.length, count, 'stale timer cannot continue sampling');
  for (const entry of entries) {
    assert.equal(entry.phase, 'importing');
    for (const name of ['cpuPercent', 'rssBytes', 'schedulerLagMs']) {
      assert.equal(Number.isFinite(entry[name]), true, name);
      assert.ok(entry[name] >= 0, name);
    }
  }
  release('loaded module');
  assert.equal(await pending, 'loaded module');
  assert.equal(entries.length, count);
});

for (const warning of [false, true]) {
  const suffix = warning ? ' with a final resource warning' : '';
  test(`an import rejection stops observation and preserves the actual error${suffix}`, async (context) => {
    if (warning) {
      warnOnFinalSample(context);
    }
    const f = clock();
    const entries = [];
    const failure = new Error('owned fixture import failed');
    await assert.rejects(
      observeImportResources(
        () => {
          throw failure;
        },
        { enabled: true, log: (entry) => entries.push(entry), timers: f.timers }
      ),
      (error) => error === failure
    );
    assert.deepEqual(f.state(), { cleared: 1, unref: 1 });
    assert.deepEqual(sampleEvents(entries), [
      'server_resource_baseline',
      'server_import_resources_final',
    ]);
    if (warning) {
      assert.equal(entries.at(-1).event, 'server_resource_high');
      assert.equal(entries.at(-1).memoryHigh, true);
    }
    const count = entries.length;
    f.tick();
    assert.equal(
      entries.length,
      count,
      'rejected import released its observer'
    );
  });

  test(`a settled import records its final cost even when no interval could run${suffix}`, async (context) => {
    if (warning) {
      warnOnFinalSample(context);
    }
    const f = clock();
    const entries = [];
    const module = Symbol('loaded module');
    assert.equal(
      await observeImportResources(() => module, {
        enabled: true,
        log: (entry) => entries.push(entry),
        timers: f.timers,
      }),
      module
    );
    assert.deepEqual(sampleEvents(entries), [
      'server_resource_baseline',
      'server_import_resources_final',
    ]);
    if (warning) {
      assert.equal(entries.at(-1).event, 'server_resource_high');
      assert.equal(entries.at(-1).memoryHigh, true);
    }
    assert.deepEqual(f.state(), { cleared: 1, unref: 1 });
    const count = entries.length;
    f.tick();
    assert.equal(entries.length, count);
  });
}
