import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import * as wallSettings from '../src/automation/vk-wall-settings.js';
import {
  vkBirthdaySettings,
  birthdayMessages,
} from '../src/automation/vk-birthday-settings.js';
import { createVkWallCommands } from '../src/cli/vk-wall-commands.js';
import { createVkBirthdayCommands } from '../src/cli/vk-birthday-commands.js';
import { createVkWallApi } from '../src/web/vk-wall-api.js';
import { createVkBirthdayApi } from '../src/web/vk-birthday-api.js';
import {
  withWallJob,
  wallServer,
} from '../../experiments/issue-56/vk-wall-fixture.mjs';
import { withBirthdayJob } from '../../experiments/issue-56/vk-birthday-fixture.mjs';
import { createWirePost } from './helpers/http-wire.mjs';
import { decodeWire, LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';

const { wallPolicy, wallMessages } = wallSettings;

const cases = [
  ['wall', wallPolicy, wallMessages, createVkWallCommands, createVkWallApi],
  [
    'birthday',
    vkBirthdaySettings,
    birthdayMessages,
    createVkBirthdayCommands,
    createVkBirthdayApi,
  ],
];
const ownerSettings = async (policy, store) => ({
  ...(await policy.settings(store)),
  messages: 'Owner text: a personal invitation or birthday greeting',
  ...(policy === wallPolicy
    ? { marker: 'Owner text:', restrictedMessage: 'Owner text: restricted' }
    : {}),
});

test('ten original message defaults are disabled and owner catalogs survive reads and explicit restoration', async () => {
  for (const [name, policy, messages] of cases) {
    const store = createMemoryStore();
    const initial = await policy.load(store);
    assert.equal(initial.settings.enabled, false);
    assert.equal(initial.settings.messages.split('\n').length, 10, name);
    assert.equal(messages.length, 10);
    assert.equal(new Set(messages).size, 10);
    assert.deepEqual(initial.messageDefaults.messages.split('\n'), messages);
    const owner = await ownerSettings(policy, store);
    await policy.save(store, owner);
    initial.messageDefaults.messages = 'mutated caller';
    const read = await policy.load(store);
    assert.deepEqual(read.settings, owner);
    assert.deepEqual(read.messageDefaults.messages.split('\n'), messages);
    await policy.save(store, { ...owner, ...read.messageDefaults });
    const restored = await policy.settings(store);
    assert.deepEqual(restored.messages.split('\n'), messages);
    assert.equal(restored.enabled, false);
    assert.equal(restored.limit, owner.limit);
    assert.deepEqual(restored.priorityIds, owner.priorityIds);
  }
});

test('random invitation and birthday defaults are selected before review and frozen through delivery', async () => {
  const random = Math.random;
  try {
    for (const value of [0, 0.999]) {
      Math.random = () => value;
      const selected = value === 0 ? 0 : 9;
      await withWallJob(async ({ job, adapter }) => {
        const { plan } = await job.preview();
        assert.equal(plan.items[0].text, wallMessages[selected]);
        assert.equal(adapter.effects.length, 0);
        Math.random = () => 1 - value - 0.0001;
        const result = await job.run({ planId: plan.planId, confirm: true });
        assert.equal(result.last.status, 'confirmed');
        assert.equal(adapter.effects[0].text, plan.items[0].text);
      });
      Math.random = () => value;
      await withBirthdayJob(async ({ job, adapter }) => {
        const { plan } = await job.preview();
        const reviewed = plan.items[0].steps.at(-1).text;
        assert.equal(reviewed, birthdayMessages[selected]);
        assert.equal(adapter.effects.length, 0);
        Math.random = () => 1 - value - 0.0001;
        const result = await job.run({ planId: plan.planId, confirm: true });
        assert.equal(result.last.status, 'confirmed');
        assert.equal(adapter.effects[0].text, reviewed);
      });
    }
  } finally {
    Math.random = random;
  }
});

test('CLI and offline status expose defaults without replacing owner settings', async () => {
  for (const [name, policy, messages, factory, apiFactory] of cases) {
    const store = createMemoryStore();
    let closed = 0;
    store.close = async () => {
      closed++;
    };
    const owner = await ownerSettings(policy, store);
    await policy.save(store, owner);
    const command = factory({ openReadOnly: async () => store })[`vk-${name}`];
    let result;
    assert.equal(
      await command({ _: ['status'] }, (line) => {
        result = JSON.parse(line);
      }),
      0
    );
    assert.deepEqual(result.messageDefaults.messages.split('\n'), messages);
    assert.deepEqual(result.settings, owner);
    assert.equal(closed, 1);
    const api = apiFactory({
      get: async () => null,
      report: async () => null,
      local: async () => store,
    });
    const title = name[0].toUpperCase() + name.slice(1);
    const offline = await api[`vk${title}`]();
    assert.equal(offline.canRun, false);
    assert.deepEqual(offline.messageDefaults, result.messageDefaults);
    assert.deepEqual(offline.settings, owner);
  }
});

test('both Lino transports expose independent defaults and require explicit trusted saving', async () => {
  const fixture = await wallServer();
  try {
    for (const [name, policy, messages] of cases) {
      const owner = await ownerSettings(policy, fixture.store);
      await policy.save(fixture.store, owner);
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const path = `/api/vk/${name}`;
        const response = await fetch(fixture.base + path, {
          headers: { Accept: type },
        });
        assert.equal(response.status, 200);
        const body = decodeWire(
          new Uint8Array(await response.arrayBuffer()),
          type
        );
        assert.deepEqual(body.settings, owner);
        assert.deepEqual(body.messageDefaults.messages.split('\n'), messages);
        const post = createWirePost(fixture.base, path, type);
        const desired = { ...owner, ...body.messageDefaults };
        assert.equal(
          (await post('', desired, 'https://foreign.invalid')).status,
          403
        );
        assert.deepEqual(await policy.settings(fixture.store), owner);
        const saved = await post('', desired);
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.answer.settings, desired);
        await policy.save(fixture.store, owner);
      }
    }
    assert.equal(fixture.messages(), 0);
    assert.deepEqual(fixture.effects, []);
  } finally {
    await fixture.close();
  }
});
