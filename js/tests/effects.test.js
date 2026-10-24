// Reduced visual effects (R-Z21): the frame-time decision, the bounded
// probe and the resolved choice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectSlowRendering,
  frameIntervals,
  isSlowRendering,
  probeFrames,
  resolveEffects,
  whenSettled,
} from '../src/web/effects.js';

const steady = (gap, count = 11) =>
  Array.from({ length: count }, (_, i) => i * gap);

test('frame gaps come from timestamps', () => {
  assert.deepEqual(frameIntervals([0, 16, 33, 50]), [16, 17, 17]);
});

test('a 60 fps page is not slow, a 2 s frame is', () => {
  assert.equal(isSlowRendering(frameIntervals(steady(16.7))), false);
  assert.equal(isSlowRendering(frameIntervals(steady(2000))), true);
  assert.equal(isSlowRendering(frameIntervals(steady(51))), true);
  assert.equal(isSlowRendering(frameIntervals(steady(50))), false);
});

test('one hiccup does not decide (the median does)', () => {
  const stamps = steady(16);
  stamps[5] += 3000;
  assert.equal(isSlowRendering(frameIntervals(stamps)), false);
});

test('few cores lower the bar to under 30 fps', () => {
  const gaps = frameIntervals(steady(40));
  assert.equal(isSlowRendering(gaps, { cores: 8 }), false);
  assert.equal(isSlowRendering(gaps, { cores: 2 }), true);
});

test('too few samples decide nothing', () => {
  assert.equal(isSlowRendering([]), false);
  assert.equal(isSlowRendering([5000, 5000]), false);
});

test('the probe takes a bounded number of frames, then stops', async () => {
  let calls = 0;
  let clock = 0;
  const raf = (cb) => {
    calls += 1;
    clock += 100;
    Promise.resolve().then(() => cb(clock));
    return calls;
  };
  const gaps = await probeFrames({ raf, samples: 11 });
  assert.equal(calls, 11);
  assert.equal(gaps.length, 10);
  assert.ok(gaps.every((gap) => gap === 100));
  await Promise.resolve();
  assert.equal(calls, 11, 'no frame is requested after it finished');
});

test('the probe gives up when no frames come (hidden page)', async () => {
  const cancelled = [];
  const gaps = await probeFrames({
    raf: () => 7,
    cancel: (handle) => cancelled.push(handle),
    budgetMs: 5,
  });
  assert.deepEqual(gaps, []);
  assert.deepEqual(cancelled, [7]);
});

test('no requestAnimationFrame: nothing measured', async () => {
  assert.deepEqual(await probeFrames({ raf: undefined }), []);
});

test('the choice: on/off beat the probe, the URL beats both', () => {
  const slow = { slow: true };
  assert.equal(resolveEffects({ choice: 'auto' }), 'full');
  assert.equal(resolveEffects({ choice: 'auto', ...slow }), 'reduced');
  assert.equal(resolveEffects({ choice: 'auto', osReduced: true }), 'reduced');
  assert.equal(resolveEffects({ choice: 'on' }), 'reduced');
  assert.equal(resolveEffects({ choice: 'off', ...slow }), 'full');
  assert.equal(
    resolveEffects({ choice: 'off', query: '?effects=reduced' }),
    'reduced'
  );
  assert.equal(
    resolveEffects({ choice: 'on', query: '?effects=full' }),
    'full'
  );
  assert.equal(
    resolveEffects({ choice: 'on', query: '?effects=bogus' }),
    'reduced'
  );
});

const sampler = (...gaps) => {
  const queue = gaps.map((gap) => frameIntervals(steady(gap)));
  let taken = 0;
  const sample = async () => {
    taken += 1;
    return queue.shift() ?? [];
  };
  return { sample, taken: () => taken };
};

test('one slow sample then a fast one stays full', async () => {
  const probe = sampler(2000, 16);
  assert.equal(await detectSlowRendering({ sample: probe.sample }), false);
  assert.equal(probe.taken(), 2);
});

test('two slow samples in a row switch to reduced, no third taken', async () => {
  const probe = sampler(2000, 2000, 2000);
  assert.equal(await detectSlowRendering({ sample: probe.sample }), true);
  assert.equal(probe.taken(), 2);
});

test('a fast first sample or a hidden page stops at once', async () => {
  const fast = sampler(16, 2000);
  assert.equal(await detectSlowRendering({ sample: fast.sample }), false);
  assert.equal(fast.taken(), 1);
  const hidden = sampler();
  assert.equal(await detectSlowRendering({ sample: hidden.sample }), false);
  assert.equal(hidden.taken(), 1);
});

test('settling waits for load and idle, with a timeout fallback', async () => {
  const log = [];
  await whenSettled({
    ready: () => true,
    idle: (cb, options) => {
      log.push(options.timeout);
      cb();
    },
  });
  assert.deepEqual(log, [2000]);
  let delay = 0;
  await whenSettled({
    ready: () => true,
    idle: undefined,
    setTimer: (cb, ms) => {
      delay = ms;
      cb();
    },
  });
  assert.equal(delay, 2000);
});

test('reduced effects switch transitions off, never to a sliver (R-Z22)', async () => {
  // A 0.01ms duration still transitions `all`: the theme switch at load
  // was caught half-way (light text on a dark fill) by axe in WebKit.
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(
    new URL('../src/web/app.css', import.meta.url),
    'utf8'
  );
  const start = css.indexOf(":root[data-effects='reduced'] *::after {");
  const rule = css.slice(start, css.indexOf('}', start));
  assert.match(rule, /transition-duration: 0s !important/);
  assert.doesNotMatch(rule, /transition-duration: 0\.01ms/);
});
