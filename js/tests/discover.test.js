/**
 * Server discovery tests. Exercises the priority order:
 *   same origin -> stored override -> default ports -> caller candidates.
 * All probes use an injected `fetchImpl` so the test is fully offline
 * and deterministic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { discoverServer, saveServerOverride } from '../src/web/discover.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

const ok = (data = { service: 'meta-sovereign', links: 0 }) => ({
  ok: true,
  json: async () => data,
});
const fail = () => ({ ok: false, json: async () => ({}) });

test('discover prefers same origin when reachable', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return url.startsWith('http://127.0.0.1:9000') ? ok() : fail();
  };
  const out = await discoverServer({
    fetchImpl,
    storage: fakeStorage(),
    origin: 'http://127.0.0.1:9000',
    candidates: [],
  });
  assert.deepEqual(out, { origin: 'http://127.0.0.1:9000' });
  assert.equal(calls.length, 1);
});

test('discover falls back to stored override when same-origin fails', async () => {
  const storage = fakeStorage();
  saveServerOverride('http://lan.local:8787', storage);
  const fetchImpl = async (url) =>
    url.startsWith('http://lan.local:8787') ? ok() : fail();
  const out = await discoverServer({
    fetchImpl,
    storage,
    origin: 'http://127.0.0.1:9999',
    candidates: [],
  });
  assert.deepEqual(out, { origin: 'http://lan.local:8787' });
});

test('discover falls back to default localhost ports', async () => {
  const fetchImpl = async (url) =>
    url.startsWith('http://127.0.0.1:8788') ? ok() : fail();
  const out = await discoverServer({
    fetchImpl,
    storage: fakeStorage(),
    origin: undefined,
    candidates: [],
  });
  assert.deepEqual(out, { origin: 'http://127.0.0.1:8788' });
});

test('discover tries caller-supplied LAN candidates last', async () => {
  const fetchImpl = async (url) =>
    url === 'http://192.168.1.50:8787/api/status?probe=1' ? ok() : fail();
  const out = await discoverServer({
    fetchImpl,
    storage: fakeStorage(),
    origin: undefined,
    candidates: ['http://192.168.1.50:8787'],
  });
  assert.deepEqual(out, { origin: 'http://192.168.1.50:8787' });
});

test('discover returns null when nothing answers', async () => {
  const fetchImpl = async () => fail();
  const out = await discoverServer({
    fetchImpl,
    storage: fakeStorage(),
    origin: 'http://127.0.0.1:9999',
    candidates: ['http://nope.local:1234'],
  });
  assert.equal(out, null);
});

test('discovery rejects unrelated JSON services and prefers trusted local HTTPS', async () => {
  const calls = [];
  const found = await discoverServer({
    origin: 'https://link-foundation.github.io',
    storage: null,
    fetchImpl: async (url) => {
      calls.push(url);
      return url.startsWith('https://127.0.0.1:8787/')
        ? ok()
        : ok({ links: 12 });
    },
  });
  assert.deepEqual(found, { origin: 'https://127.0.0.1:8787' });
  assert.equal(calls.length, 2);
  assert.equal(
    await discoverServer({
      origin: 'http://127.0.0.1:8787',
      storage: null,
      fetchImpl: async () => ok({ error: 'some other app' }),
    }),
    null
  );
});

test('a stalled candidate times out so discovery can try the real server', async () => {
  const found = await discoverServer({
    origin: 'http://127.0.0.1:9999',
    storage: null,
    probeTimeoutMs: 10,
    fetchImpl: (url, { signal }) =>
      url.includes(':9999/')
        ? new Promise((_resolve, reject) =>
            signal.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true }
            )
          )
        : Promise.resolve(ok()),
  });
  assert.deepEqual(found, { origin: 'http://127.0.0.1:8787' });
});

test('discovery accepts the lightweight identity without requesting full statistics', async () => {
  const calls = [];
  assert.deepEqual(
    await discoverServer({
      origin: 'https://127.0.0.1:8787',
      storage: null,
      fetchImpl: async (url, init) => {
        calls.push(url);
        assert.equal(new URL(url).searchParams.get('probe'), '1');
        assert.equal(init.cache, 'no-store');
        return ok({ service: 'meta-sovereign', discovery: true });
      },
    }),
    { origin: 'https://127.0.0.1:8787' }
  );
  assert.equal(calls.length, 1);
  assert.equal(
    await discoverServer({
      origin: 'https://127.0.0.1:8787',
      storage: null,
      fetchImpl: async () =>
        ok({ service: 'another-service', discovery: true }),
    }),
    null
  );
});

test('the primary local server can answer after a busy startup without being called offline', async () => {
  const server = await discoverServer({
    origin: 'https://link-foundation.github.io',
    storage: null,
    fetchImpl: (url, { signal }) => {
      if (!url.startsWith('https://127.0.0.1:8787/')) {
        return Promise.resolve(fail());
      }
      return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(
          () => resolve(ok({ service: 'meta-sovereign', discovery: true })),
          1800
        );
        signal.addEventListener(
          'abort',
          () => {
            globalThis.clearTimeout(timer);
            reject(new Error('aborted'));
          },
          { once: true }
        );
      });
    },
  });
  assert.deepEqual(server, { origin: 'https://127.0.0.1:8787' });
});
