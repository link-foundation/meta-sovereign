import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import {
  discoveryKinds,
  discoveryPolicies,
} from '../src/automation/vk-discovery-settings.js';
import { discoveryQuotaId } from '../src/automation/vk-discovery-quota.js';
import { friendLedgerId } from '../src/automation/vk-friends-records.js';
import {
  protectedVkFriends,
  readVkMaintenanceSettings,
  saveVkMaintenance,
} from '../src/automation/vk-maintenance-settings.js';
import {
  withDiscovery,
  discoveryAdapter,
  discoveryJob,
  runDiscovery,
  seedDiscovery,
  discoveryProfile,
} from '../../experiments/issue-56/vk-discovery-fixture.mjs';
test('discovery policies start independently disabled and reject unsafe bounds', async () => {
  const store = createMemoryStore();
  for (const kind of discoveryKinds) {
    const policy = discoveryPolicies[kind];
    const defaults = await policy.settings(store);
    assert.equal(defaults.enabled, false);
    for (const changed of [
      { enabled: 'true' },
      { limit: -1 },
      { scanLimit: 0 },
      { priorityIds: [0] },
    ]) {
      await assert.rejects(policy.save(store, { ...defaults, ...changed }));
    }
    await withDiscovery(
      async ({ job, adapter }) => {
        await runDiscovery(job);
        assert.equal(adapter.effects.length, 0);
      },
      { kind, settings: { limit: 0 } }
    );
  }
  await assert.rejects(
    discoveryPolicies.community.save(store, {
      ...(await discoveryPolicies.community.settings(store)),
      enabled: true,
    })
  );
  await seedDiscovery(store, 'suggestions', { priorityIds: [11] });
  assert.ok(
    (await protectedVkFriends(store, { priorityIds: [] })).includes(11)
  );
  assert.equal(
    (await discoveryPolicies.community.settings(store)).enabled,
    false
  );
});
test('best reviewed suggestions rank mutual friends with stable ties and positive native receipts', async () => {
  const pauses = [];
  await withDiscovery(
    async ({ store, adapter, job }) => {
      const { plan } = await job.preview();
      assert.deepEqual(
        plan.items.map((item) => [item.userId, item.mutualCount]),
        [
          [11, 9],
          [13, 9],
          [7, 3],
        ]
      );
      assert.equal(adapter.effects.length, 0);
      await assert.rejects(job.run({ planId: plan.planId }), /Confirm/);
      const result = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(result.last.status, 'confirmed');
      assert.deepEqual(
        adapter.effects.map((e) => e.id),
        [11, 13]
      );
      assert.deepEqual(pauses, [3000]);
      assert.equal((await store.get(friendLedgerId(1, 11))).receipt, 1);
      assert.equal(
        (await store.get(discoveryQuotaId(1, '2026-11-15'))).reservations
          .length,
        2
      );
      assert.equal(
        adapter.fake.calls.filter((c) => c.name === 'friends.getMutual')[0]
          .params.target_uids,
        '7,13,11'
      );
      assert.equal(
        (await job.preview()).plan.items.find((item) => item.userId === 11),
        undefined
      );
    },
    {
      settings: { limit: 2 },
      options: { sleep: async (ms) => pauses.push(ms) },
    }
  );
});
test('community discovery uses explicit finite windows, owner filters, capacity and protected IDs', async () => {
  await withDiscovery(
    async ({ job, adapter, store }) => {
      await saveVkMaintenance(store, 'cleanup', {
        ...(await readVkMaintenanceSettings(store, 'cleanup')),
        priorityIds: [7],
      });
      const { plan } = await job.preview();
      assert.deepEqual(
        plan.items.map((item) => [item.userId, item.reason]),
        [
          [7, 'protected'],
          [11, 'eligible'],
          [15, 'filtered'],
        ]
      );
      await job.run({ planId: plan.planId, confirm: true });
      assert.deepEqual(adapter.effects, [{ kind: 'add', id: 11 }]);
      const calls = adapter.fake.calls.filter(
        (c) => c.name === 'groups.getMembers'
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].params.group_id, '55');
      assert.equal(calls[0].params.sort, 'id_asc');
    },
    { kind: 'community', settings: { limit: 3 } }
  );
  await withDiscovery(
    async ({ job, adapter }) => {
      const { plan } = await job.preview();
      assert.deepEqual(
        plan.items.map((item) => item.userId),
        [11]
      );
      assert.equal(plan.total, 3);
      assert.equal(plan.complete, false);
      await runDiscovery(job);
      assert.equal(adapter.effects.length, 1);
    },
    { kind: 'community', settings: { offset: 1, scanLimit: 1 } }
  );
  await withDiscovery(
    async ({ job, adapter }) => {
      await runDiscovery(job);
      assert.equal(adapter.effects.length, 0);
    },
    { settings: { maxFriends: 2 } }
  );
});
test('only currently deactivated incoming requests are rejected with the correct native flag and pacing', async () => {
  const pauses = [];
  await withDiscovery(
    async ({ job, adapter }) => {
      const { plan } = await job.preview();
      assert.deepEqual(
        plan.items.map((item) => [item.userId, item.reason]),
        [
          [21, 'eligible'],
          [22, 'eligible'],
          [23, 'active'],
        ]
      );
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'confirmed'
      );
      assert.deepEqual(adapter.effects, [
        { kind: 'delete', id: 21 },
        { kind: 'delete', id: 22 },
      ]);
      assert.equal(adapter.relations.get(23), 2);
      assert.deepEqual(pauses, [10000]);
      assert.equal(
        adapter.fake.calls.filter((c) => c.name === 'friends.getRequests')[0]
          .params.out,
        '0'
      );
    },
    {
      kind: 'rejections',
      settings: { limit: 3 },
      options: { sleep: async (ms) => pauses.push(ms) },
    }
  );
});
test('discovery native scans reject malformed, duplicate, incomplete or inconsistent provider receipts', async () => {
  for (const method of [
    'friends.getSuggestions',
    'groups.getMembers',
    'friends.getRequests',
  ]) {
    const kind = {
      'friends.getSuggestions': 'suggestions',
      'groups.getMembers': 'community',
      'friends.getRequests': 'rejections',
    }[method];
    for (const reply of [
      { count: 2, items: [] },
      {
        count: 2,
        items: kind === 'suggestions' ? [{ id: 7 }, { id: 7 }] : [7, 7],
      },
      { count: -1, items: [] },
    ]) {
      const adapter = discoveryAdapter({ methods: { [method]: () => reply } });
      await withDiscovery(
        async ({ job }) => {
          await assert.rejects(job.preview(), /Incomplete/);
          assert.equal(adapter.effects.length, 0);
        },
        { kind, adapter }
      );
    }
  }
  for (const method of ['users.get', 'friends.getMutual']) {
    const adapter = discoveryAdapter({ methods: { [method]: () => [] } });
    await withDiscovery(
      async ({ job }) => {
        await assert.rejects(job.preview(), /Incomplete/);
      },
      { adapter }
    );
  }
});
test(
  'uncertain discovery effects survive causal reopen and block another friendship policy',
  { timeout: 15000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vk-discovery-'));
    const open = async () =>
      withCausalWrites(
        await createLinoTextStore(join(directory, 'state.lino'))
      );
    const adapter = discoveryAdapter();
    adapter.mode('unknown');
    let store = await open();
    let job;
    try {
      await seedDiscovery(store, 'suggestions');
      job = discoveryJob(store, adapter);
      assert.equal((await runDiscovery(job)).last.status, 'unknown');
      await job.stop();
      await store.close();
      store = await open();
      await seedDiscovery(store, 'community');
      job = discoveryJob(store, adapter, 'community');
      const { plan } = await job.preview();
      assert.equal(
        plan.items.find((item) => item.userId === 11).reason,
        'unknown'
      );
      adapter.mode('confirmed');
      await job.run({ planId: plan.planId, confirm: true });
      assert.equal(
        adapter.effects.filter((effect) => effect.id === 11).length,
        1
      );
      assert.equal((await store.get(friendLedgerId(1, 11))).status, 'unknown');
    } finally {
      await job?.stop();
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
test('daily reservations and provider pauses survive restart and do not replenish on repeated review', async () => {
  const store = createMemoryStore();
  await store.put({
    id: discoveryQuotaId(1, '2026-11-15'),
    reservations: Array.from({ length: 40 }, (_, i) => `old:${i}`),
  });
  await withDiscovery(
    async ({ job, adapter }) => {
      await runDiscovery(job);
      assert.equal(adapter.effects.length, 0);
    },
    { store }
  );
  const adapter = discoveryAdapter({ response: () => 8 });
  let now = Date.UTC(2026, 10, 15, 12);
  await seedDiscovery(store, 'community');
  const otherStore = createMemoryStore();
  await seedDiscovery(otherStore, 'community');
  let job = discoveryJob(otherStore, adapter, 'community', { now: () => now });
  try {
    assert.equal((await runDiscovery(job)).last.status, 'refused');
    await job.stop();
    job = discoveryJob(otherStore, adapter, 'community', { now: () => now });
    assert.ok(
      (await job.preview()).plan.items.every((item) => item.reason === 'paused')
    );
    await runDiscovery(job);
    assert.equal(adapter.effects.length, 1);
    now += 24 * 3600000 + 1;
    assert.equal((await job.preview()).plan.items[0].reason, 'eligible');
  } finally {
    await job.stop();
  }
});
test('finite deactivated-request pagination inspects every configured page without authorizing unseen IDs', async () => {
  const ids = Array.from({ length: 1003 }, (_, i) => i + 100);
  const adapter = discoveryAdapter({
    methods: {
      'friends.getRequests': (p) => ({
        count: ids.length,
        items: ids.slice(Number(p.offset), Number(p.offset) + Number(p.count)),
      }),
    },
  });
  for (const id of ids) {
    adapter.profiles.set(id, discoveryProfile(id, { deactivated: 'banned' }));
    adapter.relations.set(id, 2);
  }
  await withDiscovery(
    async ({ job }) => {
      const { plan } = await job.preview();
      assert.equal(plan.items.length, 1002);
      assert.equal(plan.total, 1003);
      assert.equal(plan.complete, false);
      const pages = adapter.fake.calls.filter(
        (c) => c.name === 'friends.getRequests'
      );
      assert.deepEqual(
        pages.map((c) => [c.params.offset, c.params.count]),
        [
          ['0', '1000'],
          ['1000', '2'],
        ]
      );
      assert.equal(adapter.effects.length, 0);
    },
    { kind: 'rejections', adapter, settings: { scanLimit: 1002, limit: 0 } }
  );
});
