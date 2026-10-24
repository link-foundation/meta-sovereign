// The snapshot schedule of the binary mirror (R-Y93): writes during a
// snapshot ask for one more, not one each; a failing snapshot is reported
// once per try and tried less and less often.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDoubletsMirror } from '../src/storage/doublets-mirror.js';

// A virtual clock: the mirror's schedule is checked in virtual time, so the
// result does not depend on how loaded or slow the runner is (R-Z6).
const virtualClock = () => {
  let time = 1_000_000;
  let nextId = 1;
  const timers = new Map();
  // The free-space check is replaced (`spaceCheck`), so nothing real runs
  // inside the schedule; a turn lets promises settle.
  const turn = () =>
    new Promise((resolve) => globalThis.setTimeout(resolve, 8));
  const clock = {
    now: () => time,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: time + ms, fn });
      return { id, unref() {} };
    },
    clearTimeout: (timer) => timers.delete(timer?.id),
    sleep: (ms) => new Promise((resolve) => clock.setTimeout(resolve, ms)),
    // Moves time forward `ms`, firing the timers that fall due in order,
    // also those started meanwhile, and letting promises settle between.
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        await turn();
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((x, y) => x[1].at - y[1].at)[0];
        if (!due) {
          break;
        }
        timers.delete(due[0]);
        time = Math.max(time, due[1].at);
        due[1].fn();
      }
      time = end;
      await turn();
    },
  };
  return clock;
};

const fakeText = () => ({
  filePath: '/nonexistent/data.lino',
  flush: async () => {},
});

test('a failing snapshot is reported once per try, and tried less often', async () => {
  const clock = virtualClock();
  const starts = [];
  const errors = [];
  const mirror = await createDoubletsMirror('/nonexistent/data.bin', {
    text: fakeText(),
    clock,
    spaceCheck: async () => ({ ok: true }),
    minIntervalMs: 60,
    onError: (error) => errors.push(error.message),
    snapshot: async () => {
      starts.push(clock.now());
      await clock.sleep(1);
      throw new Error('out of memory');
    },
  });
  await mirror.put({ id: 'x' });
  // A busy server: a hundred more writes change nothing about the pace.
  for (let i = 0; i < 100; i++) {
    await mirror.put({ id: 'x' });
  }
  await clock.advance(1000);
  // Tries at once, then 120, 240 and 480 ms after the last one ended.
  assert.equal(starts.length, 4, `tried again: ${starts.length}`);
  assert.equal(errors.length, starts.length, 'one report for each try');
  const gaps = starts.slice(1).map((at, i) => at - starts[i]);
  assert.deepEqual(gaps, [121, 241, 481], 'each wait is twice the last');
});

test('after a failure the usual pace returns; writes during a snapshot wait for the next', async () => {
  const clock = virtualClock();
  let runs = 0;
  let fail = true;
  const errors = [];
  const mirror = await createDoubletsMirror('/nonexistent/data.bin', {
    text: fakeText(),
    clock,
    spaceCheck: async () => ({ ok: true }),
    minIntervalMs: 20,
    onError: (error) => errors.push(error.message),
    snapshot: async () => {
      runs += 1;
      await clock.sleep(runs === 3 ? 60 : 5);
      if (fail) {
        fail = false;
        throw new Error('once');
      }
      return { links: 1 };
    },
  });
  // A failure, then success: the wait goes back to the usual one.
  await mirror.put({ id: 'a' });
  await clock.advance(400);
  assert.equal(runs, 2, 'the failure was tried again');
  assert.deepEqual(errors, ['once']);
  // Writes during the third snapshot (60 ms): no new one starts while it
  // runs, nor right after it.
  await mirror.put({ id: 'b' });
  await clock.advance(10);
  await mirror.put({ id: 'c' });
  await clock.advance(10);
  await mirror.put({ id: 'd' });
  await clock.advance(150);
  assert.equal(runs, 3, 'the writes during it wait for the next interval');
  const flushed = mirror.flush();
  await clock.advance(10);
  assert.deepEqual(await flushed, { links: 1 });
  assert.equal(runs, 4, 'flush writes it at once');
});
