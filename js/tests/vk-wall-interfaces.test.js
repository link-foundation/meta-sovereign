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
          replaceOwned: true,
        };
        const plan = await assertReviewedVkPlan(post, settings);
        assert.equal(plan.items[0].text, settings.messages);
        assert.deepEqual(plan.items[0].attachments, ['audio-1_23']);
        assert.equal(plan.items[0].old.length, 1);
      }
      assert.equal(fixture.effects.length, 0);
      const post = createWirePost(fixture.base, '/api/vk/wall', LINO_BINARY);
      const { plan } = (await post('/plan', {})).answer;
      assert.equal(
        (await post('/run', { planId: plan.planId, confirm: true })).answer.last
          .status,
        'confirmed'
      );
      assert.deepEqual(
        fixture.effects.map((s) => s.action),
        ['post', 'delete']
      );
      fixture.refuseWrites(true);
      const before = await wallPolicy.settings(fixture.store);
      await assert.rejects(
        wallPolicy.save(fixture.store, { ...before, marker: 'changed' })
      );
      assert.deepEqual(await wallPolicy.settings(fixture.store), before);
    } finally {
      await fixture.close();
    }
  }
);
test('offline wall settings and all four languages retain server-required delivery and complete translated review controls', async () => {
  const { store, api } = offlineVkPolicy(createVkWallApi);
  const settings = { ...(await wallPolicy.settings(store)), communities: '42' };
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
  const { command, log, answer, closed } = ownedVkCommand(
    createVkWallCommands,
    'vk-wall',
    store,
    () => wallJob(store, adapter)
  );
  assert.equal(
    await command(
      {
        _: ['save'],
        communities: '42',
        attachments: 'audio-1_23',
        'replace-owned': true,
      },
      log
    ),
    0
  );
  assert.equal(await command({ _: ['plan'] }, log), 0);
  const plan = answer().plan.planId;
  await assert.rejects(command({ _: ['run'], plan }, log), /Confirm/);
  assert.equal(adapter.effects.length, 0);
  assert.equal(await command({ _: ['run'], plan, confirm: true }, log), 0);
  assert.deepEqual(
    adapter.effects.map((s) => s.action),
    ['post', 'delete']
  );
  await assert.rejects(command({ _: ['save'], 'replace-owned': 'yes' }, log));
  assert.equal(closed(), 5);
});
