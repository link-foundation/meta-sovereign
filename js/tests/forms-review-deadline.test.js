import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewDeadline } from '../src/forms/review-deadline.js';
import { formDeadlineClock } from '../../experiments/issue-56/form-deadline-clock.mjs';

test('manual verification preserves exactly the unspent ordinary deadline', () => {
  const clock = formDeadlineClock();
  const expired = [];
  const events = [];
  const deadline = reviewDeadline({
    milliseconds: 100,
    now: clock.now,
    timers: clock.timers,
    expired: (code) => expired.push(code),
    trace: (event) => events.push(event),
  });
  clock.advance(30);
  const resume = deadline.pause(2000);
  clock.advance(120);
  assert.deepEqual(expired, []);
  resume();
  resume();
  clock.advance(69);
  assert.deepEqual(expired, []);
  clock.advance(1);
  assert.deepEqual(expired, [undefined]);
  assert.deepEqual(
    events.map((event) => event.phase),
    ['started', 'paused', 'resumed', 'expired']
  );
  assert.equal(events[1].remainingMs, 70);
  assert.equal(events[1].maximumMs, 2000);
  assert.equal(events.at(-1).code, 'form-timeout');
  deadline.stop();
  assert.equal(clock.pending(), 0);
});

test('the manual ceiling expires and Stop clears either pending deadline', () => {
  for (const pause of [true, false]) {
    const clock = formDeadlineClock();
    const expired = [];
    const deadline = reviewDeadline({
      milliseconds: 100,
      now: clock.now,
      timers: clock.timers,
      expired: (code) => expired.push(code),
    });
    if (pause) {
      deadline.pause(2000);
      clock.advance(2000);
      assert.deepEqual(expired, ['form-captcha-timeout']);
    }
    deadline.stop();
    clock.advance(10000);
    assert.equal(expired.length, Number(pause));
    assert.equal(clock.pending(), 0);
  }
});

test('optional deadline diagnostics cannot break cleanup or expiration', () => {
  const clock = formDeadlineClock();
  let expired = 0;
  const deadline = reviewDeadline({
    milliseconds: 100,
    now: clock.now,
    timers: clock.timers,
    expired: () => {
      expired++;
    },
    trace: () => {
      throw new Error('optional diagnostic failed');
    },
  });
  const resume = deadline.pause(2000);
  clock.advance(120);
  resume();
  clock.advance(100);
  assert.equal(expired, 1);
  deadline.stop();
  assert.equal(clock.pending(), 0);
});
