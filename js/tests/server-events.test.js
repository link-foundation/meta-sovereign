import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openServerEvents } from '../src/web/server-events.js';

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
