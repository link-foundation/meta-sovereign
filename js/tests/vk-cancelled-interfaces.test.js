import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  readVkCancelledSettings,
  loadVkCancelled,
} from '../src/automation/vk-cancelled-settings.js';
import { createVkCancelledCommands } from '../src/cli/vk-cancelled-commands.js';
import { createVkCancelledApi } from '../src/web/vk-cancelled-api.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import { cancelledServer } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';

test(
  'both Lino encodings require same-origin explicit confirmation and acknowledge saved follow-up choices',
  { timeout: 10000 },
  async () => {
    const fixture = await cancelledServer();
    try {
      const settings = {
        ...(await readVkCancelledSettings(fixture.store)),
        greeting: 'Hi',
        question: 'Shall we talk?',
        limit: 1,
      };
      for (const encoding of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(
          fixture.base,
          '/api/vk/cancelled',
          encoding
        );
        assert.equal(
          (await post('', settings, 'https://foreign.invalid')).status,
          403
        );
        assert.deepEqual((await post('', settings)).answer.settings, settings);
        const plan = (await post('/plan', {})).answer.plan;
        assert.equal(plan.items[0].text, 'Hi\nShall we talk?');
        assert.equal((await post('/run', { planId: plan.planId })).status, 400);
        assert.equal((await post('/run', { scheduled: true })).status, 400);
      }
      assert.deepEqual(fixture.effects, []);
      fixture.refuseWrites(true);
      const post = createWirePost(fixture.base, '/api/vk/cancelled', LINO_TEXT);
      assert.equal(
        (await post('', { ...settings, blockUnwritable: true })).status,
        400
      );
      assert.equal(
        (await loadVkCancelled(fixture.store)).settings.blockUnwritable,
        false
      );
    } finally {
      await fixture.close();
    }
  }
);

test('offline follow-up policy has no provider capability and all four languages explain evidence and choices', async () => {
  const store = createMemoryStore();
  const api = createVkCancelledApi({
    get: async () => null,
    report: async () => null,
    local: async () => store,
  });
  const settings = {
    ...(await readVkCancelledSettings(store)),
    blockUnanswered: true,
  };
  assert.deepEqual((await api.saveVkCancelled(settings)).settings, settings);
  assert.equal((await api.vkCancelled()).canRun, false);
  assert.equal((await api.planVkCancelled()).ok, false);
  assert.equal((await api.runVkCancelled('plan')).ok, false);
  for (const dictionary of Object.values(dictionaries)) {
    for (const key of [
      'title',
      'hint',
      'greeting',
      'question',
      'blockUnanswered',
      'blockUnwritable',
      'actionBlockUnanswered',
      'actionBlockUnwritable',
      'outgoingEvidence',
      'history',
      'unknown',
      'alreadyPrompted',
      'historyLimit',
      'futureHistory',
      'optedOut',
    ]) {
      assert.ok(dictionary[`vkCancelled.${key}`]?.length > 0, key);
    }
  }
});

test('foreground follow-up CLI saves text, strict boolean choices and limits, then closes owned resources', async () => {
  const store = createMemoryStore();
  let closes = 0;
  store.close = async () => {
    closes++;
  };
  const command = createVkCancelledCommands({
    openStore: async () => store,
    openReadOnly: async () => store,
  })['vk-cancelled'];
  await command(
    {
      _: ['save'],
      greeting: 'Hi',
      question: 'Stay in touch?',
      'block-unanswered': 'true',
      'wait-days': '3',
      limit: '5',
    },
    () => {}
  );
  const saved = (await loadVkCancelled(store)).settings;
  assert.equal(saved.question, 'Stay in touch?');
  assert.equal(saved.blockUnanswered, true);
  assert.equal(saved.blockUnwritable, false);
  assert.equal(saved.waitDays, 3);
  assert.equal(saved.limit, 5);
  for (const args of [
    { 'block-unwritable': 'yes' },
    { question: '' },
    { limit: '101' },
  ]) {
    await assert.rejects(command({ _: ['save'], ...args }, () => {}));
  }
  assert.equal(closes, 4);
});
