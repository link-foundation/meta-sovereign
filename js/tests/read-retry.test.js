import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRetryingRead } from '../src/web/read-retry.js';

test('reads keep retrying after many failures, wake immediately, and never overlap', async () => {
  let timer = null;
  let delay = null;
  const events = new Map();
  const target = {
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const clock = {
    setTimeout: (fn, ms) => {
      timer = fn;
      delay = ms;
      return 1;
    },
    clearTimeout: () => {
      timer = null;
    },
  };
  let calls = 0;
  let answer;
  const values = [];
  const failures = [];
  const read = createRetryingRead(
    () => {
      calls += 1;
      if (calls <= 8) {
        throw new Error('temporarily unavailable');
      }
      return new Promise((resolve) => {
        answer = resolve;
      });
    },
    {
      clock,
      target,
      accept: (value) => values.push(value),
      failed: (error) => failures.push(error),
    }
  );
  await read.refresh();
  for (let attempt = 1; attempt < 8; attempt += 1) {
    assert.ok(timer, `retry ${attempt} remains scheduled`);
    await timer();
  }
  assert.equal(delay, 30000, 'backoff is bounded, attempts are not');
  events.get('online')();
  const pending = read.refresh();
  assert.equal(
    read.refresh(),
    pending,
    'slow reads share their pending attempt'
  );
  await Promise.resolve();
  answer(['recovered']);
  await pending;
  assert.equal(calls, 9);
  assert.equal(failures.length, 8);
  assert.deepEqual(values, [['recovered']]);
  assert.equal(timer, null);
  read.stop();
  assert.equal(events.size, 0);
});

test('unmounting cancels retries and ignores late answers', async () => {
  let answer;
  const values = [];
  const read = createRetryingRead(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
    {
      accept: (value) => values.push(value),
      failed: () => assert.fail('late failure'),
    }
  );
  const pending = read.refresh();
  await Promise.resolve();
  read.stop();
  answer('stale');
  await pending;
  assert.deepEqual(values, []);
});
