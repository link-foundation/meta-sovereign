import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  reengageKinds,
  vkReengageSettings,
} from '../src/automation/vk-reengage-settings.js';
import { createVkReengageApi } from '../src/web/vk-reengage-api.js';
import { createVkReengageCommands } from '../src/cli/vk-reengage-commands.js';
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
  reengageServer,
  reengageAdapter,
  reengageJob,
} from '../../experiments/issue-56/vk-reengage-fixture.mjs';

test(
  'both default Lino encodings freeze each ordered payload and require current origin and confirmation',
  { timeout: 15000 },
  async () => {
    const fixture = await reengageServer();
    try {
      for (const kind of reengageKinds) {
        for (const encoding of [LINO_TEXT, LINO_BINARY]) {
          const post = createWirePost(
            fixture.base,
            `/api/vk/${kind}`,
            encoding
          );
          const settings = {
            ...(await vkReengageSettings[kind].settings(fixture.store)),
            questions: 'Owner chosen question',
            ...(kind === 'music' ? { audio: 'audio-1_23' } : {}),
          };
          const plan = await assertReviewedVkPlan(post, settings);
          assert.equal(plan.items[0].steps.at(-1).text, settings.questions);
        }
      }
      assert.equal(fixture.effects.length, 0);
      // Complete actual mocked-adapter delivery through the public transport.
      await assertVkDeliveryAndSaveRetention(
        fixture,
        '/api/vk/music',
        vkReengageSettings.music,
        { questions: 'Changed' },
        (effects) => assert.equal(effects.length, 3)
      );
    } finally {
      await fixture.close();
    }
  }
);
test('offline configuration and every four-language control preserve truthful server capability', async () => {
  const { store, api } = offlineVkPolicy(createVkReengageApi);
  for (const kind of reengageKinds) {
    const title = `Vk${kind[0].toUpperCase()}${kind.slice(1)}`;
    const settings = {
      ...(await vkReengageSettings[kind].settings(store)),
      questions: 'Owner question',
    };
    assert.deepEqual((await api[`save${title}`](settings)).settings, settings);
    assert.equal((await api[`vk${title.slice(2)}`]()).canRun, false);
    assert.equal((await api[`plan${title}`]()).ok, false);
    assertVkTranslations(`vk${title.slice(2)}`, [
      'title',
      'hint',
      'greeting',
      'questions',
      'audio',
      'partial',
      'manualReview',
      'noHistory',
      'audioMissing',
      'delivered',
      'run',
      'cooldown',
    ]);
  }
});
test('foreground CLI saves independent strict settings, applies only explicit review and drains owned resources', async () => {
  for (const kind of reengageKinds) {
    const store = createMemoryStore();
    const adapter = reengageAdapter();
    const owned = ownedVkCommand(
      createVkReengageCommands,
      `vk-${kind}`,
      store,
      () => reengageJob(kind, store, adapter)
    );
    const { command, log } = owned;
    assert.equal(
      await command(
        {
          _: ['save'],
          greeting: 'Owner hello',
          questions: 'Owner question',
          ...(kind === 'music' ? { audio: 'audio-1_23' } : {}),
        },
        log
      ),
      0
    );
    await assertVkOwnedCommandRun(
      owned,
      adapter,
      { 'online-only': 'yes' },
      (effects) => assert.equal(effects.length, kind === 'music' ? 3 : 2)
    );
  }
});
