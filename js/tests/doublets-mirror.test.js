// The snapshot schedule of the binary mirror (R-Y93): writes during a
// snapshot ask for one more, not one each; a failing snapshot is reported
// once per try and tried less and less often.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDoubletsMirror } from '../src/storage/doublets-mirror.js';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fakeText = () => ({
  filePath: '/nonexistent/data.lino',
  flush: async () => {},
});

// Writes every 2 ms for `ms`, as a busy server would.
const busy = async (mirror, ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await mirror.put({ id: 'x' });
    await pause(2);
  }
};

test('a failing snapshot is reported once per try, and tried less often', async () => {
  const starts = [];
  const errors = [];
  const mirror = await createDoubletsMirror('/nonexistent/data.bin', {
    text: fakeText(),
    // The interval, not the (load-dependent) cost, sets the pace.
    minIntervalMs: 60,
    onError: (error) => errors.push(error.message),
    snapshot: async () => {
      starts.push(Date.now());
      await pause(1);
      throw new Error('out of memory');
    },
  });
  await busy(mirror, 1000);
  await pause(20);
  assert.ok(starts.length >= 3, `tried again: ${starts.length}`);
  assert.ok(starts.length <= 5, `not on every write: ${starts.length}`);
  assert.equal(errors.length, starts.length, 'one report for each try');
  const gaps = starts.slice(1).map((at, i) => at - starts[i]);
  for (let i = 1; i < gaps.length; i++) {
    assert.ok(
      gaps[i] > gaps[i - 1] * 1.3,
      `each wait is longer: ${JSON.stringify(gaps)}`
    );
  }
});

test('after a failure the usual pace returns; writes during a snapshot wait for the next', async () => {
  let runs = 0;
  let fail = true;
  const errors = [];
  const mirror = await createDoubletsMirror('/nonexistent/data.bin', {
    text: fakeText(),
    minIntervalMs: 20,
    onError: (error) => errors.push(error.message),
    snapshot: async () => {
      runs += 1;
      await pause(runs === 3 ? 60 : 5);
      if (fail) {
        fail = false;
        throw new Error('once');
      }
      return { links: 1 };
    },
  });
  // A failure, then success: the wait goes back to the usual one.
  await mirror.put({ id: 'a' });
  await pause(200);
  assert.equal(runs, 2, 'the failure was tried again');
  assert.deepEqual(errors, ['once']);
  // Writes for 30 ms, all during the third snapshot (60 ms): no new one
  // starts while it runs, nor right after it.
  await busy(mirror, 30);
  await pause(150);
  assert.equal(runs, 3, 'the writes during it wait for the next interval');
  assert.deepEqual(await mirror.flush(), { links: 1 });
  assert.equal(runs, 4, 'flush writes it at once');
});
