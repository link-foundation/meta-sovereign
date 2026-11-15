import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { wallPolicy } from '../src/automation/vk-wall-settings.js';
import { createVkWallApi } from '../src/web/vk-wall-api.js';
import { createVkWallCommands } from '../src/cli/vk-wall-commands.js';
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
  wallServer,
  wallAdapter,
  wallJob,
} from '../../experiments/issue-56/vk-wall-fixture.mjs';

test(
  'both Lino encodings require same-origin explicit reviewed wall confirmation and retain failed saves',
  { timeout: 15000 },
  async () => {
    const fixture = await wallServer();
    try {
      for (const encoding of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(fixture.base, '/api/vk/wall', encoding);
        const settings = {
          ...(await wallPolicy.settings(fixture.store)),
          communities: '42',
          attachments: 'audio-1_23',
          randomAttachment: true,
          holdAnyVisible: true,
          replaceOwned: true,
        };
        const plan = await assertReviewedVkPlan(post, settings);
        assert.equal(plan.items[0].text, settings.messages);
        assert.equal(plan.settings.randomAttachment, true);
        assert.equal(plan.settings.holdAnyVisible, true);
        assert.deepEqual(plan.items[0].attachments, ['audio-1_23']);
        assert.equal(plan.items[0].old.length, 1);
      }
      assert.equal(fixture.effects.length, 0);
      await assertVkDeliveryAndSaveRetention(
        fixture,
        '/api/vk/wall',
        wallPolicy,
        { marker: 'changed' },
        (effects) =>
          assert.deepEqual(
            effects.map((s) => s.action),
            ['post', 'delete']
          )
      );
    } finally {
      await fixture.close();
    }
  }
);
test('offline wall settings and all four languages retain server-required delivery and complete translated review controls', async () => {
  const { store, api } = offlineVkPolicy(createVkWallApi);
  const settings = {
    ...(await wallPolicy.settings(store)),
    communities: '42',
    randomAttachment: true,
    holdAnyVisible: true,
  };
  assert.deepEqual((await api.saveVkWall(settings)).settings, settings);
  assert.equal((await api.vkWall()).canRun, false);
  assert.equal((await api.planVkWall()).ok, false);
  assertVkTranslations(
    'vkWall',
    [
      'title',
      'hint',
      'communities',
      'messages',
      'attachments',
      'replaceOwned',
      'activeAvatar',
      'randomAttachment',
      'holdAnyVisible',
      'visibleInvitation',
      'alreadyAbsent',
      'deliveredWithAbsent',
      'oldPosts',
      'partial',
      'manualReview',
      'unknown',
      'run',
    ],
    { complete: true }
  );
});
test('foreground CLI retains wall options and requires explicit reviewed confirmation before native writes', async () => {
  const store = createMemoryStore();
  const adapter = wallAdapter();
  const owned = ownedVkCommand(createVkWallCommands, 'vk-wall', store, () =>
    wallJob(store, adapter)
  );
  const { command, log } = owned;
  assert.equal(
    await command(
      {
        _: ['save'],
        communities: '42',
        attachments: 'audio-1_23',
        'replace-owned': true,
        'random-attachment': true,
        'hold-any-visible': true,
      },
      log
    ),
    0
  );
  assert.equal((await wallPolicy.settings(store)).randomAttachment, true);
  assert.equal((await wallPolicy.settings(store)).holdAnyVisible, true);
  await assertVkOwnedCommandRun(
    owned,
    adapter,
    { 'replace-owned': 'yes' },
    (effects) =>
      assert.deepEqual(
        effects.map((s) => s.action),
        ['post', 'delete']
      )
  );
});
