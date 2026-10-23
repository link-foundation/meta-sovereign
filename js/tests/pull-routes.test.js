// R-Z8: the "Fetch now" route and the schedule behind it, for VK, Upwork and
// PeoplePerHour, against fake servers (a fake `fetch`; no network).

import { describe, it, expect } from 'test-anywhere';

import { createMemoryStore } from '../src/storage/index.js';
import { startServer } from '../src/server/index.js';
import { createPullRunner, loadPullState } from '../src/sources/pull-runner.js';
import { fakePph, fakeUpwork } from './helpers/fake-marketplaces.js';
import {
  createFakeVk,
  message,
  userMethods,
  FAKE_VK_BASE,
} from './helpers/fake-vk.js';

const saveToken = (store, source) =>
  store.put({
    id: `secret:${source}:access-token`,
    tokens: ['secret', source, 'access-token'],
    children: [],
    token: `${source}-secret-token`,
  });

const withServer = async (pulls, fn) => {
  const store = createMemoryStore();
  const handle = await startServer({
    port: 0,
    store,
    enableHandlers: false,
    enableSync: false,
    pulls,
  });
  const base = `http://127.0.0.1:${handle.port}`;
  const post = async (path, body) => {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    return await fn({ store, post, base });
  } finally {
    await handle.close();
  }
};

describe('POST /api/pull (R-Z8)', () => {
  it('needs a source and refuses unknown or unconnected networks clearly', async () => {
    await withServer({}, async ({ post }) => {
      const none = await post('/api/pull', {});
      expect(none.status).toBe(400);
      expect(none.body.ok).toBe(false);
      const unknown = await post('/api/pull', { source: 'nope' });
      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe('unsupported');
      const idle = await post('/api/pull', { source: 'upwork' });
      expect(idle.status).toBe(409);
      expect(idle.body.code).toBe('not-connected');
    });
  });

  it('pulls Upwork, stores its messages, and allows one fetch per 15 s', async () => {
    await withServer({ upwork: fakeUpwork() }, async ({ store, post }) => {
      await saveToken(store, 'upwork');
      const first = await post('/api/pull', { source: 'upwork' });
      expect(first.status).toBe(200);
      expect(first.body.ok).toBe(true);
      expect(first.body.imported > 0).toBe(true);
      const ids = (await store.query()).map((l) => l.id);
      expect(ids.includes('msg:upwork:mA')).toBe(true);
      const state = await loadPullState(store, 'upwork');
      expect(typeof state.lastOkAt).toBe('string');
      const again = await post('/api/pull', { source: 'upwork' });
      expect(again.status).toBe(429);
      expect(again.body.code).toBe('rate-limited');
      expect(
        again.body.retryAfterMs > 0 && again.body.retryAfterMs <= 15000
      ).toBe(true);
    });
  });

  it('pulls PeoplePerHour', async () => {
    await withServer({ peopleperhour: fakePph() }, async ({ store, post }) => {
      await saveToken(store, 'peopleperhour');
      const out = await post('/api/pull', { source: 'peopleperhour' });
      expect(out.status).toBe(200);
      const ids = (await store.query()).map((l) => l.id);
      expect(ids.includes('msg:peopleperhour:mP')).toBe(true);
    });
  });

  it('pulls VK: conversations with names', async () => {
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getConversations': () => ({
          count: 1,
          items: [
            {
              conversation: { peer: { id: 7, type: 'user' } },
              last_message: message(11, 7, 'hi'),
            },
          ],
          profiles: [{ id: 7, first_name: 'Ann', last_name: 'Lee' }],
        }),
        'messages.getHistory': () => ({ count: 0, items: [] }),
      }),
    });
    const vk = {
      fetchImpl: fake.fetchImpl,
      baseUrl: FAKE_VK_BASE,
      requestsPerSecond: 1000,
    };
    await withServer({ vk }, async ({ store, post }) => {
      await saveToken(store, 'vk');
      const out = await post('/api/pull', { source: 'vk' });
      expect(out.status).toBe(200);
      const link = (await store.query()).find((l) => l.id === 'msg:vk:11');
      expect(link.senderName).toBe('Ann Lee');
    });
  });

  it('reports a refused token as an error without leaking the token', async () => {
    await withServer(
      { upwork: fakeUpwork(401) },
      async ({ store, post, base }) => {
        await saveToken(store, 'upwork');
        const out = await post('/api/pull', { source: 'upwork' });
        expect(out.status).toBe(502);
        expect(out.body.ok).toBe(false);
        expect(JSON.stringify(out.body).includes('upwork-secret-token')).toBe(
          false
        );
        const status = await (await fetch(`${base}/api/pull/status`)).json();
        expect(status.sources.upwork.connected).toBe(true);
        expect(status.sources.upwork.lastError.code).toBe(out.body.code);
        expect(status.sources.vk.connected).toBe(false);
      }
    );
  });
});

describe('the pull schedule (R-Z8)', () => {
  const clockOf = () => {
    const timers = [];
    return {
      timers,
      setTimer: (fn, ms) => {
        const timer = { fn, ms, cleared: false, unref() {} };
        timers.push(timer);
        return timer;
      },
      clearTimer: (timer) => {
        timer.cleared = true;
      },
    };
  };

  it('starts nothing before start(), skips unconnected networks, backs off on failure', async () => {
    const store = createMemoryStore();
    const clock = clockOf();
    let connected = false;
    let works = false;
    let runs = 0;
    const runner = createPullRunner({
      store,
      jobs: {
        upwork: {
          ready: async () => connected,
          run: async () => {
            runs += 1;
            if (!works) {
              throw new Error('down');
            }
            return { imported: 1 };
          },
          intervalMs: 1000,
        },
      },
      ...clock,
    });
    expect(clock.timers.length).toBe(0);
    runner.start();
    expect(clock.timers.length).toBe(1);
    // Not connected: no run, same interval.
    await clock.timers[0].fn();
    expect(runs).toBe(0);
    expect(clock.timers[1].ms).toBe(1000);
    // Connected but failing: the wait doubles.
    connected = true;
    await clock.timers[1].fn();
    expect(runs).toBe(1);
    expect(clock.timers[2].ms).toBe(2000);
    await clock.timers[2].fn();
    expect(clock.timers[3].ms).toBe(4000);
    // Recovered: back to the interval.
    works = true;
    await clock.timers[3].fn();
    expect(clock.timers[4].ms).toBe(1000);
    runner.stop();
    expect(clock.timers[4].cleared).toBe(true);
  });

  it('serves one fetch at a time and counts a background run against the gap', async () => {
    const store = createMemoryStore();
    let now = 1_000_000;
    let release;
    const runner = createPullRunner({
      store,
      now: () => now,
      jobs: {
        upwork: {
          ready: async () => true,
          run: () => new Promise((resolve) => (release = resolve)),
          intervalMs: 0,
        },
      },
    });
    const first = runner.fetchNow('upwork');
    await new Promise((r) => setTimeout(r, 5));
    const second = await runner.fetchNow('upwork');
    expect(second.code).toBe('rate-limited');
    release({ imported: 3 });
    expect((await first).imported).toBe(3);
    now += 14_000;
    expect((await runner.fetchNow('upwork')).code).toBe('rate-limited');
    now += 2_000;
    const third = runner.fetchNow('upwork');
    await new Promise((r) => setTimeout(r, 5));
    release({ imported: 0 });
    expect((await third).ok).toBe(true);
  });
});
