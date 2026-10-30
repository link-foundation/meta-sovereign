import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutTrace } from '../src/web/chat-layout-trace.js';
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
