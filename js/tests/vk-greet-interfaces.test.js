import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { vkGreetSettings } from '../src/automation/vk-greet-settings.js';
import { createVkGreetApi } from '../src/web/vk-greet-api.js';
import { createVkGreetCommands } from '../src/cli/vk-greet-commands.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import {
  greetServer,
  greetAdapter,
  greetJob,
} from '../../experiments/issue-56/vk-greet-fixture.mjs';

test(
  'both Lino encodings preserve filters and refuse unreviewed or foreign-origin effects',
  { timeout: 10000 },
  async () => {
    const fixture = await greetServer();
    try {
      for (const encoding of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(fixture.base, '/api/vk/greet', encoding);
        const settings = {
          ...(await vkGreetSettings.settings(fixture.store)),
          message: 'Hello, friend.',
          limit: 1,
        };
        assert.equal(
          (await post('', settings, 'https://foreign.invalid')).status,
          403
        );
        assert.deepEqual((await post('', settings)).answer.settings, settings);
        const { plan } = (await post('/plan', {})).answer;
        assert.equal(plan.items[0].text, settings.message);
        assert.equal((await post('/run', { planId: plan.planId })).status, 400);
        assert.equal((await post('/run', { scheduled: true })).status, 400);
      }
      assert.equal(fixture.effects.length, 0);
      fixture.refuseWrites(true);
      const before = await vkGreetSettings.settings(fixture.store);
      await assert.rejects(
        vkGreetSettings.save(fixture.store, { ...before, onlineOnly: false })
      );
      assert.deepEqual(await vkGreetSettings.settings(fixture.store), before);
    } finally {
      await fixture.close();
    }
  }
);

test('offline policy stays editable without claiming provider capability; every control is translated', async () => {
  const store = createMemoryStore();
  const api = createVkGreetApi({
    get: async () => null,
    report: async () => null,
    local: async () => store,
  });
  const settings = {
    ...(await vkGreetSettings.settings(store)),
    emptyOnly: true,
  };
  assert.deepEqual((await api.saveVkGreet(settings)).settings, settings);
  assert.equal((await api.vkGreet()).canRun, false);
  assert.equal((await api.planVkGreet()).ok, false);
  for (const dictionary of Object.values(dictionaries)) {
    for (const key of [
      'title',
      'hint',
      'message',
      'onlineOnly',
      'emptyOnly',
      'orderByFriends',
      'scanLimit',
      'staleDays',
      'cooldownDays',
      'stickerId',
      'runLimit',
      'history',
      'prompt',
      'greeted',
    ]) {
      assert.equal(typeof dictionary[`vkGreet.${key}`], 'string', key);
      assert.ok(dictionary[`vkGreet.${key}`].length, key);
    }
  }
});

test('foreground CLI saves strict filters and closes stores on invalid input', async () => {
  const store = createMemoryStore();
  let closed = 0;
  store.close = async () => {
    closed++;
  };
  const { 'vk-greet': command } = createVkGreetCommands({
    openStore: async () => store,
    openReadOnly: async () => store,
  });
  assert.equal(
    await command(
      {
        _: ['save'],
        message: 'Custom hello',
        'stale-days': '45',
        'online-only': 'false',
      },
      () => {}
    ),
    0
  );
  assert.equal((await vkGreetSettings.settings(store)).message, 'Custom hello');
  for (const args of [
    { 'online-only': 'yes' },
    { limit: '101' },
    { message: '' },
    { 'sticker-id': '-1' },
  ]) {
    await assert.rejects(command({ _: ['save'], ...args }, () => {}));
  }
  assert.equal(closed, 5);
});

test('foreground CLI applies only its explicitly confirmed saved plan and drains each owned job', async () => {
  const store = createMemoryStore();
  const adapter = greetAdapter({ ids: [9] });
  let closed = 0;
  store.close = async () => {
    closed++;
  };
  const { 'vk-greet': command } = createVkGreetCommands({
    openStore: async () => store,
    openReadOnly: async () => store,
    createJob: () => greetJob(store, adapter),
  });
  let answer;
  const log = (value) => {
    answer = JSON.parse(value);
  };
  assert.equal(await command({ _: ['plan'] }, log), 0);
  const plan = answer.plan.planId;
  assert.equal(adapter.effects.length, 0);
  await assert.rejects(command({ _: ['run'], plan }, log), /Confirm/);
  assert.equal(adapter.effects.length, 0);
  assert.equal(await command({ _: ['run'], plan, confirm: true }, log), 0);
  assert.equal(answer.last.status, 'confirmed');
  assert.equal(adapter.effects.length, 1);
  assert.equal(closed, 3);
});
