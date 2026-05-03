/**
 * Handler bus tests — verifies the data-driven dispatch contract:
 *
 *   - handlers fire on matching put/delete events,
 *   - already-handled links are skipped on echo (sync round-trip),
 *   - selectors filter by id prefix / event / predicate,
 *   - replay re-fires for existing links,
 *   - errors in one handler don't block the rest.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import { createMemoryStore } from '../src/storage/index.js';
import {
  createHandlerBus,
  broadcastHandler,
  profileSyncHandler,
  automationHandler,
} from '../src/handlers/index.js';

const flush = () => new Promise((r) => setImmediate(r));

test('handler fires on matching put and stamps handledBy', async () => {
  const store = createMemoryStore();
  const bus = createHandlerBus(store);
  const calls = [];
  bus.register(
    'broadcast',
    { idPrefix: 'broadcast:', event: 'put' },
    async ({ link }) => {
      calls.push(link.id);
    }
  );

  await store.put({ id: 'broadcast:1', tokens: ['broadcast'], body: 'hi' });
  await flush();
  await flush();

  assert.deepEqual(calls, ['broadcast:1']);
  const persisted = await store.get('broadcast:1');
  assert.ok(persisted.handledBy?.broadcast);
});

test('handler is skipped when handledBy already records it', async () => {
  const store = createMemoryStore();
  const bus = createHandlerBus(store);
  const calls = [];
  bus.register(
    'broadcast',
    { idPrefix: 'broadcast:', event: 'put' },
    async () => {
      calls.push('fired');
    }
  );

  await store.put({
    id: 'broadcast:already',
    tokens: ['broadcast'],
    handledBy: { broadcast: 1 },
  });
  await flush();
  await flush();

  assert.equal(calls.length, 0);
});

test('handler does not loop on its own write-back', async () => {
  const store = createMemoryStore();
  const bus = createHandlerBus(store);
  let count = 0;
  bus.register(
    'broadcast',
    { idPrefix: 'broadcast:', event: 'put' },
    async ({ link, store: s }) => {
      count += 1;
      await s.put({ ...link, body: `${link.body ?? ''} (handled)` });
    }
  );

  await store.put({ id: 'broadcast:loop', tokens: ['broadcast'], body: 'x' });
  for (let i = 0; i < 10; i += 1) {
    await flush();
  }

  assert.equal(count, 1);
});

test('built-in broadcastHandler wires through the broadcast adapter', async () => {
  const store = createMemoryStore();
  const bus = createHandlerBus(store);
  const calls = [];
  const broadcast = async (networks, body) => {
    calls.push({ networks, body });
    return networks.map((n) => ({ network: n, ok: true }));
  };
  const { selector, run } = broadcastHandler({ broadcast });
  bus.register('broadcast', selector, run);

  await store.put({
    id: 'broadcast:42',
    tokens: ['broadcast'],
    networks: ['telegram', 'vk'],
    body: 'hello',
  });
  for (let i = 0; i < 5; i += 1) {
    await flush();
  }

  assert.equal(calls.length, 1);
  const persisted = await store.get('broadcast:42');
  assert.equal(persisted.dispatched, true);
  assert.equal(persisted.results.length, 2);
});

test('profileSyncHandler fans out + skips on echo', async () => {
  const store = createMemoryStore();
  const bus = createHandlerBus(store);
  const calls = [];
  const syncProfile = async (networks, link) => {
    calls.push(link.id);
    return networks.map((n) => ({ network: n, ok: true }));
  };
  const { selector, run } = profileSyncHandler({
    syncProfile,
    networks: ['telegram'],
  });
  bus.register('profile-sync', selector, run);

  await store.put({ id: 'profile:me', tokens: ['profile'], name: 'A' });
  for (let i = 0; i < 5; i += 1) {
    await flush();
  }

  assert.equal(calls.length, 1);
  assert.equal((await store.get('profile:me')).synced, true);
});

test('automationHandler creates plan links for inbound messages', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'graph:hello',
    tokens: ['graph'],
    nodes: [],
    edges: [],
  });
  const runGraph = () => [{ kind: 'reply', text: 'hi', graph: 'graph:hello' }];
  const { selector, run } = automationHandler({
    runGraph,
    hydrate: (g) => g,
  });
  const bus = createHandlerBus(store);
  bus.register('automation', selector, run);

  await store.put({
    id: 'msg:tg:1',
    tokens: ['message'],
    sender: 'alice',
    body: 'hi',
  });
  for (let i = 0; i < 6; i += 1) {
    await flush();
  }

  const plan = await store.get('plan:msg:tg:1');
  assert.ok(plan, 'plan link should exist');
  assert.equal(plan.plans.length, 1);
});

test('automationHandler skips messages from "me"', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'graph:hello',
    tokens: ['graph'],
    nodes: [],
    edges: [],
  });
  let runs = 0;
  const runGraph = () => {
    runs += 1;
    return [];
  };
  const { selector, run } = automationHandler({
    runGraph,
    hydrate: (g) => g,
  });
  const bus = createHandlerBus(store);
  bus.register('automation', selector, run);

  await store.put({
    id: 'msg:tg:from-me',
    tokens: ['message'],
    sender: 'me',
    body: 'hi',
  });
  for (let i = 0; i < 6; i += 1) {
    await flush();
  }

  assert.equal(runs, 0);
});

test('replay fires for existing links', async () => {
  const store = createMemoryStore();
  await store.put({ id: 'broadcast:r1', tokens: ['broadcast'] });
  const bus = createHandlerBus(store);
  let n = 0;
  bus.register('broadcast', { idPrefix: 'broadcast:' }, async () => {
    n += 1;
  });
  await bus.replay({ idPrefix: 'broadcast:' });
  assert.equal(n, 1);
});

test('errors in one handler do not block subsequent handlers', async () => {
  const store = createMemoryStore();
  const bus = createHandlerBus(store);
  const calls = [];
  bus.register('throws', { idPrefix: 'broadcast:' }, async () => {
    throw new Error('boom');
  });
  bus.register('ok', { idPrefix: 'broadcast:' }, async () => {
    calls.push('ok');
  });
  await store.put({ id: 'broadcast:err', tokens: ['broadcast'] });
  await flush();
  await flush();
  assert.deepEqual(calls, ['ok']);
});
