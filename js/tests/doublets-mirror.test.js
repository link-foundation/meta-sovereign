// The snapshot schedule of the binary mirror (R-Y93): writes during a
// snapshot ask for one more, not one each; a failing snapshot is reported
// once per try and tried less and less often.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDoubletsMirror } from '../src/storage/doublets-mirror.js';
import { createDualStore } from '../src/storage/dual-store.js';
import { createMemoryStore } from '../src/storage/universal.js';

test('verification does not scan two views of the identical live store', async () => {
  const text = {
    query: async () => {
      throw new Error('redundant archive scan');
    },
  };
  const mirror = await createDoubletsMirror('/nonexistent/data.bin', { text });
  const dual = createDualStore({ binary: mirror, text });
  assert.deepEqual(await dual.verify(), []);
});

test('independent stores still report changed and missing records', async () => {
  const binary = createMemoryStore();
  const text = createMemoryStore();
  await binary.put({ id: 'changed', body: 'binary' });
  await text.put({ id: 'changed', body: 'text' });
  await binary.put({ id: 'binary-only' });
  await text.put({ id: 'text-only' });
  const differences = await createDualStore({ binary, text }).verify();
  assert.deepEqual(differences.map((entry) => entry.id).sort(), [
    'binary-only',
    'changed',
    'text-only',
  ]);
});

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

test('startup snapshot delay lets a retiring worker leave, while explicit flush stays immediate', async () => {
  const clock = virtualClock();
  let runs = 0;
  const mirror = await createDoubletsMirror('/nonexistent/data.bin', {
    text: fakeText(),
    clock,
    initialDelayMs: 60,
    minIntervalMs: 60,
    spaceCheck: async () => ({ ok: true }),
    snapshot: async () => ({ links: ++runs }),
  });
  await mirror.put({ id: 'a' });
  await clock.advance(59);
  assert.equal(runs, 0);
  await clock.advance(1);
  assert.equal(runs, 1);
  await mirror.put({ id: 'b' });
  assert.deepEqual(await mirror.flush(), { links: 2 });
  await mirror.close();
});

test('closing waits for an active snapshot and cancels deferred writes before a folder can move', async () => {
  const clock = virtualClock();
  let finish;
  let runs = 0;
  const mirror = await createDoubletsMirror('/nonexistent/data.bin', {
    text: fakeText(),
    clock,
    spaceCheck: async () => ({ ok: true }),
    snapshot: () => {
      runs += 1;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  await mirror.put({ id: 'first' });
  await clock.advance(1);
  assert.equal(runs, 1);
  await mirror.put({ id: 'queued' });
  let closed = false;
  const closing = mirror.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(
    closed,
    false,
    'the worker must finish before releasing ownership'
  );
  finish({ links: 1 });
  await closing;
  await clock.advance(1_000_000);
  assert.equal(runs, 1, 'no worker starts after close or migration');
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
