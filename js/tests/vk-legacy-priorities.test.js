import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createDoubletsStore } from '../src/storage/doublets-store.js';
import {
  VK_FRIENDS_JOB,
  readVkFriendSettings,
  normalizeVkFriendSettings,
} from '../src/automation/vk-friends-settings.js';
import {
  maintenanceKinds,
  maintenanceKeys,
  readVkMaintenanceSettings,
  normalizeVkMaintenance,
} from '../src/automation/vk-maintenance-settings.js';
import { createVkMaintenanceJob } from '../src/automation/vk-maintenance.js';
import { createVkPersonalSettings } from '../src/automation/vk-personal-settings.js';
import { vkGreetSettings } from '../src/automation/vk-greet-settings.js';
import { vkBirthdaySettings } from '../src/automation/vk-birthday-settings.js';
import { wallPolicy } from '../src/automation/vk-wall-settings.js';
import { vkReengageSettings } from '../src/automation/vk-reengage-settings.js';
import { discoveryPolicies } from '../src/automation/vk-discovery-settings.js';
import { readVkCancelledSettings } from '../src/automation/vk-cancelled-settings.js';
import { maintenanceAdapter } from '../../experiments/issue-56/vk-maintenance-fixture.mjs';

const policies = [
  {
    id: VK_FRIENDS_JOB,
    read: readVkFriendSettings,
    normalize: normalizeVkFriendSettings,
  },
  ...maintenanceKinds.map((kind) => ({
    id: maintenanceKeys(kind).job,
    read: (store) => readVkMaintenanceSettings(store, kind),
    normalize: normalizeVkMaintenance,
  })),
  ...[
    vkGreetSettings,
    vkBirthdaySettings,
    wallPolicy,
    ...Object.values(vkReengageSettings),
    ...Object.values(discoveryPolicies),
  ].map((policy) => ({
    id: policy.keys.job,
    read: policy.settings,
    normalize: policy.normalize,
  })),
];
const legacy = [
  [undefined, []],
  [null, []],
  ['', []],
  [{}, []],
  [7, [7]],
  [
    [7, 8, 7],
    [7, 8],
  ],
];

test(
  'legacy priority shapes normalize on every persisted policy read without editing records',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const policy of policies) {
      const defaults = await policy.read(store);
      for (const [priorityIds, expected] of legacy) {
        await store.put({ id: policy.id, ...defaults, priorityIds });
        const before = await store.get(policy.id);
        assert.deepEqual(
          (await policy.read(store)).priorityIds,
          expected,
          policy.id
        );
        assert.deepEqual(
          await store.get(policy.id),
          before,
          'read rewrote saved policy'
        );
      }
    }
    const cancelled = await readVkCancelledSettings(store);
    await store.put({
      id: 'provider-job:vk:cancelled',
      ...cancelled,
      priorityIds: {},
    });
    assert.deepEqual((await readVkCancelledSettings(store)).priorityIds, []);
  }
);

test(
  'new settings remain strict and malformed persisted priorities never lose protection silently',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const policy of policies) {
      const defaults = await policy.read(store);
      for (const [priorityIds] of legacy.slice(0, 5)) {
        assert.throws(
          () => policy.normalize({ ...defaults, priorityIds }),
          /priority/i
        );
      }
      for (const priorityIds of [
        '7',
        0,
        -1,
        [7, '8'],
        { protected: 7 },
        { 7: null },
      ]) {
        await store.put({ id: policy.id, ...defaults, priorityIds });
        await assert.rejects(policy.read(store), /priority/i);
      }
    }
  }
);

test(
  'personal-policy save rejects legacy shapes before acknowledging any write',
  { timeout: 5000 },
  async () => {
    const policy = createVkPersonalSettings('finite-legacy-fixture', {
      fields: {},
      textFields: {},
      booleans: [],
      defaults: { enabled: false, priorityIds: [] },
      validate() {},
    });
    const store = createMemoryStore();
    let writes = 0;
    const put = store.put.bind(store);
    store.put = (...args) => {
      writes++;
      return put(...args);
    };
    for (const [priorityIds] of legacy.slice(0, 5)) {
      await assert.rejects(
        policy.save(store, { enabled: false, priorityIds }),
        /priority/i
      );
    }
    assert.equal(writes, 0);
    await policy.save(store, { enabled: false, priorityIds: [7] });
    assert.equal(writes, 1);
  }
);

test(
  'cleanup and outgoing guards accept legacy empty policies and preserve singleton priorities',
  { timeout: 5000 },
  async () => {
    for (const [kind, protectedId, legacyPriority] of [
      ['cleanup', 8, null],
      ['outgoing', 12, {}],
    ]) {
      const store = createMemoryStore();
      const adapter = maintenanceAdapter();
      const defaults = await readVkMaintenanceSettings(store, kind);
      await store.put({
        id: maintenanceKeys(kind).job,
        ...defaults,
        priorityIds: legacyPriority,
        limit: 1,
      });
      const friends = await readVkFriendSettings(store);
      await store.put({
        id: VK_FRIENDS_JOB,
        ...friends,
        priorityIds: protectedId,
      });
      const job = createVkMaintenanceJob({
        store,
        kind,
        resolve: () => ({ live: adapter.live }),
        optionsFor: async () => ({ token: 'fixture-user-token' }),
        sleep: async () => {},
      });
      try {
        const plan = (await job.preview()).plan;
        assert.equal(
          plan.items.find((row) => row.userId === protectedId).reason,
          'protected'
        );
        assert.deepEqual(adapter.effects, []);
        await job.run({ planId: plan.planId, confirm: true });
        assert.equal(adapter.effects.includes(protectedId), false);
        assert.equal(adapter.effects.length, kind === 'cleanup' ? 1 : 0);
      } finally {
        await job.stop();
      }
    }
  }
);

test(
  'legacy priority normalization survives text and binary Lino reopen',
  { timeout: 5000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-legacy-priority-'));
    try {
      for (const [make, suffix] of [
        [createLinoTextStore, 'lino'],
        [createDoubletsStore, 'bin'],
      ]) {
        const file = join(dir, `state.${suffix}`);
        let store = await make(file);
        try {
          for (const policy of policies) {
            await store.put({
              id: policy.id,
              ...(await policy.read(store)),
              priorityIds: null,
            });
          }
        } finally {
          await store.flush();
          await store.close?.();
        }
        store = await make(file);
        try {
          for (const policy of policies) {
            assert.deepEqual((await policy.read(store)).priorityIds, []);
          }
        } finally {
          await store.close?.();
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);
