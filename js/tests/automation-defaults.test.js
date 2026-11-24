import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { formatIndented } from 'lino-objects-codec';
import { startupArguments } from '../src/cli/startup-configuration.js';
import { desktopConfiguration } from '../electron/configuration.js';
import { serveOptions } from '../src/cli/server-options.js';
import {
  mergeAutomationDefaults,
  validateAutomationDefaults,
} from '../src/configuration/automation-defaults.js';
import { configureAutomationSettings } from '../src/automation/configured-settings.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  readVkOnlineSettings,
  saveVkOnline,
} from '../src/automation/vk-online-settings.js';
import { readVkFriendSettings } from '../src/automation/vk-friends-settings.js';
import { readVkMaintenanceSettings } from '../src/automation/vk-maintenance-settings.js';
import { wallPolicy } from '../src/automation/vk-wall-settings.js';
import { vkBirthdaySettings } from '../src/automation/vk-birthday-settings.js';
import { startServer } from '../src/server/index.js';
import { runCli } from '../src/cli/index.js';
import { createVkOnlineCommands } from '../src/cli/vk-online-commands.js';
import { createWirePost } from './helpers/http-wire.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  automationDefaultsFixture as fixture,
  sixAutomationDefaults,
} from '../../experiments/issue-56/automation-defaults-fixture.mjs';

test('published example is valid readable Lino with all six policies paused', async () => {
  const { parseIndented } = await import('lino-objects-codec');
  const text = await readFile(
    new URL('../../examples/desktop-automation-config.lino', import.meta.url),
    'utf8'
  );
  const value = parseIndented({ text }).obj;
  const defaults = await validateAutomationDefaults(value.automations);
  assert.equal(Object.keys(defaults.vk).length, 6);
  assert.ok(Object.values(defaults.vk).every((policy) => !policy.enabled));
});

test(
  'six automation file defaults layer global, local and explicit Lino without writes',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await f.put('global', sixAutomationDefaults, { port: 8787 });
      await f.put(
        'local',
        { vk: { online: { everyMinutes: 3 }, friends: { batchSize: 4 } } },
        { verbose: false }
      );
      const before = await Promise.all(['global', 'local'].map(f.text));
      const args = {
        'automation-defaults': formatIndented({
          id: 'defaults',
          obj: {
            vk: {
              friends: { priorityIds: [9] },
              birthday: { onlineOnly: true },
            },
          },
        }),
        port: '9001',
      };
      const result = await startupArguments(args, f);
      assert.equal(result.port, '9001');
      assert.equal(result.verbose, false);
      const { vk } = result.automationDefaults;
      assert.equal(vk.online.everyMinutes, 3);
      assert.equal(vk.friends.everyMinutes, 31);
      assert.equal(vk.friends.batchSize, 4);
      assert.deepEqual(vk.friends.priorityIds, [9]);
      assert.equal(vk.cleanup.limit, 3);
      assert.equal(vk.outgoing.limit, 2);
      assert.equal(vk.wall.communities, '100,101');
      assert.equal(vk.birthday.messages, 'Fixture greeting');
      assert.equal(vk.birthday.onlineOnly, true);
      assert.equal(args.automationDefaults, undefined);
      assert.deepEqual(
        await Promise.all(['global', 'local'].map(f.text)),
        before
      );
      assert.deepEqual(
        serveOptions(result).automationDefaults,
        result.automationDefaults
      );
    })
);

test(
  'desktop consumes the same six file defaults and explicit overrides',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await f.put('global', sixAutomationDefaults);
      await f.put('local', { vk: { online: { everyMinutes: 2 } } });
      const result = await desktopConfiguration([], f);
      assert.equal(result.automationDefaults.vk.online.everyMinutes, 2);
      assert.equal(result.automationDefaults.vk.wall.everyMinutes, 9);
      assert.equal(result.port, 0);
      assert.equal(result.localUi, true);
      const inline = formatIndented({
        id: 'defaults',
        obj: { vk: { online: { everyMinutes: 3 } } },
      });
      const overridden = await desktopConfiguration(
        [`--automation-defaults=${inline}`],
        f
      );
      assert.equal(overridden.automationDefaults.vk.online.everyMinutes, 3);
      assert.equal(overridden.localUi, true);
    })
);

test(
  'legacy empty, scalar and list values normalize through the native policies',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await f.put('local', {
        vk: {
          friends: { priorityIds: 7 },
          cleanup: { priorityIds: {} },
          outgoing: { priorityIds: null },
          wall: {
            communities: 100,
            messages: ['Add me as a friend for a fixture'],
            attachments: {},
          },
          birthday: {
            messages: 'Fixture greeting',
            stickers: {},
            attachments: null,
            priorityIds: '',
          },
        },
      });
      const { vk } = (await startupArguments({}, f)).automationDefaults;
      assert.deepEqual(vk.friends.priorityIds, [7]);
      assert.deepEqual(vk.cleanup.priorityIds, []);
      assert.deepEqual(vk.outgoing.priorityIds, []);
      assert.equal(vk.wall.communities, '100');
      assert.equal(vk.wall.attachments, '');
      assert.equal(vk.birthday.messages, 'Fixture greeting');
      assert.equal(vk.birthday.stickers, '');
      assert.deepEqual(vk.birthday.priorityIds, []);
    })
);

test(
  'invalid hidden file values and private credentials refuse before store admission',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      let opened = 0;
      const commands = createVkOnlineCommands({
        configuration: f,
        openStore: async () => {
          opened++;
          throw new Error('Unexpected writer');
        },
        openReadOnly: async () => {
          opened++;
          throw new Error('Unexpected reader');
        },
      });
      await f.put('local', { vk: { online: { everyMinutes: 4 } } });
      for (const invalid of [
        { vk: { online: { everyMinutes: 0 } } },
        { vk: { online: { enabled: 'false' } } },
        { vk: { friends: { priorityIds: { private_fixture: 7 } } } },
        {
          vk: {
            birthday: { messages: { private_fixture: 'private_fixture' } },
          },
        },
        { vk: { online: { token: 'private_fixture' } } },
        { vk: { token: 'private_fixture' } },
        { unknown: { private_fixture: true } },
        { vk: [] },
      ]) {
        await f.put('global', invalid);
        await assert.rejects(
          commands['vk-online']({}, () => {}),
          (error) => {
            assert.equal(error.code, 'INVALID_APP_CONFIGURATION');
            assert.equal(
              error.message,
              'Invalid global application configuration.'
            );
            return true;
          }
        );
      }
      assert.equal(opened, 0);
    })
);

test(
  'native file defaults are isolated, ephemeral and below saved owner settings',
  { timeout: 5000 },
  async () => {
    const config = await validateAutomationDefaults(sixAutomationDefaults);
    config.vk.online.enabled = true;
    const store = configureAutomationSettings(createMemoryStore(), config);
    const other = createMemoryStore();
    const before = await store.query();
    assert.equal((await readVkOnlineSettings(store)).everyMinutes, 5);
    assert.equal((await readVkOnlineSettings(store)).enabled, true);
    assert.equal((await readVkFriendSettings(store)).batchSize, 2);
    assert.equal((await readVkMaintenanceSettings(store, 'cleanup')).limit, 3);
    assert.equal((await readVkMaintenanceSettings(store, 'outgoing')).limit, 2);
    assert.equal((await wallPolicy.settings(store)).communities, '100,101');
    assert.equal((await vkBirthdaySettings.settings(store)).everyMinutes, 1380);
    assert.equal((await readVkOnlineSettings(other)).everyMinutes, 14);
    config.vk.online.everyMinutes = 13;
    assert.equal((await readVkOnlineSettings(store)).everyMinutes, 5);
    assert.deepEqual(await store.query(), before);
    await saveVkOnline(store, { enabled: false, everyMinutes: 7 });
    configureAutomationSettings(
      store,
      await validateAutomationDefaults({
        vk: { online: { enabled: true, everyMinutes: 2 } },
      })
    );
    assert.equal((await readVkOnlineSettings(store)).everyMinutes, 7);
    assert.equal((await readVkOnlineSettings(store)).enabled, false);
    await store.delete('provider-job:vk:online');
    assert.equal((await readVkOnlineSettings(store)).everyMinutes, 2);
    configureAutomationSettings(store, {});
    assert.equal((await readVkOnlineSettings(store)).everyMinutes, 14);
  }
);

const serverOptions = {
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  automations: { scheduler: false },
  backups: { intervalHours: 0, formats: [] },
};

test(
  'actual server exposes all six defaults in both Lino formats and retains owner edits after restart',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    let server;
    try {
      server = await startServer({
        ...serverOptions,
        store,
        automationDefaults: sixAutomationDefaults,
      });
      const base = `http://127.0.0.1:${server.port}`;
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        for (const [name, expected] of [
          ['online', 5],
          ['friends', 31],
          ['cleanup', 41],
          ['outgoing', 11],
          ['wall', 9],
          ['birthday', 1380],
        ]) {
          const response = await fetch(`${base}/api/vk/${name}`, {
            headers: { accept: type },
          });
          assert.equal(response.status, 200);
          const answer = await readWireResponse(response);
          assert.equal(answer.settings.everyMinutes, expected);
          assert.equal(answer.settings.enabled, false);
        }
      }
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(base, '/api/vk/online', type);
        assert.equal(
          (await post('', { enabled: false, everyMinutes: 7 })).status,
          200
        );
      }
      assert.equal((await store.get('provider-job:vk:online')).everyMinutes, 7);
      assert.equal(
        (await store.query((row) => row.id === 'provider-job:vk:friends'))
          .length,
        0
      );
      await server.close();
      server = await startServer({
        ...serverOptions,
        store,
        automationDefaults: { vk: { online: { everyMinutes: 2 } } },
      });
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/vk/online`,
        { headers: { accept: LINO_TEXT } }
      );
      assert.equal((await readWireResponse(response)).settings.everyMinutes, 7);
      assert.equal(
        (await readVkOnlineSettings(createMemoryStore())).enabled,
        false
      );
    } finally {
      await server?.close();
    }
  }
);

test(
  'invalid direct server configuration refuses before files, logs or services are opened',
  { timeout: 15000 },
  async () =>
    fixture(async (f) => {
      const storeDir = join(f.cwd, 'unopened');
      const entries = [];
      await assert.rejects(
        startServer({
          ...serverOptions,
          storeDir,
          log: (entry) => entries.push(entry),
          automationDefaults: {
            vk: { online: { password: 'private_fixture' } },
          },
        }).then(async (server) => {
          await server.close();
          return server;
        }),
        {
          code: 'INVALID_APP_CONFIGURATION',
          message: 'Invalid automation defaults.',
        }
      );
      await assert.rejects(stat(storeDir), { code: 'ENOENT' });
      assert.deepEqual(entries, []);
    })
);

test(
  'public CLI reads file defaults without a write and explicit saved CLI choices survive later defaults',
  { timeout: 15000 },
  async () =>
    fixture(async (f) => {
      const store = join(f.cwd, 'store');
      await f.put('local', sixAutomationDefaults);
      const config = f.file('local');
      const messages = [];
      const run = (argv) =>
        runCli([...argv, `--store=${store}`, `--app-config=${config}`], {
          log: (value) => messages.push(value),
        });
      assert.equal(await run(['vk-online']), 0);
      assert.equal(JSON.parse(messages.at(-1)).settings.everyMinutes, 5);
      for (const [name, expected] of [
        ['friends', 31],
        ['cleanup', 41],
        ['outgoing', 11],
        ['wall', 9],
        ['birthday', 1380],
      ]) {
        assert.equal(await run([`vk-${name}`, 'status']), 0);
        assert.equal(
          JSON.parse(messages.at(-1)).settings.everyMinutes,
          expected
        );
      }
      await assert.rejects(stat(join(store, 'data.lino')), { code: 'ENOENT' });
      assert.equal(await run(['vk-online', '--every-minutes=7']), 0);
      const before = await readFile(config, 'utf8');
      assert.equal(JSON.parse(messages.at(-1)).settings.everyMinutes, 7);
      await f.put('local', { vk: { online: { everyMinutes: 2 } } });
      assert.equal(await run(['vk-online']), 0);
      assert.equal(JSON.parse(messages.at(-1)).settings.everyMinutes, 7);
      assert.notEqual(await readFile(config, 'utf8'), before);
      assert.equal(await run(['vk-friends']), 0);
      assert.equal(JSON.parse(messages.at(-1)).settings.batchSize, 23);
    })
);

test(
  'explicit Lino defaults reject malformed, excessive, secret and unknown settings without private diagnostics',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      for (const text of [
        true,
        'private_fixture\n  invalid private fixture',
        'x'.repeat(65537),
        'क'.repeat(22000),
        formatIndented({
          id: 'defaults',
          obj: { vk: { online: { token: 'private_fixture' } } },
        }),
      ]) {
        await assert.rejects(
          startupArguments({ 'automation-defaults': text }, f),
          {
            code: 'INVALID_APP_CONFIGURATION',
            message: 'Invalid command application configuration.',
          }
        );
      }
      const result = mergeAutomationDefaults(
        { vk: { friends: { priorityIds: [1, 2], everyMinutes: 5 } } },
        { vk: { friends: { priorityIds: [] } } }
      );
      assert.deepEqual(result.vk.friends, { priorityIds: [], everyMinutes: 5 });
      for (const name of ['__proto__', 'constructor', 'unknown']) {
        await assert.rejects(
          validateAutomationDefaults({ vk: { [name]: {} } }),
          { code: 'INVALID_APP_CONFIGURATION' }
        );
      }
    })
);
