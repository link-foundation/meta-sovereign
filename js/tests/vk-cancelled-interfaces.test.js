import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  readVkCancelledSettings,
  loadVkCancelled,
} from '../src/automation/vk-cancelled-settings.js';
import { createVkCancelledCommands } from '../src/cli/vk-cancelled-commands.js';
import { createVkCancelledApi } from '../src/web/vk-cancelled-api.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import {
  assertReviewedVkPlan,
  assertVkTranslations,
  offlineVkPolicy,
  ownedVkCommand,
} from './helpers/vk-policy-interfaces.mjs';
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
        const plan = await assertReviewedVkPlan(post, settings);
        assert.equal(plan.items[0].text, 'Hi\nShall we talk?');
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
  const { store, api } = offlineVkPolicy(createVkCancelledApi);
  const settings = {
    ...(await readVkCancelledSettings(store)),
    blockUnanswered: true,
  };
  assert.deepEqual((await api.saveVkCancelled(settings)).settings, settings);
  assert.equal((await api.vkCancelled()).canRun, false);
  assert.equal((await api.planVkCancelled()).ok, false);
  assert.equal((await api.runVkCancelled('plan')).ok, false);
  assertVkTranslations('vkCancelled', [
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
  ]);
});

test('foreground follow-up CLI saves text, strict boolean choices and limits, then closes owned resources', async () => {
  const store = createMemoryStore();
  const { command, closed } = ownedVkCommand(
    createVkCancelledCommands,
    'vk-cancelled',
    store
  );
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
  assert.equal(closed(), 4);
});
