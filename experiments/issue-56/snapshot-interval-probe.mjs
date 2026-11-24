import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

// Exercise the exact published scheduler with finite virtual time, no host timers,
// disk writes or global patches. The writer charges one bounded 600 ms cost.
const source = execFileSync(
  'git',
  ['show', '4f482c34:js/src/storage/doublets-store.js'],
  { encoding: 'utf8' }
);
const scheduler = source.slice(
  source.indexOf('const createSnapshots ='),
  source.indexOf('export const createDoubletsStore')
);
let time = 1_000_000;
let nextId = 0;
const timers = new Map();
const clock = {
  now: () => time,
  setTimeout(fn, ms) {
    const token = { id: ++nextId, unref() {} };
    timers.set(token.id, { token, at: time + ms, fn });
    return token;
  },
  clearTimeout: (token) => timers.delete(token?.id),
};
const createSnapshots = vm.runInNewContext(`${scheduler};createSnapshots`, {
  Date: { now: clock.now },
  setTimeout: clock.setTimeout,
  clearTimeout: clock.clearTimeout,
});
const records = [1];
let written = [];
let cost = 600;
let writes = 0;
const snapshots = createSnapshots(
  {
    request: async () => {
      writes++;
      written = [...records];
      time += cost;
      cost = 0;
    },
  },
  200
);
const advance = async (ms) => {
  const end = time + ms;
  for (let turns = 0; turns < 10; turns++) {
    const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
    if (!next || next.at > end) {
      time = Math.max(time, end);
      return;
    }
    timers.delete(next.token.id);
    time = Math.max(time, next.at);
    next.fn();
    for (let settle = 0; settle < 8; settle++) {
      await Promise.resolve();
    }
  }
  assert.fail('Finite snapshot probe exceeded its timer budget');
};
snapshots.later();
await advance(0);
assert.deepEqual(written, [1]);
records.push(2, 3);
snapshots.later();
snapshots.later();
assert.equal(timers.size, 1);
assert.equal([...timers.values()][0].at - time, 6000);
await advance(5000);
assert.throws(() => assert.equal(written.length, 3), assert.AssertionError);
assert.deepEqual(written, [1]);
await advance(1000);
assert.deepEqual(written, [1, 2, 3]);
records.shift();
await snapshots.now();
assert.deepEqual(written, [2, 3]);
assert.equal(timers.size, 0);
assert.equal(writes, 3);
console.log(
  JSON.stringify({
    parent: '4f482c34',
    minIntervalMs: 200,
    firstWriteCostMs: 600,
    adaptiveIntervalMs: 6000,
    parentDeadlineMs: 5000,
    parentAssertionReproduced: true,
    scheduledSnapshot: 3,
    flushedSnapshot: 2,
    outstandingTimers: timers.size,
    writes,
  })
);
