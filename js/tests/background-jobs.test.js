// R-Z7: the audience membership sync (R-X13) and the 24-hour Upwork and
// PeoplePerHour cache purge (R-S12, R-T12) really run, and the page's route
// reaches the sync. Fakes only: no network is asked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createMemoryStore } from '../src/storage/index.js';
import { startServer } from '../src/server/index.js';
import {
  audienceGroups,
  audienceSyncFor,
  syncAudiences,
} from '../src/server/audience-sync.js';
import { purgeSoftCaches } from '../src/server/background-jobs.js';
import { resolveAudience } from '../src/crm/people.js';

const DAY = 24 * 60 * 60 * 1000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fakeVk = () => {
  const calls = [];
  const live = {
    friends: async (options) => {
      calls.push(['friends', options.token]);
      return [
        { user: '1', name: 'Ann' },
        { user: '2', name: 'Bob' },
      ];
    },
    chatMembers: async (id) => {
      calls.push(['chat', id]);
      if (id === '999') {
        throw new Error('access denied for token sekret-token-value');
      }
      return [{ user: '2', name: 'Bob' }];
    },
  };
  return { calls, resolve: () => ({ live }) };
};

const seeded = async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'secret:vk:access-token',
    token: 'sekret-token-value',
  });
  await store.put({
    id: 'audience:vip',
    tokens: ['audience', 'vip'],
    text: 'friends:vk & chat:vk:2000000001',
  });
  await store.put({
    id: 'audience:outer',
    tokens: ['audience', 'outer'],
    text: 'audience:vip - chat:vk:999',
  });
  await store.put({
    id: 'automation:a',
    tokens: ['automation', 'a'],
    audience: 'community:vk:77',
  });
  return store;
};

test('the groups named by saved audiences and automations are found', async () => {
  const store = await seeded();
  const groups = audienceGroups(await store.query());
  assert.deepEqual(
    groups
      .get('vk')
      .map((g) => `${g.kind}:${g.id ?? ''}`)
      .sort(),
    ['chat:2000000001', 'chat:999', 'community:77', 'friends:']
  );
});

test('syncing stores member links, so the audience finds people', async () => {
  const store = await seeded();
  const vk = fakeVk();
  const done = await syncAudiences({ store, resolve: vk.resolve, now: 1000 });
  // The group the network refused is told, without the token, and the
  // others still went through.
  const source = done.sources[0];
  assert.equal(source.source, 'vk');
  assert.equal(source.ok, false);
  assert.ok(source.members >= 3);
  assert.ok(!JSON.stringify(done).includes('sekret-token-value'));
  assert.equal(vk.calls[0][1], 'sekret-token-value');
  const links = await store.query();
  assert.ok(links.some((l) => l.id === 'member:vk:friends:1'));
  assert.deepEqual(
    resolveAudience(links, 'friends:vk & chat:vk:2000000001').map(
      (p) => p.user
    ),
    ['2']
  );
});

test('a network with no token is reported, not asked', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'audience:x',
    tokens: ['audience'],
    text: 'friends:vk',
  });
  const vk = fakeVk();
  const done = await syncAudiences({ store, resolve: vk.resolve });
  assert.equal(done.ok, false);
  assert.match(done.sources[0].error, /no token/);
  assert.equal(vk.calls.length, 0);
});

test('the sync route is reachable and validates its body', async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-z7-aud-'));
  const store = await seeded();
  const server = await startServer({
    port: 0,
    storeDir,
    store,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false },
    log: null,
  });
  try {
    const post = (body) =>
      fetch(`http://127.0.0.1:${server.port}/api/audience/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const bad = await post({ source: '../x' });
    assert.equal(bad.status, 400);
    // Nothing asks a network here: no `vk` live object is faked, so the
    // real adapter would be used; an unknown network stays a clean answer.
    const none = await post({ source: 'nosuch' });
    assert.equal(none.status, 200);
    assert.deepEqual((await none.json()).sources, []);
  } finally {
    await server.close();
  }
});

test('the 24-hour cache purge removes only expired live links', async () => {
  const store = createMemoryStore();
  const now = 10 * DAY;
  const put = (id, source, extra) =>
    store.put({ id, tokens: ['message', source], source, ...extra });
  await put('msg:upwork:old', 'upwork', {
    softCache: true,
    cachedAt: now - DAY - 1,
  });
  await put('msg:upwork:new', 'upwork', {
    softCache: true,
    cachedAt: now - 1000,
  });
  await put('msg:upwork:mine', 'upwork', {});
  await put('msg:peopleperhour:old', 'peopleperhour', {
    softCache: true,
    cachedAt: now - 2 * DAY,
  });
  await put('msg:github:old', 'github', { softCache: true, cachedAt: 1 });
  const purged = await purgeSoftCaches(store, now);
  assert.deepEqual(purged, { upwork: 1, peopleperhour: 1 });
  assert.deepEqual((await store.query()).map((l) => l.id).sort(), [
    'msg:github:old',
    'msg:upwork:mine',
    'msg:upwork:new',
  ]);
});

test('a started server purges expired cache by itself', async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-z7-purge-'));
  const store = createMemoryStore();
  await store.put({
    id: 'msg:upwork:old',
    tokens: ['message', 'upwork'],
    source: 'upwork',
    softCache: true,
    cachedAt: Date.now() - 3 * DAY,
  });
  process.env.MS_CACHE_PURGE_DELAY_MS = '20';
  const server = await startServer({
    port: 0,
    storeDir,
    store,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false },
    log: null,
  });
  try {
    await pause(300);
    assert.equal(await store.get('msg:upwork:old'), null);
  } finally {
    delete process.env.MS_CACHE_PURGE_DELAY_MS;
    await server.close();
  }
});

test('MS_AUDIENCE_SYNC_HOURS: nonsense logs once and keeps the daily default, 0 is off', () => {
  const store = createMemoryStore();
  const run = (value) => {
    const events = [];
    const later = [];
    const job = audienceSyncFor({
      store,
      log: (e) => events.push(e),
      later,
      env: { MS_AUDIENCE_SYNC_HOURS: value },
    });
    return { events, scheduled: later.length, job };
  };
  const bad = run('often');
  assert.equal(bad.scheduled, 1);
  assert.equal(bad.events.length, 1);
  assert.equal(bad.events[0].event, 'audience_sync_setting_ignored');
  assert.equal(run('0').scheduled, 0);
  assert.equal(run('0').events.length, 0);
  assert.equal(run('6').scheduled, 1);
});
