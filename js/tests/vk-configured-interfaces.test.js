import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveVkFriends, loadVkFriends } from '../src/automation/vk-friends.js';
import { createVkFriendsApi } from '../src/web/vk-friends-api.js';
import { createVkFriendsCommands } from '../src/cli/vk-friends-commands.js';
import { startupArguments } from '../src/cli/startup-configuration.js';
import { desktopConfiguration } from '../electron/configuration.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import { dictionaries } from '../src/web/locales/index.js';
import {
  automationDefaultsFixture as fixture,
  sixAutomationDefaults,
} from '../../experiments/issue-56/automation-defaults-fixture.mjs';
import { configuredFriendSettings as settings } from '../../experiments/issue-56/vk-configured-fixture.mjs';
import { desktopServer } from '../../experiments/issue-56/vk-desktop-fixture.mjs';

test(
  'configured percentage layers in global and local Lino for server and desktop before explicit CLI saves',
  { timeout: 10000 },
  async () => {
    await fixture(async (f) => {
      await f.put('global', {
        ...sixAutomationDefaults,
        vk: { ...sixAutomationDefaults.vk, friends: settings },
      });
      await f.put('local', { vk: { friends: { topPercentMutuals: 12.5 } } });
      const before = await Promise.all(['global', 'local'].map(f.text));
      assert.equal(
        (await startupArguments({}, f)).automationDefaults.vk.friends
          .topPercentMutuals,
        12.5
      );
      const desktop = await desktopConfiguration([], f);
      assert.equal(
        desktop.automationDefaults.vk.friends.acceptancePolicy,
        'desktop-configured'
      );
      assert.equal(
        desktop.automationDefaults.vk.friends.topPercentMutuals,
        12.5
      );
      const store = createMemoryStore();
      let closed = 0;
      store.close = async () => {
        closed++;
      };
      const command = createVkFriendsCommands({
        configuration: f,
        openReadOnly: async () => store,
        openStore: async () => store,
      })['vk-friends'];
      await command({ _: ['save'], 'top-percent-mutuals': '20' }, () => {});
      assert.equal((await loadVkFriends(store)).settings.topPercentMutuals, 20);
      await assert.rejects(
        command({ _: ['save'], 'top-percent-mutuals': '101' }, () => {}),
        /topPercentMutuals/
      );
      assert.equal((await loadVkFriends(store)).settings.topPercentMutuals, 20);
      assert.equal(closed, 2);
      assert.deepEqual(
        await Promise.all(['global', 'local'].map(f.text)),
        before
      );
      // A hidden invalid global value must fail even when a local value replaces it.
      await f.put('global', { vk: { friends: { topPercentMutuals: -1 } } });
      await assert.rejects(startupArguments({}, f), {
        code: 'INVALID_APP_CONFIGURATION',
      });
    });
  }
);

test(
  'both Lino transports and offline settings retain configured percentage and refuse unacknowledged replacement',
  { timeout: 10000 },
  async () => {
    const server = await desktopServer();
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(server.base, '/api/vk/friends', type);
        const saved = await post('', settings);
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.answer.settings, settings);
        const plan = (await post('/plan', {})).answer.plan;
        assert.equal(plan.quota.available, 5);
        assert.equal(
          plan.items.filter((item) => item.reason === 'eligible').length,
          5
        );
        assert.equal(
          (await post('', { ...settings, topPercentMutuals: 101 })).status,
          400
        );
      }
      server.refuseWrites(true);
      const post = createWirePost(server.base, '/api/vk/friends', LINO_TEXT);
      assert.equal(
        (await post('', { ...settings, topPercentMutuals: 20 })).status,
        400
      );
      assert.deepEqual((await loadVkFriends(server.store)).settings, settings);
      assert.deepEqual(server.effects, []);
      assert.equal(server.messages(), 0);
    } finally {
      await server.close();
    }
    const store = createMemoryStore();
    const api = createVkFriendsApi({
      get: async () => null,
      report: async () => null,
      local: async () => store,
    });
    assert.deepEqual((await api.saveVkFriends(settings)).settings, settings);
    assert.equal((await api.vkFriends()).canRun, false);
    assert.equal((await api.planVkFriends()).ok, false);
  }
);

test(
  'readable private settings retain configured policy and percentage after store reopen',
  { timeout: 5000 },
  async () => {
    await fixture(async (f) => {
      let store;
      try {
        const file = join(f.cwd, 'state.lino');
        store = await createLinoTextStore(file);
        await saveVkFriends(store, settings);
        await store.close();
        store = await createLinoTextStore(file);
        assert.deepEqual((await loadVkFriends(store)).settings, settings);
      } finally {
        await store?.close();
      }
    });
  }
);

test('all four locales explain configured capacity and interpolate the actual percentage', () => {
  for (const dictionary of Object.values(dictionaries)) {
    for (const key of [
      'desktop-configured',
      'topPercentMutuals',
      'configuredHint',
    ]) {
      assert.equal(typeof dictionary[`vkFriends.${key}`], 'string');
    }
    assert.ok(dictionary['vkFriends.configuredHint'].includes('{percent}'));
    assert.ok(dictionary['vkFriends.desktopHint'].includes('{percent}'));
  }
});
