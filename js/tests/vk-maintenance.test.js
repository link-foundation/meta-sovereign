import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import {
  createVkMaintenanceJob,
  loadVkMaintenance,
  saveVkMaintenance,
} from '../src/automation/vk-maintenance.js';
import {
  saveVkFriends,
  createVkFriendsJob,
} from '../src/automation/vk-friends.js';
import { createVkMaintenanceApi } from '../src/web/vk-maintenance-api.js';
import { dictionaries } from '../src/web/locales/index.js';
import { runCli } from '../src/cli/index.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import {
  maintenanceAdapter,
  maintenanceServer,
} from '../../experiments/issue-56/vk-maintenance-fixture.mjs';

const defaults = (kind) => ({
  enabled: false,
  everyMinutes: kind === 'cleanup' ? 30 : 8,
  limit: kind === 'cleanup' ? 10000 : 20,
  priorityIds: [],
});
const jobFor = (store, adapter, kind = 'cleanup', extra = {}) =>
  createVkMaintenanceJob({
    store,
    kind,
    resolve: () => ({ live: adapter.live }),
    optionsFor: async () => ({ token: 'fixture-user-token' }),
    sleep: async () => {},
    ...extra,
  });
const apply = async (job) =>
  job.run({ planId: (await job.preview()).plan.planId, confirm: true });

test('VK actual adapter exposes bounded maintenance scans and specific deletion receipts', async () => {
  const adapter = maintenanceAdapter();
  assert.equal(typeof adapter.live.maintenanceSnapshot, 'function');
  const options = { token: 'fixture-user-token', limit: 2 };
  const cleanup = await adapter.live.maintenanceSnapshot('cleanup', options);
  assert.deepEqual(
    cleanup.items.map((row) => row.userId),
    [8, 9, 10, 11]
  );
  const outgoing = await adapter.live.maintenanceSnapshot('outgoing', options);
  assert.deepEqual(
    outgoing.items.map((row) => row.userId),
    [12, 13]
  );
  const request = adapter.fake.calls.find(
    (row) => row.name === 'friends.getRequests'
  );
  assert.equal(request.params.out, '1');
  assert.equal(request.params.need_viewed, '1');
  let guarded = false;
  assert.equal(
    (
      await adapter.live.removeFriend(8, 'cleanup', options, async () => {
        guarded = true;
      })
    ).outcome,
    'removed'
  );
  assert.ok(guarded);
  assert.equal(
    (await adapter.live.removeFriend(12, 'outgoing', options)).outcome,
    'cancelled'
  );
  // The other deletion subtype cannot acknowledge the reviewed action.
  await assert.rejects(adapter.live.removeFriend(13, 'cleanup', options), {
    code: 'unconfirmed',
  });
  adapter.mode('unconfirmed');
  await assert.rejects(adapter.live.removeFriend(9, 'cleanup', options), {
    code: 'unconfirmed',
  });
});

test('cleanup retains active and all configured priority friends, with a bounded deletion limit', async () => {
  const store = createMemoryStore();
  const adapter = maintenanceAdapter();
  const paced = [];
  await saveVkFriends(store, {
    enabled: false,
    everyMinutes: 20,
    maxFriends: 10000,
    batchSize: 23,
    priorityIds: [8],
  });
  const job = jobFor(store, adapter, 'cleanup', {
    sleep: async (ms) => paced.push(ms),
  });
  try {
    assert.deepEqual(
      (await loadVkMaintenance(store, 'cleanup')).settings,
      defaults('cleanup')
    );
    assert.equal((await job.run({ scheduled: true })).skipped, 'not-due');
    assert.equal(adapter.fake.calls.length, 0);
    await saveVkMaintenance(store, 'cleanup', {
      ...defaults('cleanup'),
      limit: 1,
    });
    const plan = (await job.preview()).plan;
    assert.deepEqual(
      plan.items.map((row) => [row.userId, row.reason]),
      [
        [8, 'protected'],
        [9, 'eligible'],
        [10, 'active'],
        [11, 'limitReached'],
      ]
    );
    assert.equal(adapter.effects.length, 0);
    await assert.rejects(
      job.run({ planId: plan.planId, confirm: false }),
      /Confirm/
    );
    const answer = await job.run({ planId: plan.planId, confirm: true });
    assert.equal(answer.last.results[0].outcome, 'removed');
    assert.deepEqual(adapter.effects, [9]);
    await assert.rejects(
      job.run({ planId: plan.planId, confirm: true }),
      /current reviewed/
    );
    await saveVkMaintenance(store, 'cleanup', {
      ...defaults('cleanup'),
      priorityIds: [8],
    });
    await apply(job);
    assert.deepEqual(adapter.effects, [9, 11]);
    adapter.relations.set(11, 3);
    await apply(job);
    // Confirmed but not yet observed absent; no replay from a stale list.
    assert.deepEqual(adapter.effects, [9, 11]);
    assert.deepEqual(paced, []);
  } finally {
    await job.stop();
  }
});

test('outgoing scan limit includes skipped priorities, supports zero and preserves three-second pacing', async () => {
  const store = createMemoryStore();
  const adapter = maintenanceAdapter();
  const paced = [];
  const job = jobFor(store, adapter, 'outgoing', {
    sleep: async (ms) => paced.push(ms),
  });
  try {
    await saveVkMaintenance(store, 'outgoing', {
      ...defaults('outgoing'),
      limit: 2,
      priorityIds: [12],
    });
    assert.deepEqual(
      (await job.preview()).plan.items.map((row) => row.reason),
      ['protected', 'eligible']
    );
    await apply(job);
    assert.deepEqual(adapter.effects, [13]);
    await saveVkMaintenance(store, 'outgoing', {
      ...defaults('outgoing'),
      limit: 0,
    });
    assert.deepEqual((await apply(job)).last.results, []);
    adapter.relations.set(13, 0);
    await job.preview();
    await saveVkMaintenance(store, 'outgoing', defaults('outgoing'));
    await apply(job);
    assert.deepEqual(adapter.effects, [13, 12, 14]);
    assert.deepEqual(paced, [3000]);
  } finally {
    await job.stop();
  }
});

test('fresh account, relationship, activation, priority, credential, policy and expiry changes refuse deletion', async () => {
  for (const change of [
    'account',
    'relation',
    'active',
    'deactivation',
    'priority',
    'otherPriority',
    'token',
    'policy',
    'expiry',
    'clock',
  ]) {
    const store = createMemoryStore();
    const adapter = maintenanceAdapter();
    let token = 'fixture-user-token';
    let time = 1700000000000;
    const job = jobFor(store, adapter, 'cleanup', {
      now: () => time,
      optionsFor: async () => ({ token }),
    });
    try {
      const plan = (await job.preview()).plan;
      if (change === 'account') {
        adapter.account(2);
      }
      if (change === 'relation') {
        adapter.relations.set(8, 1);
      }
      if (change === 'active') {
        adapter.users.set(8, null);
      }
      if (change === 'deactivation') {
        adapter.users.set(8, 'deleted');
      }
      if (change === 'priority') {
        await saveVkFriends(store, {
          enabled: false,
          everyMinutes: 20,
          maxFriends: 10000,
          batchSize: 23,
          priorityIds: [8],
        });
      }
      if (change === 'otherPriority') {
        await saveVkMaintenance(store, 'outgoing', {
          ...defaults('outgoing'),
          priorityIds: [8],
        });
      }
      if (change === 'token') {
        token = 'changed-fixture-token';
      }
      if (change === 'policy') {
        await saveVkMaintenance(store, 'cleanup', {
          ...defaults('cleanup'),
          limit: 1,
        });
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
      assert.deepEqual(adapter.effects, [], change);
    } finally {
      await job.stop();
    }
  }
});

test('late policy checks occur after the actual adapter limiter and durable intent acknowledgement', async () => {
  for (const boundary of ['limiter', 'intent']) {
    const store = createMemoryStore();
    let changed = false;
    let armed = false;
    const change = async () => {
      if (!changed) {
        changed = true;
        await saveVkMaintenance(store, 'cleanup', {
          ...defaults('cleanup'),
          priorityIds: [8],
        });
      }
    };
    const adapter = maintenanceAdapter({
      live: {
        limiter: {
          wait: async () => {
            if (armed && boundary === 'limiter') {
              await change();
            }
          },
        },
      },
    });
    if (boundary === 'intent') {
      const put = store.put.bind(store);
      store.put = async (row) => {
        await put(row);
        if (row.id === 'provider-friend:vk:1:8' && row.status === 'pending') {
          await change();
        }
      };
    }
    const job = jobFor(store, adapter);
    try {
      const plan = (await job.preview()).plan;
      armed = true;
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'refused'
      );
      assert.deepEqual(adapter.effects, []);
    } finally {
      await job.stop();
    }
  }
});

test('definite refusal is not retried and missing/transport acknowledgements remain unknown', async () => {
  for (const mode of ['refused', 'unknown', 'unconfirmed']) {
    const store = createMemoryStore();
    const adapter = maintenanceAdapter();
    adapter.mode(mode);
    const job = jobFor(store, adapter);
    try {
      assert.equal(
        (await apply(job)).last.status,
        mode === 'refused' ? 'refused' : 'unknown'
      );
      assert.deepEqual(adapter.effects, [8]);
      if (mode !== 'refused') {
        assert.equal((await job.preview()).plan.items[0].reason, 'unknown');
        await apply(job);
        assert.equal(adapter.effects.filter((id) => id === 8).length, 1);
      }
    } finally {
      await job.stop();
    }
  }
});

test('failed intent acknowledgement prevents effects and failed outcome acknowledgement leaves unknown through Lino reopen', async () => {
  for (const boundary of ['intent', 'outcome']) {
    const dir = await mkdtemp(join(tmpdir(), 'vk-maintenance-'));
    let store = await createLinoTextStore(join(dir, 'links.lino'));
    const adapter = maintenanceAdapter();
    let failed = false;
    const job = jobFor(store, adapter);
    try {
      const plan = (await job.preview()).plan;
      const original = store.flush.bind(store);
      store.flush = async () => {
        const row = await store.get('provider-friend:vk:1:8');
        if (
          !failed &&
          row?.status === (boundary === 'intent' ? 'pending' : 'confirmed')
        ) {
          failed = true;
          throw new Error('acknowledgement refused');
        }
        return original();
      };
      await job.run({ planId: plan.planId, confirm: true }).catch(() => {});
      assert.deepEqual(adapter.effects, boundary === 'intent' ? [] : [8]);
      await job.stop();
      await store.close();
      store = await createLinoTextStore(join(dir, 'links.lino'));
      const restored = await store.get('provider-friend:vk:1:8');
      assert.equal(
        restored?.status,
        boundary === 'intent' ? 'refused' : 'pending'
      );
      if (boundary === 'outcome') {
        adapter.relations.set(8, 3); // Stale provider list must not replay the lost receipt.
        const next = jobFor(store, adapter);
        try {
          assert.equal((await next.preview()).plan.items[0].reason, 'unknown');
        } finally {
          await next.stop();
        }
      }
    } finally {
      await job.stop();
      await store.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test('owned pacing stops after confirmed progress and coalesces overlapping manual batches', async () => {
  const store = createMemoryStore();
  const adapter = maintenanceAdapter();
  let entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const delays = [];
  const job = jobFor(store, adapter, 'cleanup', {
    sleep: async (ms, signal) => {
      delays.push(ms);
      entered();
      await new Promise((resolve) =>
        signal.addEventListener('abort', resolve, { once: true })
      );
    },
  });
  try {
    const plan = (await job.preview()).plan;
    const run = job.run({ planId: plan.planId, confirm: true });
    assert.equal(job.run({ planId: plan.planId, confirm: true }), run);
    await waiting;
    await job.stop();
    await run;
    assert.deepEqual(delays, [5000]);
    assert.deepEqual(adapter.effects, [8]);
    assert.equal(
      (await loadVkMaintenance(store, 'cleanup')).last.results[0].status,
      'confirmed'
    );
  } finally {
    await job.stop();
  }
});

test('shared relationship ledger prevents acceptance from replaying an uncertain cancellation', async () => {
  const store = createMemoryStore();
  const adapter = maintenanceAdapter();
  adapter.mode('unknown');
  const outgoing = jobFor(store, adapter, 'outgoing');
  const incoming = createVkFriendsJob({
    store,
    resolve: () => ({ live: adapter.live }),
    optionsFor: async () => ({ token: 'fixture-user-token' }),
  });
  try {
    await apply(outgoing);
    adapter.relations.set(12, 2);
    assert.equal((await incoming.preview()).plan.items[0].reason, 'unknown');
    assert.deepEqual(adapter.effects, [12]);
  } finally {
    await Promise.all([outgoing.stop(), incoming.stop()]);
  }
});

test('independent scheduling survives restart and throttles failed reads at saved intervals', async () => {
  const store = createMemoryStore();
  let time = 1700000000000;
  const adapter = maintenanceAdapter();
  await saveVkMaintenance(store, 'outgoing', {
    ...defaults('outgoing'),
    enabled: true,
    limit: 1,
  });
  let tick;
  let cleared = false;
  const job = jobFor(store, adapter, 'outgoing', {
    now: () => time,
    setInterval: (callback) => {
      tick = callback;
      return { unref() {} };
    },
    clearInterval: () => {
      cleared = true;
    },
  });
  try {
    job.start();
    await tick();
    assert.deepEqual(adapter.effects, [12]);
    assert.equal(
      (await loadVkMaintenance(store, 'cleanup')).settings.enabled,
      false
    );
  } finally {
    await job.stop();
  }
  assert.ok(cleared);
  const restored = jobFor(store, adapter, 'outgoing', { now: () => time });
  try {
    assert.equal((await restored.run({ scheduled: true })).skipped, 'not-due');
    time += 8 * 60000;
    await restored.run({ scheduled: true });
    assert.deepEqual(adapter.effects, [12, 13]);
  } finally {
    await restored.stop();
  }
  await saveVkMaintenance(store, 'cleanup', {
    ...defaults('cleanup'),
    enabled: true,
  });
  let reads = 0;
  const failing = maintenanceAdapter({
    methods: {
      'users.get': () => {
        reads++;
        throw new Error('fixture-user-token private failure');
      },
    },
  });
  const failed = jobFor(store, failing, 'cleanup', { now: () => time });
  try {
    await assert.rejects(failed.run({ scheduled: true }), /<redacted>/);
    assert.equal((await failed.run({ scheduled: true })).skipped, 'not-due');
    assert.equal(reads, 1);
    assert.doesNotMatch(
      JSON.stringify(await loadVkMaintenance(store, 'cleanup')),
      /fixture-user-token/
    );
  } finally {
    await failed.stop();
  }
});

test(
  'both Lino APIs require origin/current confirmation and acknowledge independent saved choices',
  { timeout: 20000 },
  async () => {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const fixture = await maintenanceServer();
      try {
        for (const kind of ['cleanup', 'outgoing']) {
          const post = createWirePost(fixture.base, `/api/vk/${kind}`, type);
          assert.equal(
            (await post('', defaults(kind), 'https://foreign.invalid')).status,
            403
          );
          assert.equal(
            (await post('', { ...defaults(kind), limit: 1 })).status,
            200
          );
          assert.equal((await post('/run', { scheduled: true })).status, 400);
          const plan = (await post('/plan', {})).answer.plan;
          assert.equal(
            (await post('/run', { planId: plan.planId, confirm: true })).answer
              .last.status,
            'confirmed'
          );
          assert.equal(
            (await post('/run', { planId: plan.planId, confirm: true })).status,
            400
          );
          fixture.refuseWrites(true);
          assert.equal(
            (await post('', { ...defaults(kind), enabled: true })).status,
            400
          );
          assert.equal(
            (await loadVkMaintenance(fixture.store, kind)).settings.enabled,
            false
          );
          fixture.refuseWrites(false);
        }
        assert.deepEqual(fixture.effects, [8, 12]);
        assert.equal(fixture.messages(), 0);
      } finally {
        await fixture.close();
      }
    }
  }
);

test('foreground maintenance CLI uses readonly status, persisted review and owned closure', async () => {
  const { createVkMaintenanceCommands } =
    await import('../src/cli/vk-maintenance-commands.js');
  const store = createMemoryStore();
  const adapter = maintenanceAdapter();
  let reads = 0;
  let writes = 0;
  let closed = 0;
  store.close = async () => {
    closed++;
  };
  const commands = createVkMaintenanceCommands({
    openStore: async () => {
      writes++;
      return store;
    },
    openReadOnly: async () => {
      reads++;
      return store;
    },
    createJob: ({ kind }) => jobFor(store, adapter, kind),
  });
  for (const kind of ['cleanup', 'outgoing']) {
    const command = commands[`vk-${kind}`];
    let output;
    await command({ _: ['status'] }, () => {});
    await command({ _: ['save'], limit: '1', priority: '99' }, () => {});
    await command({ _: ['plan'] }, (line) => {
      output = JSON.parse(line);
    });
    await assert.rejects(
      command({ _: ['run'], plan: output.plan.planId }, () => {}),
      /Confirm/
    );
    assert.equal(
      await command(
        { _: ['run'], plan: output.plan.planId, confirm: true },
        () => {}
      ),
      0
    );
    await assert.rejects(
      runCli([`vk-${kind}`, 'wrong'], { log: () => {} }),
      /status\|save/
    );
  }
  assert.equal(reads, 2);
  assert.equal(writes, 8);
  assert.equal(closed, 10);
  assert.deepEqual(adapter.effects, [8, 12]);
});

test('offline policies remain independent and all four languages cover review and receipt states', async () => {
  const store = createMemoryStore();
  const api = createVkMaintenanceApi({
    get: async () => null,
    report: async () => null,
    local: async () => store,
  });
  assert.equal((await api.vkCleanup()).canRun, false);
  assert.equal(
    (await api.saveVkCleanup({ ...defaults('cleanup'), enabled: true }))
      .settings.enabled,
    true
  );
  assert.equal((await api.vkOutgoing()).settings.enabled, false);
  assert.equal((await api.planVkCleanup()).ok, false);
  assert.equal((await api.runVkOutgoing('missing')).ok, false);
  for (const dict of Object.values(dictionaries)) {
    for (const prefix of ['vkCleanup', 'vkOutgoing']) {
      for (const key of [
        'title',
        'hint',
        'enabled',
        'everyMinutes',
        'limit',
        'priorityIds',
        'protected',
        'active',
        'limitReached',
        'remove',
        'cancel',
        'removed',
        'cancelled',
        'unknown',
        'account',
        'plan',
        'run',
        'idle',
        'save',
        'refused',
        'confirmed',
        'unsettled',
      ]) {
        assert.equal(
          typeof dict[`${prefix}.${key}`],
          'string',
          `${prefix}.${key}`
        );
      }
    }
  }
  for (const patch of [
    { limit: -1 },
    { limit: 10001 },
    { everyMinutes: 0 },
    { enabled: 'true' },
    { priorityIds: [0] },
  ]) {
    await assert.rejects(
      saveVkMaintenance(store, 'cleanup', { ...defaults('cleanup'), ...patch })
    );
  }
});

test('incomplete provider pages, duplicate IDs and invalid fresh states never authorize deletion', async () => {
  for (const reply of [
    { count: 2, items: [] },
    { count: -1, items: [] },
    { count: 2, items: [{ id: 8 }, { id: 8 }] },
    { count: 1, items: [8] },
    { count: 10001, items: [{ id: 8 }] },
  ]) {
    const adapter = maintenanceAdapter({
      methods: { 'friends.get': () => reply },
    });
    const job = jobFor(createMemoryStore(), adapter);
    try {
      await assert.rejects(job.preview(), /Incomplete/);
      assert.deepEqual(adapter.effects, []);
    } finally {
      await job.stop();
    }
  }
  for (const method of ['users.get', 'friends.areFriends']) {
    let changed = false;
    const adapter = maintenanceAdapter({
      methods: {
        [method]: (params) => {
          if (changed) {
            return [];
          }
          return method === 'users.get'
            ? [{ id: params.user_ids ? Number(params.user_ids) : 1 }]
            : [{ user_id: Number(params.user_ids), friend_status: 3 }];
        },
      },
    });
    const job = jobFor(createMemoryStore(), adapter);
    try {
      const plan = (await job.preview()).plan;
      changed = true;
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'refused'
      );
      assert.deepEqual(adapter.effects, []);
    } finally {
      await job.stop();
    }
  }
});

test('actual maintenance scans paginate finite pages and reject a moving count', async () => {
  for (const moving of [false, true]) {
    const adapter = maintenanceAdapter({
      methods: {
        'friends.get': (params) => ({
          count: moving && Number(params.offset) ? 3 : 2,
          items: [{ id: Number(params.offset) ? 9 : 8, deactivated: 'banned' }],
        }),
      },
    });
    const job = jobFor(createMemoryStore(), adapter);
    try {
      if (moving) {
        await assert.rejects(job.preview(), /Incomplete/);
      } else {
        assert.deepEqual(
          (await job.preview()).plan.items.map((row) => row.userId),
          [8, 9]
        );
        assert.deepEqual(
          adapter.fake.calls
            .filter((row) => row.name === 'friends.get')
            .map((row) => row.params.offset),
          ['0', '1']
        );
      }
      assert.deepEqual(adapter.effects, []);
    } finally {
      await job.stop();
    }
  }
});

test(
  'server owns both maintenance timers after port ownership and aborts pacing before drain',
  { timeout: 10000 },
  async () => {
    const ticks = [];
    let cleared = 0;
    let signal;
    let entered;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    const clock = {
      setInterval: (callback) => {
        ticks.push(callback);
        return { unref() {} };
      },
      clearInterval: () => {
        cleared++;
      },
      sleep: async (_ms, owned) => {
        signal = owned;
        entered();
        await new Promise((resolve) =>
          owned.addEventListener('abort', resolve, { once: true })
        );
      },
    };
    const fixture = await maintenanceServer({ scheduler: true, clock });
    let running;
    let closing;
    try {
      assert.equal(ticks.length, 2);
      await ticks[0]();
      assert.deepEqual(fixture.effects, []);
      await assert.rejects(
        maintenanceServer({ scheduler: true, clock, port: fixture.port })
      );
      assert.equal(ticks.length, 2);
      await saveVkMaintenance(fixture.store, 'cleanup', {
        ...defaults('cleanup'),
        enabled: true,
      });
      running = ticks[0]();
      await waiting;
      closing = fixture.close();
      assert.equal(signal.aborted, true);
      assert.deepEqual(fixture.effects, [8]);
    } finally {
      await (closing ?? fixture.close());
      await running;
    }
    assert.ok(cleared >= 2);
  }
);

test('priorities are protected across both maintenance policies and observed deletion permits a later relationship', async () => {
  const store = createMemoryStore();
  const adapter = maintenanceAdapter();
  const cleanup = jobFor(store, adapter);
  const outgoing = jobFor(store, adapter, 'outgoing');
  try {
    await saveVkMaintenance(store, 'outgoing', {
      ...defaults('outgoing'),
      priorityIds: [8],
    });
    await saveVkMaintenance(store, 'cleanup', {
      ...defaults('cleanup'),
      priorityIds: [12],
    });
    assert.equal((await cleanup.preview()).plan.items[0].reason, 'protected');
    assert.equal((await outgoing.preview()).plan.items[0].reason, 'protected');
    await saveVkMaintenance(store, 'outgoing', defaults('outgoing'));
    await saveVkMaintenance(store, 'cleanup', {
      ...defaults('cleanup'),
      limit: 1,
    });
    await apply(cleanup);
    assert.deepEqual(adapter.effects, [8]);
    await cleanup.preview();
    assert.equal((await store.get('provider-friend:vk:1:8')).settled, true);
    adapter.relations.set(8, 3);
    await apply(cleanup);
    assert.deepEqual(adapter.effects, [8, 8]);
  } finally {
    await Promise.all([cleanup.stop(), outgoing.stop()]);
  }
});
