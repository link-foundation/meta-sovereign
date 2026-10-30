import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startResourceDiagnostics } from '../src/server/resource-diagnostics.js';

const fixture = () => {
  let time = 0;
  let cpu = 0;
  let rss = 100;
  const entries = [];
  const monitor = startResourceDiagnostics({
    log: (entry) => entries.push(entry),
    automatic: false,
    rssLimit: 1000,
    intervalMs: 1000,
    cpuSamples: 2,
    now: () => time,
    read: () => ({
      cpu: { user: cpu, system: 0 },
      rss,
      heapUsed: 100,
      heapTotal: 200,
      heapLimit: 2000,
      external: 10,
      arrayBuffers: 5,
    }),
  });
  return {
    monitor,
    entries,
    step(ms, used, memory = rss) {
      time += ms;
      cpu += used;
      rss = memory;
      return monitor.sample();
    },
  };
};

test('resource diagnostics record sustained CPU, memory growth and recovery without a stress test', () => {
  const f = fixture();
  f.step(1000, 900_000);
  assert.equal(
    f.entries.filter((e) => e.event === 'server_resource_high').length,
    0
  );
  f.step(1000, 900_000);
  const high = f.entries.find((e) => e.event === 'server_resource_high');
  assert.equal(high.cpuPercent, 90);
  assert.equal(high.cpuHigh, true);
  f.step(1500, 0, 1200);
  assert.equal(f.entries.at(-1).rssGrowthBytes, 1100);
  assert.equal(f.entries.at(-1).schedulerLagMs, 500);
  f.step(1000, 0, 100);
  assert.equal(f.entries.at(-1).event, 'server_resource_recovered');
});

test('resource diagnostics label upgrade phases, stop cleanly and tolerate a failed log sink', () => {
  const f = fixture();
  f.monitor.setPhase('warming');
  assert.equal(f.entries.at(-1).phase, 'warming');
  f.monitor.setPhase('active');
  assert.equal(f.entries.at(-1).event, 'server_resource_phase');
  const count = f.entries.length;
  f.monitor.stop();
  f.step(1000, 0);
  assert.equal(f.entries.length, count);
  assert.doesNotThrow(() =>
    startResourceDiagnostics({
      automatic: false,
      log: () => {
        throw new Error('fixture full disk');
      },
    }).stop()
  );
});
