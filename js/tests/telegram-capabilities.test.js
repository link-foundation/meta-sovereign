import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { encodeWire, readWireResponse } from '../src/transport/lino.js';
import { fixtureServerClose } from './helpers/fixture-server.mjs';

const options = {
  port: 0,
  enableHandlers: false,
  enableSync: false,
  automations: { scheduler: false },
};

test(
  'a server without Telegram advertises unavailable notification features',
  { timeout: 10000 },
  async (t) => {
    const server = await startServer({
      ...options,
      store: createMemoryStore(),
      telegramAccount: false,
    });
    t.after(() => server.close());
    const status = await readWireResponse(
      await fetch(`http://127.0.0.1:${server.port}/api/telegram/status`)
    );
    assert.equal(status.connected, false);
    assert.equal(status.available, false);
    assert.deepEqual(status.capabilities, {
      notifySettings: false,
      accountEvents: false,
    });
  }
);

test(
  'notification availability follows actual methods and runtime rather than primary connection',
  { timeout: 10000 },
  async (t) => {
    let kind = null;
    const account = {
      status: async () => ({ connected: false, kind, account: null }),
      notifyOverview: async () => ({ ok: true }),
    };
    const server = await startServer({
      ...options,
      store: createMemoryStore(),
      telegramAccount: account,
    });
    t.after(() => server.close());
    const read = async () =>
      readWireResponse(
        await fetch(`http://127.0.0.1:${server.port}/api/telegram/status`)
      );
    let status = await read();
    assert.equal(status.available, true);
    assert.equal(
      status.capabilities.accountEvents,
      true,
      'extra accounts can remain active without the primary'
    );
    assert.equal(status.capabilities.notifySettings, false);
    kind = 'user';
    status = await read();
    assert.equal(status.capabilities.notifySettings, true);
    delete account.notifyOverview;
    assert.equal((await read()).capabilities.notifySettings, false);
  }
);

test(
  'the browser bridge never calls unavailable notification routes and keeps legacy status compatible',
  { timeout: 10000 },
  async () => {
    const seen = [];
    let status = {
      connected: false,
      available: false,
      capabilities: { notifySettings: false, accountEvents: false },
    };
    const server = http.createServer((req, res) => {
      seen.push(req.url);
      const answer =
        new URL(req.url, 'http://fixture').pathname === '/api/status'
          ? { service: 'meta-sovereign', links: 0 }
          : req.url === '/api/telegram/status'
            ? status
            : { ok: true, scopes: {} };
      res.writeHead(200, { 'content-type': 'text/lino' });
      res.end(encodeWire(answer));
    });
    const close = fixtureServerClose(server, 'telegram-capabilities');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const priorCandidates = globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES;
    const priorSource = globalThis.EventSource;
    const sources = [];
    globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = `http://127.0.0.1:${server.address().port}`;
    globalThis.EventSource = class extends globalThis.EventTarget {
      constructor(url) {
        super();
        this.url = url;
        sources.push(this);
      }
      close() {
        this.closed = true;
      }
    };
    const { api, resetServerBinding } = await import('../src/web/dom.js');
    resetServerBinding();
    let stop = () => {};
    try {
      const answer = await api.telegramNotifySettings();
      assert.equal(answer.unsupported, true);
      stop = await api.telegramAccountsEvents(() => {});
      // The notification read and stream preflight share the same status policy.
      await api.telegramStatus();
      assert.equal(sources.length, 0);
      assert.equal(
        seen.some(
          (url) =>
            url.includes('notify-settings') || url.includes('accounts-events')
        ),
        false
      );
      stop();
      status = {
        connected: false,
        kind: 'user',
        capabilities: { notifySettings: true, accountEvents: true },
      };
      assert.equal((await api.telegramNotifySettings()).ok, true);
      assert.equal(
        seen.filter((url) => url.includes('notify-settings')).length,
        1
      );
      status = { connected: true, kind: 'user' };
      assert.equal(
        (await api.telegramNotifySettings()).ok,
        true,
        'older servers need no new flags'
      );
    } finally {
      stop();
      resetServerBinding();
      globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = priorCandidates;
      globalThis.EventSource = priorSource;
      await close();
    }
  }
);

test('account events recover capability changes and retain a stream during transient status failure', async () => {
  const { followTelegramAccountEvents } =
    await import('../src/web/telegram-capabilities.js');
  const timers = new Map();
  let seq = 0;
  const clock = {
    setTimeout: (fn) => {
      const id = ++seq;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const tick = async () => {
    const [id, fn] = [...timers][0];
    timers.delete(id);
    await fn();
  };
  let status = { available: false };
  let opened = 0;
  let closed = 0;
  const stop = followTelegramAccountEvents({
    readStatus: async () => status,
    open: () => {
      opened += 1;
      return () => {
        closed += 1;
      };
    },
    clock,
  });
  try {
    await tick();
    assert.equal(opened, 0);
    status = { connected: false, capabilities: { accountEvents: true } };
    await tick();
    assert.equal(opened, 1);
    status = { offline: true };
    await tick();
    assert.equal(closed, 0);
    status = { capabilities: { accountEvents: false } };
    await tick();
    assert.equal(closed, 1);
    status = { connected: true };
    await tick();
    assert.equal(opened, 2);
    assert.equal(timers.size, 1);
  } finally {
    stop();
  }
  assert.equal(closed, 2);
  assert.equal(timers.size, 0);
});

test('stopping during capability preflight cannot create a delayed stream', async () => {
  const { followTelegramAccountEvents } =
    await import('../src/web/telegram-capabilities.js');
  let complete;
  const response = new Promise((resolve) => {
    complete = resolve;
  });
  let run;
  const lifetime = new AbortController();
  let opened = 0;
  const stop = followTelegramAccountEvents({
    readStatus: () => response,
    open: () => {
      opened += 1;
      return () => {};
    },
    clock: {
      setTimeout: (fn) => {
        run = fn;
        return 1;
      },
      clearTimeout: () => {},
    },
    signal: lifetime.signal,
  });
  const pending = run();
  lifetime.abort();
  complete({ connected: true });
  await pending;
  stop();
  assert.equal(opened, 0);
});

test('a refused EventSource construction recovers without an unhandled rejection', async () => {
  const { followTelegramAccountEvents } =
    await import('../src/web/telegram-capabilities.js');
  let run;
  let attempts = 0;
  let closed = 0;
  const stop = followTelegramAccountEvents({
    readStatus: async () => ({ connected: true }),
    open: () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('fixture refusal');
      }
      return () => {
        closed += 1;
      };
    },
    clock: {
      setTimeout: (fn) => {
        run = fn;
        return 1;
      },
      clearTimeout: () => {},
    },
  });
  try {
    await run();
    assert.equal(attempts, 1);
    await run();
    assert.equal(attempts, 2);
  } finally {
    stop();
  }
  assert.equal(closed, 1);
});
