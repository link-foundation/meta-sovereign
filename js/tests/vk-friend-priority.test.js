import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  createVkFriendsJob,
  loadVkFriends,
  saveVkFriends,
} from '../src/automation/vk-friends.js';
import { VK_FRIENDS_JOB } from '../src/automation/vk-friends-settings.js';
import { outgoingFriendPriority } from '../src/sources/vk-friend-priority.js';
import { createVkFriendsCommands } from '../src/cli/vk-friends-commands.js';
import {
  createVkMaintenanceJob,
  saveVkMaintenance,
} from '../src/automation/vk-maintenance.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import {
  friendsAdapter,
  friendsServer,
  friendsJob,
} from '../../experiments/issue-56/vk-friends-fixture.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const snapshotAdapter = (ids = [7, 8]) =>
  friendsAdapter({
    methods: {
      'friends.getRequests': (params) => ({
        count: ids.length,
        items: ids.slice(
          Number(params.offset ?? 0),
          Number(params.offset ?? 0) + Number(params.count)
        ),
      }),
    },
  });

test('outgoing observation reads a complete bounded list and refuses incomplete/account-changing pages', async () => {
  const ids = Array.from({ length: 1001 }, (_, i) => i + 2);
  const adapter = snapshotAdapter(ids);
  const snapshot = await adapter.live.outgoingFriendPriority({
    token: 'fixture-user-token',
  });
  assert.deepEqual(snapshot, { accountId: 1, ids });
  const calls = adapter.fake.calls.filter(
    (call) => call.name === 'friends.getRequests'
  );
  assert.deepEqual(
    calls.map((call) => [call.params.offset, call.params.out]),
    [
      ['0', '1'],
      ['1000', '1'],
    ]
  );
  const state = await adapter.live.friendStates(ids, {
    token: 'fixture-user-token',
  });
  assert.equal(Object.keys(state.statuses).length, ids.length);
  assert.deepEqual(
    adapter.fake.calls
      .filter((call) => call.name === 'friends.areFriends')
      .map((call) => call.params.user_ids.split(',').length),
    [1000, 1]
  );
  for (const failure of [
    'truncated',
    'duplicate',
    'oversized',
    'account',
    'count',
  ]) {
    let pages = 0;
    let users = 0;
    await assert.rejects(
      outgoingFriendPriority(
        async (name) => {
          if (name === 'users.get') {
            return [{ id: failure === 'account' ? ++users : 1 }];
          }
          pages++;
          if (failure === 'oversized') {
            return { count: 10001, items: [] };
          }
          if (failure === 'duplicate') {
            return { count: 2, items: [7, 7] };
          }
          if (failure === 'count') {
            return pages === 1
              ? { count: 1001, items: ids.slice(0, 1000) }
              : { count: 1002, items: [1002, 1003] };
          }
          if (failure === 'account') {
            return { count: 0, items: [] };
          }
          return { count: 2, items: pages === 1 ? [7] : [] };
        },
        { token: 'fixture-user-token' }
      ),
      /Incomplete|changed/
    );
    assert.ok(pages <= 2);
  }
});

test('seed merges owner priorities, clear is acknowledged and neither issues friend effects', async () => {
  const store = createMemoryStore();
  const adapter = snapshotAdapter();
  const job = friendsJob(store, adapter);
  try {
    await saveVkFriends(store, {
      ...(await loadVkFriends(store)).settings,
      priorityIds: [99, 7],
    });
    assert.deepEqual(
      (await job.seedPriority()).settings.priorityIds,
      [99, 7, 8]
    );
    assert.deepEqual(
      (await job.seedPriority()).settings.priorityIds,
      [99, 7, 8]
    );
    assert.deepEqual((await job.clearPriority()).settings.priorityIds, []);
    assert.deepEqual(adapter.effects, []);
    assert.ok(
      adapter.fake.calls.every((call) =>
        ['users.get', 'friends.getRequests'].includes(call.name)
      )
    );
    await job.stop();
    await assert.rejects(job.seedPriority(), /stopped/);
  } finally {
    await job.stop();
  }
});

test('only persisted legacy empty and singleton priorities normalize; new writes stay strict', async () => {
  const store = createMemoryStore();
  const defaults = (await loadVkFriends(store)).settings;
  for (const [value, expected] of [
    [null, []],
    ['', []],
    [undefined, []],
    [7, [7]],
  ]) {
    await store.put({ id: VK_FRIENDS_JOB, ...defaults, priorityIds: value });
    assert.deepEqual(
      (await loadVkFriends(store)).settings.priorityIds,
      expected
    );
    await assert.rejects(
      saveVkFriends(store, { ...defaults, priorityIds: value }),
      /priorityIds/
    );
  }
  for (const value of ['7', 0, -1, [0], [7, '8']]) {
    await store.put({ id: VK_FRIENDS_JOB, ...defaults, priorityIds: value });
    await assert.rejects(loadVkFriends(store), /priorityIds/);
  }
});

test('credential changes, refused persistence and provider secrets never replace the acknowledged list', async () => {
  const store = createMemoryStore();
  const saved = (await loadVkFriends(store)).settings;
  await saveVkFriends(store, { ...saved, priorityIds: [99] });
  let token = 'fixture-secret-short';
  let observe = async () => {
    token = 'new-fixture-token';
    return { accountId: 1, ids: [7] };
  };
  const job = createVkFriendsJob({
    store,
    optionsFor: async () => ({ token }),
    resolve: () => ({ live: { outgoingFriendPriority: () => observe() } }),
  });
  try {
    await assert.rejects(job.seedPriority(), /credential changed/);
    observe = async () => {
      throw new Error(`provider failed ${token}`);
    };
    await assert.rejects(
      job.seedPriority(),
      (error) =>
        !error.message.includes(token) && error.message.includes('<redacted>')
    );
    observe = async () => ({ accountId: 1, ids: [7] });
    store.flush = async () => {
      throw new Error('synthetic flush refusal');
    };
    await assert.rejects(job.seedPriority(), /flush refusal/);
    assert.deepEqual((await loadVkFriends(store)).settings.priorityIds, [99]);
  } finally {
    await job.stop();
  }
});

test('a held seed serializes clear and shutdown drains it without resurrecting priorities', async () => {
  const store = createMemoryStore();
  const seen = deferred();
  const gate = deferred();
  const job = createVkFriendsJob({
    store,
    optionsFor: async () => ({ token: 'fixture-user-token' }),
    resolve: () => ({
      live: {
        outgoingFriendPriority: async () => {
          seen.resolve();
          await gate.promise;
          return { accountId: 1, ids: [7] };
        },
      },
    }),
  });
  const seed = job.seedPriority();
  await seen.promise;
  const clear = job.clearPriority();
  gate.resolve();
  await seed;
  await clear;
  assert.deepEqual((await loadVkFriends(store)).settings.priorityIds, []);
  const secondGate = deferred();
  const held = createVkFriendsJob({
    store,
    optionsFor: async () => ({ token: 'fixture-user-token' }),
    resolve: () => ({
      live: { outgoingFriendPriority: () => secondGate.promise },
    }),
  });
  const pending = held.seedPriority();
  await new Promise((done) => globalThis.setImmediate(done));
  let stopped = false;
  const stopping = held.stop().then(() => {
    stopped = true;
  });
  assert.equal(stopped, false);
  const rejected = assert.rejects(pending, /stopped/);
  secondGate.resolve({ accountId: 1, ids: [8] });
  await Promise.all([rejected, stopping]);
  assert.deepEqual((await loadVkFriends(store)).settings.priorityIds, []);
  await job.stop();
});

test('seeded priorities protect cleanup and outgoing cancellation through the existing shared guard', async () => {
  for (const kind of ['cleanup', 'outgoing']) {
    const store = createMemoryStore();
    const adapter = snapshotAdapter([7]);
    const seed = friendsJob(store, adapter);
    await seed.seedPriority();
    let effects = 0;
    const job = createVkMaintenanceJob({
      store,
      kind,
      optionsFor: async () => ({ token: 'fixture-user-token' }),
      resolve: () => ({
        live: {
          maintenanceSnapshot: async () => ({
            accountId: 1,
            items: [
              {
                userId: 7,
                relation: kind === 'cleanup' ? 3 : 1,
                deactivated: 'deleted',
              },
            ],
            observed: {},
          }),
          removeFriend: async () => {
            effects++;
          },
        },
      }),
    });
    try {
      const preview = await job.preview();
      assert.equal(preview.plan.items[0].reason, 'protected');
      await job.run({ planId: preview.plan.planId, confirm: true });
      assert.equal(effects, 0);
      await saveVkMaintenance(store, kind, {
        ...preview.settings,
        priorityIds: [],
      });
      assert.deepEqual((await loadVkFriends(store)).settings.priorityIds, [7]);
    } finally {
      await job.stop();
      await seed.stop();
    }
  }
});

test(
  'CLI owns seed/clear stores and both Lino transports require trusted mutation origins',
  { timeout: 20000 },
  async () => {
    const store = createMemoryStore();
    let closed = 0;
    store.close = async () => {
      closed++;
    };
    const adapter = snapshotAdapter();
    const command = createVkFriendsCommands({
      openStore: async () => store,
      openReadOnly: async () => store,
      createJob: ({ store: opened }) => friendsJob(opened, adapter),
    })['vk-friends'];
    const output = [];
    await command({ _: ['seed-priority'] }, (line) =>
      output.push(JSON.parse(line))
    );
    assert.deepEqual(output.at(-1).settings.priorityIds, [7, 8]);
    await command({ _: ['clear-priority'] }, (line) =>
      output.push(JSON.parse(line))
    );
    assert.deepEqual(output.at(-1).settings.priorityIds, []);
    assert.equal(closed, 2);
    const fixture = await friendsServer({ adapter });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(fixture.base, '/api/vk/friends', type);
        assert.equal(
          (await post('/seed-priority', {}, 'https://foreign.invalid')).status,
          403
        );
        const seeded = await post('/seed-priority', {});
        assert.equal(seeded.status, 200);
        assert.deepEqual(seeded.answer.settings.priorityIds, [7, 8]);
        const cleared = await post('/clear-priority', {});
        assert.equal(cleared.status, 200);
        assert.deepEqual(cleared.answer.settings.priorityIds, []);
      }
      assert.equal(fixture.messages(), 0);
      assert.deepEqual(adapter.effects, []);
    } finally {
      await fixture.close();
    }
  }
);
