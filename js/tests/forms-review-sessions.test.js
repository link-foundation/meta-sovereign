import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers';
import { createFormReader } from '../src/forms/reader.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  encodeLinoValue,
  readWireResponse,
} from '../src/transport/lino.js';
import { isReadRequest } from '../src/web/request-policy.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const url = 'https://example.test/form';
const browser = () => {
  const calls = [];
  const page = new EventEmitter();
  let currentUrl = url;
  let closed = false;
  page.url = () => currentUrl;
  page.isClosed = () => closed;
  page.bringToFront = async () => {
    calls.push(['focus']);
  };
  page.exposeBinding = async (name, callback) => {
    if (name.startsWith('__formActivity_')) {
      page.activity = callback;
    }
  };
  page.addInitScript = async () => {};
  return {
    calls,
    page,
    policy: { headless: false },
    navigate: (value) => {
      currentUrl = value;
    },
    commander: {
      goto: async (options) => {
        currentUrl = options.url;
        calls.push(['goto', options.url]);
      },
      evaluate: async () => ({
        url: currentUrl,
        documentTime: 1,
        title: 'Current page',
        fields: [],
        excluded: 0,
        reasons: [],
      }),
    },
    close: async () => {
      calls.push(['close']);
      closed = true;
      page.emit('close');
    },
  };
};
const review = (openSession, options = {}) =>
  createFormReader({
    store: createMemoryStore(),
    openSession,
    review: options,
  });
const open = (reader, slot = 'form-1') =>
  reader.openReview({ url, browserSlot: slot });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test(
  'three independent review slots stay open; rereads preserve the current page without navigation',
  { timeout: 5000 },
  async () => {
    const owned = [];
    const reader = review(
      async (options) => {
        const item = browser();
        owned.push({ item, options });
        return item;
      },
      { maxSessions: 3 }
    );
    try {
      const sessions = [];
      for (const slot of ['form-1', 'form-2', 'form-3']) {
        sessions.push((await open(reader, slot)).session);
      }
      assert.equal(reader.listReviews().sessions.length, 3);
      assert(
        owned.every(
          ({ item, options }) =>
            !item.calls.some(([name]) => name === 'close') &&
            options.platform === 'forms-review' &&
            options.useCase === 'forms' &&
            options.headless === undefined
        )
      );
      await assert.rejects(open(reader), { code: 'form-slot-in-use' });
      await assert.rejects(open(reader, 'form-4'), {
        code: 'form-session-limit',
      });
      owned[0].item.navigate('https://example.test/next-page');
      const report = await reader.readReview(sessions[0].id);
      assert.equal(report.url, 'https://example.test/next-page');
      assert.equal(report.reviewSession.busy, false);
      assert.equal(report.targetLifetime, 'snapshot-only');
      assert.equal(
        owned[0].item.calls.filter(([name]) => name === 'goto').length,
        1
      );
      await reader.focusReview(sessions[0].id);
      assert.equal(owned[0].item.calls.at(-1)[0], 'focus');
      await reader.closeReview(sessions[0].id);
      assert.equal(reader.listReviews().sessions.length, 2);
      assert(!owned[1].item.calls.some(([name]) => name === 'close'));
    } finally {
      await reader.stop();
    }
    assert(
      owned.every(
        ({ item }) =>
          item.calls.filter(([name]) => name === 'close').length === 1
      )
    );
  }
);

test(
  'close owns a pending launch and waits for the late browser cleanup acknowledgement',
  { timeout: 5000 },
  async () => {
    const launch = deferred();
    const closing = deferred();
    const item = browser();
    item.close = async () => {
      item.calls.push(['close']);
      await closing.promise;
    };
    const reader = review(() => launch.promise);
    const opening = assert.rejects(open(reader), {
      code: 'form-session-closed',
    });
    const id = reader.listReviews().sessions[0].id;
    let done = false;
    const close = reader.closeReview(id).then(() => {
      done = true;
    });
    launch.resolve(item);
    await tick();
    assert.equal(done, false);
    assert.equal(reader.listReviews().sessions[0].state, 'closing');
    assert.deepEqual(item.calls, [['close']]);
    closing.resolve();
    await Promise.all([opening, close]);
    assert.equal(reader.listReviews().sessions.length, 0);
    await reader.stop();
  }
);

test(
  'shutdown drains an issued read, refuses later operations and closes its browser once',
  { timeout: 5000 },
  async () => {
    const item = browser();
    const held = deferred();
    const started = deferred();
    const reader = review(async () => item);
    const { session } = await open(reader);
    item.commander.evaluate = async () => {
      started.resolve();
      await held.promise;
      return { url, documentTime: 1, title: '', fields: [], reasons: [] };
    };
    const reading = assert.rejects(reader.readReview(session.id), {
      code: 'form-session-closed',
    });
    await started.promise;
    let done = false;
    const stop = reader.stop().then(() => {
      done = true;
    });
    await tick();
    assert.equal(done, false);
    await assert.rejects(open(reader, 'late'), { code: 'form-stopped' });
    held.resolve();
    await Promise.all([reading, stop]);
    assert.equal(item.calls.filter(([name]) => name === 'close').length, 1);
  }
);

test(
  'failed cleanup remains visible and an explicit close retry must acknowledge it',
  { timeout: 5000 },
  async () => {
    const item = browser();
    let attempts = 0;
    item.close = async () => {
      if (++attempts === 1) {
        throw new Error('cleanup refused');
      }
    };
    const reader = review(async () => item);
    const { session } = await open(reader);
    await assert.rejects(reader.closeReview(session.id), {
      code: 'form-close-failed',
    });
    assert.equal(reader.listReviews().sessions[0].state, 'close-failed');
    await reader.closeReview(session.id);
    assert.equal(attempts, 2);
    assert.equal(reader.listReviews().sessions.length, 0);
    await reader.stop();
  }
);

test(
  'activity extends finite idle ownership; expiry closes and removes only the unused session',
  { timeout: 5000 },
  async () => {
    let clock = 1000;
    let counter = 0;
    const tasks = new Map();
    const timers = {
      setTimeout: (fn, ms) => {
        const id = ++counter;
        tasks.set(id, { fn, ms });
        return id;
      },
      clearTimeout: (id) => tasks.delete(id),
    };
    const item = browser();
    const reader = review(async () => item, {
      now: () => clock,
      idleMs: 100,
      timers,
    });
    const { session } = await open(reader);
    assert.equal(session.activityTracking, true);
    clock = 1050;
    item.page.activity();
    assert.equal(
      Date.parse(reader.listReviews().sessions[0].idleExpiresAt),
      1150
    );
    const expiry = [...tasks.values()].find((task) => task.ms === 100);
    expiry.fn();
    await tick();
    assert.equal(reader.listReviews().sessions.length, 0);
    await reader.stop();
  }
);

test(
  'an opening deadline retains the late launch and reports timeout without an orphan browser',
  { timeout: 5000 },
  async () => {
    const launch = deferred();
    let expire;
    const timers = {
      setTimeout: (fn) => {
        expire = fn;
        return 1;
      },
      clearTimeout: () => {},
    };
    const item = browser();
    const reader = review(() => launch.promise, { timers });
    const opening = assert.rejects(open(reader), { code: 'form-timeout' });
    expire();
    launch.resolve(item);
    await opening;
    assert.deepEqual(item.calls, [['close']]);
    assert.equal(reader.listReviews().sessions.length, 0);
    await reader.stop();
  }
);

test(
  'a refused snapshot keeps its review browser and a later explicit read recovers',
  { timeout: 5000 },
  async () => {
    const item = browser();
    const reader = review(async () => item);
    const { session } = await open(reader);
    const evaluate = item.commander.evaluate;
    item.commander.evaluate = async () => {
      throw new Error('interrupted document');
    };
    await assert.rejects(
      reader.readReview(session.id),
      /interrupted document/u
    );
    assert.equal(reader.listReviews().sessions[0].state, 'open');
    assert(!item.calls.some(([name]) => name === 'close'));
    item.commander.evaluate = evaluate;
    assert.equal((await reader.readReview(session.id)).ok, true);
    item.policy.headless = true;
    await assert.rejects(reader.focusReview(session.id), {
      code: 'form-focus-unavailable',
    });
    await reader.stop();
  }
);

test(
  'review CLI owns multiple URLs, supports current-page controls and closes every slot on quit',
  { timeout: 5000 },
  async () => {
    const owned = [];
    let closed = 0;
    const commands = createFormsCommands({
      openStore: async () => ({
        ...createMemoryStore(),
        close: async () => {
          closed++;
        },
      }),
      openSession: async () => {
        const item = browser();
        owned.push(item);
        return item;
      },
      async *reviewInput() {
        yield 'list';
        yield 'read form-1';
        yield 'focus form-2';
        yield 'close form-1';
        yield 'quit';
      },
    });
    const output = [];
    assert.equal(
      await commands['forms-review'](
        { urls: encodeLinoValue([url, url, url]) },
        (line) => output.push(JSON.parse(line))
      ),
      0
    );
    assert.equal(output[4].sessions.length, 3);
    assert.equal(output[5].mode, 'read-only');
    assert(
      owned.every(
        (item) => item.calls.filter(([name]) => name === 'close').length === 1
      )
    );
    assert.equal(closed, 1);
  }
);

test(
  'review controls negotiate both Lino encodings, trust origins and never retry implicitly',
  { timeout: 15000 },
  async () => {
    const owned = [];
    const server = await startServer({
      store: createMemoryStore(),
      port: 0,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false },
      forms: {
        openSession: async () => {
          const item = browser();
          owned.push(item);
          return item;
        },
      },
    });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = async (action, body) =>
          readWireResponse(
            await fetch(`${base}/api/forms/sessions/${action}`, {
              method: 'POST',
              headers: { accept: type, 'content-type': type },
              body: encodeWire(body, type),
            })
          );
        const { session } = await post('open', { url, browserSlot: 'api' });
        assert.equal(session.state, 'open');
        assert.equal(
          (await post('read', { id: session.id })).mode,
          'read-only'
        );
        assert.equal((await post('focus', { id: session.id })).ok, true);
        assert.equal(
          (await readWireResponse(await fetch(`${base}/api/forms/sessions`)))
            .sessions.length,
          1
        );
        assert.equal((await post('close', { id: session.id })).state, 'closed');
      }
      const refusal = await fetch(`${base}/api/forms/sessions/open`, {
        method: 'POST',
        headers: {
          origin: 'https://untrusted.example',
          'content-type': LINO_TEXT,
        },
        body: encodeWire({ url }, LINO_TEXT),
      });
      assert.equal(refusal.status, 403);
      assert.equal(owned.length, 2);
      for (const action of ['open', 'read', 'focus', 'close']) {
        assert.equal(
          isReadRequest(`/api/forms/sessions/${action}`, 'POST'),
          false
        );
      }
    } finally {
      await server.close();
    }
  }
);
