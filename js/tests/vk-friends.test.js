import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { loadVkFriends, saveVkFriends } from '../src/automation/vk-friends.js';
import { createVkFriendsCommands } from '../src/cli/vk-friends-commands.js';
import { saveVkOnline } from '../src/automation/vk-online.js';
import { runCli } from '../src/cli/index.js';
import { createVkFriendsApi } from '../src/web/vk-friends-api.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LINO_TEXT, LINO_BINARY, encodeWire } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import {
  friendsAdapter,
  friendsServer,
  friendsJob as jobFor,
} from '../../experiments/issue-56/vk-friends-fixture.mjs';

const defaults = {
  enabled: false,
  everyMinutes: 20,
  maxFriends: 10000,
  batchSize: 23,
  priorityIds: [],
};
const apply = async (job) =>
  job.run({ planId: (await job.preview()).plan.planId, confirm: true });

test('VK actual adapter exposes bounded friend snapshots and exact action receipts', async () => {
  const adapter = friendsAdapter();
  assert.equal(typeof adapter.live.friendSnapshot, 'function');
  const snapshot = await adapter.live.friendSnapshot({
    ...defaults,
    token: 'fixture-user-token',
    priorityIds: [7, 8],
  });
  assert.deepEqual(snapshot.ids, [7, 8, 9, 11]);
  assert.equal(snapshot.accountId, 1);
  const request = adapter.fake.calls.find(
    (row) => row.name === 'friends.getRequests'
  );
  assert.equal(request.params.sort, '1');
  assert.equal(request.params.count, '23');
  let guarded = false;
  assert.deepEqual(
    await adapter.live.addFriend(
      9,
      { token: 'fixture-user-token' },
      async () => {
        guarded = true;
      }
    ),
    { confirmed: true, receipt: 2, outcome: 'accepted' }
  );
  assert.equal(guarded, true);
  assert.equal(
    adapter.fake.calls.at(-1).params.access_token,
    'fixture-user-token'
  );
  assert.equal(
    (await adapter.live.addFriend(7, { token: 'fixture-user-token' })).outcome,
    'sent'
  );
  adapter.mode('unconfirmed');
  await assert.rejects(
    adapter.live.addFriend(11, { token: 'fixture-user-token' }),
    { code: 'unconfirmed' }
  );
});

test('priority requests precede mutual-ranked incoming acceptance and consume capacity', async () => {
  const store = createMemoryStore();
  const adapter = friendsAdapter();
  const job = jobFor(store, adapter);
  try {
    assert.deepEqual((await loadVkFriends(store)).settings, defaults);
    assert.equal((await job.run({ scheduled: true })).skipped, 'not-due');
    assert.equal(adapter.fake.calls.length, 0);
    await saveVkFriends(store, {
      ...defaults,
      priorityIds: [7, 8],
      maxFriends: 3,
    });
    const plan = (await job.preview()).plan;
    assert.deepEqual(
      plan.items.map((row) => [row.userId, row.reason]),
      [
        [7, 'eligible'],
        [8, 'existing'],
        [9, 'eligible'],
        [11, 'capacity'],
      ]
    );
    assert.equal(adapter.effects.length, 0);
    await assert.rejects(
      job.run({ planId: plan.planId, confirm: false }),
      /Confirm/
    );
    const answer = await job.run({ planId: plan.planId, confirm: true });
    assert.deepEqual(adapter.effects, [7, 9]);
    assert.deepEqual(
      answer.last.results.map((row) => row.outcome),
      ['sent', 'accepted']
    );
    await assert.rejects(
      job.run({ planId: plan.planId, confirm: true }),
      /current reviewed/
    );
  } finally {
    await job.stop();
  }
});

test('fresh relationship, account, credential, policy and capacity changes refuse effects', async () => {
  for (const change of [
    'relation',
    'account',
    'token',
    'policy',
    'capacity',
    'expiry',
    'clock',
  ]) {
    const store = createMemoryStore();
    const adapter = friendsAdapter();
    let token = 'fixture-user-token';
    let time = 1700000000000;
    const job = jobFor(store, adapter, {
      now: () => time,
      optionsFor: async () => ({ token }),
    });
    try {
      const plan = (await job.preview()).plan;
      if (change === 'relation') {
        adapter.relations.set(9, 0);
      }
      if (change === 'account') {
        adapter.account(2);
      }
      if (change === 'token') {
        token = 'changed-fixture-token';
      }
      if (change === 'policy') {
        await saveVkFriends(store, { ...defaults, maxFriends: 2 });
      }
      if (change === 'capacity') {
        adapter.count(10000);
      }
      if (change === 'expiry') {
        time += 300001;
      }
      if (change === 'clock') {
        time--;
      }
      const answer = await job
        .run({ planId: plan.planId, confirm: true })
        .catch((error) => error);
      assert.ok(
        answer instanceof Error || answer.last.status === 'refused',
        change
      );
      assert.equal(adapter.effects.length, 0, change);
    } finally {
      await job.stop();
    }
  }
});

test('intent acknowledgement precedes the final guard and blocks effects after a failed write', async () => {
  for (const mode of ['write', 'relation', 'policy', 'token']) {
    const store = createMemoryStore();
    const adapter = friendsAdapter();
    let token = 'fixture-user-token';
    const job = jobFor(store, adapter, { optionsFor: async () => ({ token }) });
    try {
      const plan = (await job.preview()).plan;
      store.flush = async () => {
        const intent = await store.get('provider-friend:vk:1:9');
        if (intent?.status !== 'pending') {
          return;
        }
        if (mode === 'write') {
          throw new Error('intent refused');
        }
        if (mode === 'relation') {
          adapter.relations.set(9, 3);
        }
        if (mode === 'token') {
          token = 'changed-fixture-token';
        }
        if (mode === 'policy') {
          await store.put({
            id: 'provider-job:vk:friends',
            ...defaults,
            enabled: true,
          });
        }
      };
      const result = await job
        .run({ planId: plan.planId, confirm: true })
        .catch((error) => error);
      assert.ok(result instanceof Error || result.last.status === 'refused');
      assert.deepEqual(adapter.effects, [], mode);
    } finally {
      await job.stop();
    }
  }
});

test('rate refusal is not retried and unknown effects remain blocked through fresh review', async () => {
  for (const mode of ['refused', 'unknown', 'unconfirmed']) {
    const store = createMemoryStore();
    const adapter = friendsAdapter();
    const job = jobFor(store, adapter);
    try {
      adapter.mode(mode);
      const answer = await apply(job);
      assert.equal(
        answer.last.status,
        mode === 'refused' ? 'refused' : 'unknown'
      );
      assert.deepEqual(adapter.effects, [9]);
      assert.equal(
        (await store.get('provider-friend:vk:1:9')).status,
        answer.last.status
      );
      const next = (await job.preview()).plan;
      if (mode !== 'refused') {
        assert.equal(next.items[0].reason, 'unknown');
      }
    } finally {
      await job.stop();
    }
  }
});

test(
  'real Lino restart retains confirmed receipts, scheduling interval and unknown write outcomes',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-friends-'));
    const adapter = friendsAdapter();
    let store;
    let job;
    const time = 1700000000000;
    try {
      const path = join(dir, 'links.lino');
      store = await createLinoTextStore(path);
      await saveVkFriends(store, { ...defaults, enabled: true });
      job = jobFor(store, adapter, { now: () => time });
      await job.run({ scheduled: true });
      await job.stop();
      await store.close();
      store = await createLinoTextStore(path);
      job = jobFor(store, adapter, { now: () => time });
      assert.equal((await job.run({ scheduled: true })).skipped, 'not-due');
      assert.deepEqual(adapter.effects, [9, 11]);
      await job.stop();
      adapter.relations.set(9, 2);
      job = jobFor(store, adapter);
      const plan = (await job.preview()).plan;
      assert.equal(
        plan.items.find((row) => row.userId === 9).reason,
        'unsettled'
      );
      // A new target with a lost durable receipt must remain unknown after reopen.
      adapter.relations.set(12, 0);
      await saveVkFriends(store, { ...defaults, priorityIds: [12] });
      const next = (await job.preview()).plan;
      const flush = store.flush.bind(store);
      store.flush = async () => {
        if (
          (await store.get('provider-friend:vk:1:12'))?.status === 'confirmed'
        ) {
          throw new Error('outcome refused');
        }
        return flush();
      };
      await assert.rejects(
        job.run({ planId: next.planId, confirm: true }),
        /outcome refused/
      );
      store.flush = flush;
      await job.stop();
      await store.close();
      store = await createLinoTextStore(path);
      job = jobFor(store, adapter);
      assert.equal((await job.preview()).plan.items[0].reason, 'unknown');
      assert.equal(
        (await store.get('provider-friend:vk:1:12')).status,
        'pending'
      );
      assert.deepEqual(adapter.effects, [9, 11, 12]);
    } finally {
      await job?.stop();
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('settled provider observations allow a new relationship while a concurrent unknown never becomes refused', async () => {
  const store = createMemoryStore();
  const adapter = friendsAdapter();
  const job = jobFor(store, adapter);
  try {
    await apply(job);
    await job.preview();
    adapter.relations.set(9, 2);
    const plan = (await job.preview()).plan;
    assert.equal(plan.items[0].reason, 'eligible');
    await store.put({ id: 'provider-friend:vk:1:9', status: 'unknown' });
    assert.equal(
      (await job.run({ planId: plan.planId, confirm: true })).last.status,
      'unknown'
    );
    assert.equal((await store.get('provider-friend:vk:1:9')).status, 'unknown');
    assert.deepEqual(adapter.effects, [9, 11]);
  } finally {
    await job.stop();
  }
});

test('overlapping batches coalesce and stopping during owned pacing preserves progress without another effect', async () => {
  const store = createMemoryStore();
  const adapter = friendsAdapter();
  let paced;
  const waiting = new Promise((resolve) => {
    paced = resolve;
  });
  const job = jobFor(store, adapter, {
    sleep: async (_ms, signal) => {
      paced();
      await new Promise((resolve) =>
        signal.addEventListener('abort', resolve, { once: true })
      );
    },
  });
  const plan = (await job.preview()).plan;
  const first = job.run({ planId: plan.planId, confirm: true });
  assert.equal(job.run({ planId: plan.planId, confirm: true }), first);
  await waiting;
  await job.stop();
  await first;
  assert.deepEqual(adapter.effects, [9]);
  assert.equal((await store.get('provider-friend:vk:1:9')).status, 'confirmed');
  assert.equal(
    (await loadVkFriends(store)).last.results[0].outcome,
    'accepted'
  );
});

test('policy validation rolls back unacknowledged choices without importing personal priority IDs', async () => {
  const store = createMemoryStore();
  for (const patch of [
    { enabled: 'true' },
    { everyMinutes: 0 },
    { maxFriends: 10001 },
    { batchSize: 101 },
    { priorityIds: [0] },
    { priorityIds: Array(101).fill(1) },
  ]) {
    await assert.rejects(saveVkFriends(store, { ...defaults, ...patch }));
  }
  await saveVkFriends(store, { ...defaults, priorityIds: [7, 7] });
  store.flush = async () => {
    throw new Error('save refused');
  };
  await assert.rejects(
    saveVkFriends(store, { ...defaults, enabled: true }),
    /save refused/
  );
  assert.deepEqual((await loadVkFriends(store)).settings.priorityIds, [7]);
  assert.equal((await loadVkFriends(store)).settings.enabled, false);
});

test('foreground CLI uses read-only status, explicit reviewed confirmation and owned cleanup', async () => {
  const store = createMemoryStore();
  const adapter = friendsAdapter();
  let writes = 0;
  let reads = 0;
  let closed = 0;
  store.close = async () => {
    closed++;
  };
  const commands = createVkFriendsCommands({
    openStore: async () => {
      writes++;
      return store;
    },
    openReadOnly: async () => {
      reads++;
      return store;
    },
    createJob: ({ store: opened }) => jobFor(opened, adapter),
  });
  const command = commands['vk-friends'];
  const output = [];
  assert.equal(await command({ _: [] }, (line) => output.push(line)), 0);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  await command({ _: ['save'], priority: '7', 'max-friends': '3' }, () => {});
  await command({ _: ['plan'] }, (line) => output.push(line));
  const plan = JSON.parse(output.at(-1)).plan;
  await assert.rejects(
    command({ _: ['run'], plan: plan.planId }, () => {}),
    /Confirm/
  );
  adapter.mode('refused');
  assert.equal(
    await command({ _: ['run'], plan: plan.planId, confirm: 'true' }, () => {}),
    1
  );
  assert.equal(closed, 5);
  const logs = [];
  await assert.rejects(
    runCli(['vk-friends', 'wrong'], { log: (line) => logs.push(line) }),
    /status\|save\|plan\|run/
  );
});

test(
  'both default Lino encodings require trusted origin and explicit current plan confirmation',
  { timeout: 20000 },
  async () => {
    const fixture = await friendsServer();
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(fixture.base, '/api/vk/friends', type);
        assert.equal(
          (await post('', defaults, 'https://foreign.invalid')).status,
          403
        );
        assert.equal(
          (await post('', { ...defaults, batchSize: 1 })).status,
          200
        );
        const planned = await post('/plan', {});
        assert.equal(planned.status, 200);
        assert.equal((await post('/run', { scheduled: true })).status, 400);
        const result = await post('/run', {
          planId: planned.answer.plan.planId,
          confirm: true,
        });
        assert.equal(result.status, 200);
        assert.equal(result.answer.last.status, 'confirmed');
        assert.equal(
          (
            await post('/run', {
              planId: planned.answer.plan.planId,
              confirm: true,
            })
          ).status,
          400
        );
      }
      assert.deepEqual(fixture.effects, [9, 11]);
      fixture.refuseWrites(true);
      const response = await fetch(`${fixture.base}/api/vk/friends`, {
        method: 'POST',
        headers: { 'content-type': LINO_TEXT, origin: fixture.base },
        body: encodeWire({ ...defaults, enabled: true }, LINO_TEXT),
      });
      assert.equal(response.status, 400);
      assert.equal(
        (await loadVkFriends(fixture.store)).settings.enabled,
        false
      );
      assert.equal(fixture.messages(), 0);
    } finally {
      await fixture.close();
    }
  }
);

test('offline API retains policy and refuses provider effects, with all shared translations present', async () => {
  const store = createMemoryStore();
  const api = createVkFriendsApi({
    get: async () => null,
    report: async () => null,
    local: async () => store,
  });
  assert.equal((await api.vkFriends()).canRun, false);
  assert.equal(
    (await api.saveVkFriends({ ...defaults, enabled: true })).settings.enabled,
    true
  );
  assert.equal((await api.planVkFriends()).ok, false);
  assert.equal((await api.runVkFriends('unknown')).ok, false);
  for (const dict of Object.values(dictionaries)) {
    for (const key of [
      'title',
      'hint',
      'enabled',
      'priorityIds',
      'accept',
      'request',
      'unknown',
      'sent',
      'accepted',
      'refused',
    ]) {
      assert.equal(typeof dict[`vkFriends.${key}`], 'string');
    }
  }
});

test('incomplete provider identity, counts and relationship receipts cannot authorize a plan', async () => {
  for (const [method, reply] of [
    ['users.get', []],
    ['users.get', [{ id: 1 }, { id: 2 }]],
    ['friends.get', { count: -1 }],
    ['friends.getRequests', { count: 1, items: [9, 11] }],
    ['friends.getRequests', { count: 1, items: [{ user_id: 9 }] }],
    ['friends.areFriends', [{ user_id: 9, friend_status: 2 }]],
    [
      'friends.areFriends',
      [
        { user_id: 9, friend_status: 2 },
        { user_id: 9, friend_status: 0 },
      ],
    ],
  ]) {
    const adapter = friendsAdapter({ methods: { [method]: () => reply } });
    const job = jobFor(createMemoryStore(), adapter);
    try {
      await assert.rejects(job.preview(), /Incomplete/);
      assert.equal(adapter.effects.length, 0);
    } finally {
      await job.stop();
    }
  }
  const adapter = friendsAdapter({ methods: { 'friends.add': () => 4 } });
  assert.deepEqual(
    await adapter.live.addFriend(7, { token: 'fixture-user-token' }),
    { confirmed: true, receipt: 4, outcome: 'resent' }
  );
});

test('the final action guard runs after the actual adapter rate wait', async () => {
  const store = createMemoryStore();
  let waiting = false;
  const adapter = friendsAdapter({
    live: {
      limiter: {
        wait: async () => {
          if (waiting) {
            waiting = false;
            await saveVkFriends(store, { ...defaults, enabled: true });
          }
        },
      },
    },
  });
  const job = jobFor(store, adapter);
  try {
    const plan = (await job.preview()).plan;
    waiting = true;
    assert.equal(
      (await job.run({ planId: plan.planId, confirm: true })).last.status,
      'refused'
    );
    assert.deepEqual(adapter.effects, []);
  } finally {
    await job.stop();
  }
});

test('scheduled read refusals are redacted, throttled at the saved interval and leave structured diagnostics', async () => {
  const store = createMemoryStore();
  let time = 1700000000000;
  const events = [];
  let tick;
  const adapter = friendsAdapter({
    methods: {
      'friends.getRequests': () => {
        throw new Error('fixture-user-token refused');
      },
    },
  });
  const job = jobFor(store, adapter, {
    now: () => time,
    log: (event) => events.push(event),
    setInterval: (callback) => {
      tick = callback;
      return { unref() {} };
    },
    clearInterval: () => {},
  });
  try {
    await saveVkFriends(store, { ...defaults, enabled: true });
    await assert.rejects(job.run({ scheduled: true }), /<redacted>/);
    const count = adapter.fake.calls.length;
    assert.equal((await job.run({ scheduled: true })).skipped, 'not-due');
    assert.equal(adapter.fake.calls.length, count);
    time += 20 * 60000;
    job.start();
    await tick();
    const result = await loadVkFriends(store);
    assert.equal(result.last.status, 'refused');
    assert.ok(!JSON.stringify(result).includes('fixture-user-token'));
    assert.deepEqual(events, [{ event: 'vk_friend_batch_failed' }]);
  } finally {
    await job.stop();
  }
});

test(
  'the owned friend timer starts only after port ownership and close clears it',
  { timeout: 10000 },
  async () => {
    let timers = 0;
    let cleared = 0;
    let tick;
    const clock = {
      setInterval: (callback) => {
        timers++;
        tick = callback;
        return { unref() {} };
      },
      clearInterval: () => {
        cleared++;
      },
    };
    const fixture = await friendsServer({ scheduler: true, clock });
    try {
      assert.equal(timers, 1);
      await tick();
      assert.deepEqual(fixture.effects, []);
      await saveVkFriends(fixture.store, {
        ...defaults,
        enabled: true,
        batchSize: 1,
      });
      await tick();
      assert.deepEqual(fixture.effects, [9]);
      await assert.rejects(
        friendsServer({ scheduler: true, clock, port: fixture.port })
      );
      assert.equal(timers, 1);
    } finally {
      await fixture.close();
    }
    assert.ok(cleared >= 1);
  }
);

test(
  'server shutdown cancels friend pacing before draining a held online request',
  { timeout: 10000 },
  async () => {
    let releaseOnline;
    let enterOnline;
    const held = new Promise((resolve) => {
      releaseOnline = resolve;
    });
    const entered = new Promise((resolve) => {
      enterOnline = resolve;
    });
    let onlineTick;
    let friendTick;
    let paced;
    let signal;
    const waiting = new Promise((resolve) => {
      paced = resolve;
    });
    const fixture = await friendsServer({
      scheduler: true,
      online: {
        setInterval: (callback) => {
          onlineTick = callback;
          return { unref() {} };
        },
        clearInterval: () => {},
        optionsFor: async () => ({ token: 'fixture-user-token' }),
        resolve: () => ({
          live: {
            setOnline: async () => {
              enterOnline();
              await held;
              return { confirmed: true };
            },
          },
        }),
      },
      clock: {
        setInterval: (callback) => {
          friendTick = callback;
          return { unref() {} };
        },
        clearInterval: () => {},
        sleep: async (_ms, ownedSignal) => {
          signal = ownedSignal;
          paced();
          await new Promise((resolve) =>
            signal.addEventListener('abort', resolve, { once: true })
          );
        },
      },
    });
    let closing;
    let onlineRun;
    let friendRun;
    try {
      await saveVkOnline(fixture.store, { enabled: true, everyMinutes: 14 });
      await saveVkFriends(fixture.store, { ...defaults, enabled: true });
      onlineRun = onlineTick();
      await entered;
      friendRun = friendTick();
      await waiting;
      closing = fixture.close();
      assert.equal(
        signal.aborted,
        true,
        'closing must cancel every job before awaiting another job'
      );
      assert.deepEqual(fixture.effects, [9]);
    } finally {
      releaseOnline();
      await (closing ?? fixture.close());
      await Promise.allSettled([onlineRun, friendRun]);
    }
  }
);
