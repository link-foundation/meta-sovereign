import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLayoutTrace,
  createLayoutReporter,
} from '../src/web/chat-layout-trace.js';
import { installClientLog } from '../src/web/client-log.js';

test('layout diagnostics distinguish overlap from reading and suppress duplicates', () => {
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ paddingBottom: '100px' });
  try {
    const entries = [];
    let bottom = 710;
    const node = {
      closest: () => ({
        querySelector: () => ({
          offsetHeight: 64,
          getBoundingClientRect: () => ({ top: 700 }),
        }),
      }),
      querySelectorAll: () => [{ getBoundingClientRect: () => ({ bottom }) }],
      getBoundingClientRect: () => ({ bottom: 800 }),
      scrollTop: 100,
      scrollHeight: 700,
      clientHeight: 600,
    };
    const trace = createLayoutTrace({
      clientLog: (entry) => entries.push(entry),
    });
    const fields = { reason: 'end', following: true, messages: 2 };
    trace.sample(node, fields);
    trace.sample(node, fields);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, 'warn');
    assert.equal(entries[0].overlap, true);
    assert.equal(entries[0].bottomGap, -10);
    trace.sample(node, { ...fields, following: false });
    assert.equal(entries[1].level, 'debug');
    assert.equal(entries[1].overlap, false);
    bottom = 690;
    trace.sample(node, fields);
    assert.equal(entries[2].overlap, false);
    assert.equal(entries[2].reserve, 100);
  } finally {
    if (previous) {
      globalThis.getComputedStyle = previous;
    } else {
      delete globalThis.getComputedStyle;
    }
  }
});

test('a recurring error is reported after the deduplication window', async () => {
  const listeners = {};
  const entries = [];
  let at = 60_000;
  const stop = installClientLog({
    target: {
      addEventListener: (name, handler, capture) => {
        if (!capture) {
          listeners[name] = handler;
        }
      },
      removeEventListener: () => {},
    },
    send: (entry) => entries.push(entry),
    now: () => at,
  });
  listeners.error({ message: 'fixture error' });
  listeners.error({ message: 'fixture error' });
  await Promise.resolve();
  assert.equal(entries.length, 1);
  at += 60_000;
  listeners.error({ message: 'fixture error' });
  await Promise.resolve();
  assert.equal(entries.length, 2);
  stop();
});

test('a potential layout warning confirms fresh state once and cancels superseded work', () => {
  const saved = Object.fromEntries(
    ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].map(
      (key) => [key, globalThis[key]]
    )
  );
  const queue = new Map();
  let id = 0;
  globalThis.requestAnimationFrame = (fn) => {
    queue.set(++id, fn);
    return id;
  };
  globalThis.cancelAnimationFrame = (key) => queue.delete(key);
  globalThis.getComputedStyle = () => ({ paddingBottom: '74px' });
  const tick = () => {
    const callbacks = [...queue.values()];
    queue.clear();
    callbacks.forEach((fn) => fn());
  };
  try {
    let bottom = 730;
    let following = true;
    const node = {
      closest: () => ({
        querySelector: () => ({
          offsetHeight: 61,
          getBoundingClientRect: () => ({ top: 700 }),
        }),
      }),
      querySelectorAll: () => [{ getBoundingClientRect: () => ({ bottom }) }],
      getBoundingClientRect: () => ({ bottom: 800 }),
      scrollTop: 2665,
      scrollHeight: 3343,
      clientHeight: 640,
    };
    const entries = [];
    const reporter = createLayoutReporter(
      createLayoutTrace({ clientLog: (entry) => entries.push(entry) }),
      (reason) => ({ node, fields: { reason, following, messages: 26 } })
    );
    reporter.report('end');
    tick();
    tick();
    assert.equal(
      entries.length,
      0,
      'wait for observer delivery before warning'
    );
    bottom = 692;
    tick();
    assert.equal(entries[0].level, 'debug');
    assert.equal(entries[0].bottomGap, 8);
    assert.equal(queue.size, 0, 'no continuous geometry polling');
    bottom = 730;
    reporter.report('persistent');
    tick();
    tick();
    tick();
    assert.equal(
      entries[1].level,
      'warn',
      'persistent overlaps remain warnings'
    );
    reporter.report('stale');
    tick();
    tick();
    reporter.report('latest');
    following = false;
    tick();
    tick();
    assert.equal(entries.length, 3);
    assert.equal(entries[2].reason, 'latest');
    assert.equal(entries[2].level, 'debug', 'fresh reading intent wins');
    reporter.report('unmounted');
    tick();
    tick();
    reporter.cancel();
    tick();
    assert.equal(entries.length, 3);
    assert.equal(queue.size, 0);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete globalThis[key];
      } else {
        globalThis[key] = value;
      }
    }
  }
});
