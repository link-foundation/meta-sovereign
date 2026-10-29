import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openServerEvents } from '../src/web/server-events.js';

test('a stuck CONNECTING stream is replaced after a grace period, and heartbeats retain a healthy stream', () => {
  const sources = [];
  const timers = new Map();
  let id = 0;
  class Source extends globalThis.EventTarget {
    constructor() {
      super();
      this.readyState = 0;
      sources.push(this);
    }
    close() {
      this.readyState = 2;
    }
  }
  const clock = {
    setTimeout: (fn, ms) => {
      const key = ++id;
      timers.set(key, { fn, ms });
      return key;
    },
    clearTimeout: (key) => timers.delete(key),
  };
  const stop = openServerEvents(
    'http://fixture/api/events',
    {},
    { Source, clock, watchdogMs: 60000 }
  );
  try {
    sources[0].dispatchEvent(new globalThis.Event('error'));
    const [key, timer] = [...timers.entries()][0];
    assert.equal(timer.ms, 10000);
    sources[0].dispatchEvent(new globalThis.Event('error'));
    assert.equal(
      [...timers.keys()][0],
      key,
      'repeated native errors cannot postpone recovery forever'
    );
    timers.delete(key);
    timer.fn();
    assert.equal(sources.length, 2);
    assert.equal(sources[0].readyState, 2);
    sources[1].readyState = 1;
    sources[1].dispatchEvent(new globalThis.Event('heartbeat'));
    const active = [...timers.keys()][0];
    assert.equal([...timers.values()][0].ms, 60000);
    sources[0].dispatchEvent(new globalThis.Event('heartbeat'));
    assert.equal(
      [...timers.keys()][0],
      active,
      'a replaced stream cannot reset the live watchdog'
    );
  } finally {
    stop();
  }
  assert.equal(timers.size, 0);
});

test('navigation closes event streams and prevents delayed subscriptions', () => {
  const lifetime = new AbortController();
  const sources = [];
  class Source extends globalThis.EventTarget {
    constructor() {
      super();
      this.readyState = 0;
      sources.push(this);
    }
    close() {
      this.readyState = 2;
    }
  }
  const target = new globalThis.EventTarget();
  const stop = openServerEvents(
    'http://fixture/api/events',
    {},
    {
      Source,
      target,
      signal: lifetime.signal,
    }
  );
  lifetime.abort();
  assert.equal(sources[0].readyState, 2, 'the departing stream is closed');
  openServerEvents(
    'http://fixture/api/events',
    {},
    {
      Source,
      target,
      signal: lifetime.signal,
    }
  )();
  assert.equal(sources.length, 1, 'late subscribers cannot open a new stream');
  stop();
});

test('permanently closed event streams reopen with bounded backoff, wake on recovery, and stop with their owner', () => {
  const sources = [];
  class Source extends globalThis.EventTarget {
    constructor() {
      super();
      this.readyState = 0;
      sources.push(this);
    }
    close() {
      this.readyState = 2;
    }
    fail(state) {
      this.readyState = state;
      this.dispatchEvent(new globalThis.Event('error'));
    }
  }
  const target = new globalThis.EventTarget();
  let scheduled = null;
  const waits = [];
  const clock = {
    setTimeout: (fn, ms) => {
      scheduled = fn;
      waits.push(ms);
      return 1;
    },
    clearTimeout: () => {
      scheduled = null;
    },
  };
  let errors = 0;
  const stop = openServerEvents(
    'http://fixture/api/events',
    { error: () => errors++ },
    { Source, target, clock }
  );
  try {
    sources[0].fail(0);
    assert.equal(
      scheduled,
      null,
      'native reconnecting sources are not duplicated'
    );
    for (let i = 0; i < 8; i++) {
      sources.at(-1).fail(2);
      assert.ok(scheduled, 'closed sources never give up');
      scheduled();
    }
    assert.equal(waits.at(-1), 30000);
    sources.at(-1).fail(2);
    const before = sources.length;
    target.dispatchEvent(new globalThis.Event('online'));
    assert.equal(sources.length, before + 1);
    assert.equal(scheduled, null);
    sources.at(-1).dispatchEvent(new globalThis.Event('ready'));
    sources.at(-1).fail(2);
    assert.equal(waits.at(-1), 1000, 'successful recovery resets the backoff');
    assert.ok(errors > 0);
  } finally {
    stop();
  }
  assert.equal(scheduled, null);
  const count = sources.length;
  target.dispatchEvent(new globalThis.Event('online'));
  assert.equal(sources.length, count);
});
