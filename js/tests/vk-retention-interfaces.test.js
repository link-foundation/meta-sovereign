import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { retentionPolicy } from '../src/automation/vk-retention-settings.js';
import { createVkRetentionApi } from '../src/web/vk-retention-api.js';
import { createVkRetentionCommands } from '../src/cli/vk-retention-commands.js';
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
  retentionServer,
  retentionAdapter,
  retentionJob,
  seedRetention,
} from '../../experiments/issue-56/vk-retention-fixture.mjs';
test(
  'retention Lino text/binary transport requires origin and explicit frozen review',
  { timeout: 15000 },
  async () => {
    const fixture = await retentionServer();
    try {
      for (const encoding of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(
          fixture.base,
          '/api/vk/retention',
          encoding
        );
        const settings = await retentionPolicy.settings(fixture.store);
        const plan = await assertReviewedVkPlan(post, settings);
        assert.equal(plan.items[0].local.length, 3);
        assert.equal(fixture.effects.length, 0);
      }
      await assertVkDeliveryAndSaveRetention(
        fixture,
        '/api/vk/retention',
        retentionPolicy,
        { threshold: 0 },
        (effects) => assert.equal(effects.length, 1)
      );
    } finally {
      await fixture.close();
    }
  }
);
test('offline retention configuration has truthful capability and complete four-language controls', async () => {
  const { store, api } = offlineVkPolicy(createVkRetentionApi);
  const settings = {
    ...(await retentionPolicy.settings(store)),
    peers: '9,-12',
  };
  assert.deepEqual((await api.saveVkRetention(settings)).settings, settings);
  assert.equal((await api.vkRetention()).canRun, false);
  assert.equal((await api.planVkRetention()).ok, false);
  assertVkTranslations(
    'vkRetention',
    [
      'title',
      'hint',
      'peers',
      'threshold',
      'scanLimit',
      'clear',
      'cleared',
      'partial',
      'evidence',
      'belowThreshold',
      'incomplete',
    ],
    { complete: true }
  );
});
test('retention CLI saves explicit peers, requires confirmation and drains owned foreground resources', async () => {
  const store = createMemoryStore();
  const adapter = retentionAdapter();
  await seedRetention(store, adapter);
  const owned = ownedVkCommand(
    createVkRetentionCommands,
    'vk-retention',
    store,
    () => retentionJob(store, adapter)
  );
  assert.equal(
    await owned.command(
      { _: ['save'], peers: '9', threshold: '1', 'scan-limit': '200' },
      owned.log
    ),
    0
  );
  await assertVkOwnedCommandRun(owned, adapter, { peers: '0' }, (effects) =>
    assert.equal(effects.length, 1)
  );
});
