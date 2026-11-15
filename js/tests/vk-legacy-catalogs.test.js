import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createDoubletsStore } from '../src/storage/doublets-store.js';
import { wallPolicy } from '../src/automation/vk-wall-settings.js';
import { vkBirthdaySettings } from '../src/automation/vk-birthday-settings.js';
import { vkReengageSettings } from '../src/automation/vk-reengage-settings.js';
import { retentionPolicy } from '../src/automation/vk-retention-settings.js';
import {
  birthdayAdapter,
  birthdayJob,
} from '../../experiments/issue-56/vk-birthday-fixture.mjs';

const cases = [
  [wallPolicy, 'communities', [42, 43], '42,43'],
  [wallPolicy, 'restrictedCommunities', 42, '42'],
  [wallPolicy, 'attachments', ['photo1_2', 'audio-2_3'], 'photo1_2,audio-2_3'],
  [
    wallPolicy,
    'messages',
    ['Add me as a friend: owner A', 'Add me as a friend: owner B'],
    'Add me as a friend: owner A\nAdd me as a friend: owner B',
  ],
  [
    vkBirthdaySettings,
    'messages',
    ['Owner birthday wishes'],
    'Owner birthday wishes',
  ],
  [vkBirthdaySettings, 'stickers', 60302, '60302'],
  [vkBirthdaySettings, 'attachments', ['photo1_2'], 'photo1_2'],
  ...Object.values(vkReengageSettings).map((policy) => [
    policy,
    'questions',
    ['Owner question?', 'Another question?'],
    'Owner question?\nAnother question?',
  ]),
  [retentionPolicy, 'peers', [-42, 7], '-42,7'],
];
const put = async (store, policy, patch) =>
  store.put({
    id: policy.keys.job,
    ...(await policy.settings(createMemoryStore())),
    ...patch,
  });

test(
  'persisted VK catalogs and destinations normalize without rewriting owner records',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const [policy, key, value, expected] of cases) {
      await put(store, policy, { [key]: value });
      const before = await store.get(policy.keys.job);
      assert.equal((await policy.settings(store))[key], expected, key);
      assert.deepEqual(await store.get(policy.keys.job), before);
      await store.delete(policy.keys.job);
    }
  }
);

test(
  'empty legacy optional lists stay empty and partial settings retain defaults and owner false/zero',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const [policy, key] of cases.filter(
      ([, key]) => !['messages', 'questions'].includes(key)
    )) {
      for (const value of [null, {}, [], '']) {
        await put(store, policy, { [key]: value });
        assert.equal((await policy.settings(store))[key], '');
        await store.delete(policy.keys.job);
      }
    }
    await store.put({
      id: vkBirthdaySettings.keys.job,
      limit: 0,
      onlineOnly: false,
    });
    const result = await vkBirthdaySettings.settings(store);
    assert.equal(result.limit, 0);
    assert.equal(result.onlineOnly, false);
    assert.equal(result.enabled, false);
    assert.ok(result.messages.includes('Happy birthday!'));
  }
);

test(
  'malformed list records refuse and new catalog writes remain strict before acknowledgement',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const [policy, key, value] of cases) {
      const defaults = await policy.settings(createMemoryStore());
      let writes = 0;
      const strictStore = { ...store, put: async () => writes++ };
      await assert.rejects(
        policy.save(strictStore, { ...defaults, [key]: value })
      );
      assert.equal(writes, 0);
      for (const invalid of [
        { private_fixture: 42 },
        [true],
        [null],
        [{ private_fixture: 42 }],
      ]) {
        await put(store, policy, { [key]: invalid });
        await assert.rejects(policy.settings(store), (error) => {
          assert.equal(error.message.includes('private_fixture'), false);
          return true;
        });
        await store.delete(policy.keys.job);
      }
    }
  }
);

test(
  'persisted legacy normalization retains existing catalog and destination domain refusals',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    for (const [policy, patch] of [
      [wallPolicy, { communities: [-42] }],
      [wallPolicy, { communities: {}, enabled: true }],
      [wallPolicy, { messages: ['Missing required marker'] }],
      [vkBirthdaySettings, { stickers: [0] }],
      [
        vkBirthdaySettings,
        { attachments: ['https://example.invalid/private_fixture'] },
      ],
      [vkBirthdaySettings, { messages: {}, stickers: {}, attachments: {} }],
      [retentionPolicy, { peers: [0] }],
    ]) {
      await put(store, policy, patch);
      await assert.rejects(policy.settings(store));
      await store.delete(policy.keys.job);
    }
  }
);

test(
  'actual reviewed birthday delivery retains a legacy owner catalog and scalar sticker',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await put(store, vkBirthdaySettings, {
      messages: ['Owner legacy birthday wishes'],
      stickers: 60302,
      attachments: ['photo1_2'],
      priorityIds: {},
      limit: 1,
    });
    const before = await store.get(vkBirthdaySettings.keys.job);
    const adapter = birthdayAdapter();
    const job = birthdayJob(store, adapter);
    try {
      const { plan } = await job.preview();
      assert.equal(plan.items[0].reason, 'eligible');
      assert.equal(plan.items[0].steps[0].sticker, 60302);
      assert.equal(plan.items[0].steps[1].text, 'Owner legacy birthday wishes');
      assert.deepEqual(adapter.effects, []);
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'confirmed'
      );
      assert.equal(adapter.effects[1].text, 'Owner legacy birthday wishes');
      assert.equal(adapter.effects[1].audio, 'photo1_2');
      assert.deepEqual(await store.get(vkBirthdaySettings.keys.job), before);
    } finally {
      await job.stop();
    }
  }
);

test(
  'owner legacy catalogs survive actual text and binary Lino flush and reopen',
  { timeout: 5000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-legacy-catalogs-'));
    try {
      for (const [make, name] of [
        [createLinoTextStore, 'text'],
        [createDoubletsStore, 'binary'],
      ]) {
        const file = join(dir, name);
        let store = await make(file);
        await put(store, wallPolicy, {
          communities: [42, 43],
          attachments: {},
          messages: ['Add me as a friend: owner legacy'],
        });
        await store.flush();
        await store.close?.();
        store = await make(file);
        try {
          const result = await wallPolicy.settings(store);
          assert.equal(result.communities, '42,43');
          assert.equal(result.attachments, '');
          assert.equal(result.messages, 'Add me as a friend: owner legacy');
        } finally {
          await store.close?.();
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);
