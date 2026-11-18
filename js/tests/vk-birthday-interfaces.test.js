import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { vkBirthdaySettings } from '../src/automation/vk-birthday-settings.js';
import { createVkBirthdayApi } from '../src/web/vk-birthday-api.js';
import { createVkBirthdayCommands } from '../src/cli/vk-birthday-commands.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import {
  assertReviewedVkPlan,
  assertVkDeliveryAndSaveRetention,
  assertVkOwnedCommandRun,
  assertVkTranslations,
  offlineVkPolicy,
  ownedVkCommand,
} from './helpers/vk-policy-interfaces.mjs';
import {
  birthdayServer,
  birthdayAdapter,
  birthdayJob,
} from '../../experiments/issue-56/vk-birthday-fixture.mjs';
test(
  'birthday Lino text/binary transport requires current origin and explicit frozen review',
  { timeout: 15000 },
  async () => {
    const fixture = await birthdayServer();
    try {
      for (const encoding of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(fixture.base, '/api/vk/birthday', encoding);
        const settings = {
          ...(await vkBirthdaySettings.settings(fixture.store)),
          messages: 'Owner birthday',
          stickers: '60302',
          attachments: 'video1_23',
        };
        const plan = await assertReviewedVkPlan(post, settings);
        assert.equal(plan.items[0].cycle, '2026-11-15');
        assert.equal(plan.items[0].steps[1].text, settings.messages);
        assert.equal(fixture.effects.length, 0);
      }
      await assertVkDeliveryAndSaveRetention(
        fixture,
        '/api/vk/birthday',
        vkBirthdaySettings,
        { timeZone: 'Asia/Kolkata' },
        (effects) => assert.equal(effects.length, 2)
      );
    } finally {
      await fixture.close();
    }
  }
);
test('offline birthday configuration and complete four-language controls retain truthful capability', async () => {
  const { store, api } = offlineVkPolicy(createVkBirthdayApi);
  const settings = {
    ...(await vkBirthdaySettings.settings(store)),
    messages: 'Owner birthday',
  };
  assert.deepEqual((await api.saveVkBirthday(settings)).settings, settings);
  assert.equal((await api.vkBirthday()).canRun, false);
  assert.equal((await api.planVkBirthday()).ok, false);
  assertVkTranslations(
    'vkBirthday',
    [
      'title',
      'hint',
      'timeZone',
      'messages',
      'stickers',
      'attachments',
      'selectedDate',
      'dateChanged',
      'birthdayPrivate',
      'birthdayInvalid',
      'notBirthday',
    ],
    { complete: true }
  );
});
test('birthday CLI saves owner catalogs, requires confirmation and drains foreground resources', async () => {
  const store = createMemoryStore();
  const adapter = birthdayAdapter();
  const owned = ownedVkCommand(
    createVkBirthdayCommands,
    'vk-birthday',
    store,
    () => birthdayJob(store, adapter)
  );
  const { command, log } = owned;
  assert.equal(
    await command(
      {
        _: ['save'],
        messages: 'Owner wishes',
        stickers: '60302',
        attachments: 'video1_23',
        'time-zone': 'UTC',
      },
      log
    ),
    0
  );
  await assertVkOwnedCommandRun(
    owned,
    adapter,
    { 'online-only': 'yes' },
    (effects) => assert.equal(effects.length, 2)
  );
});
