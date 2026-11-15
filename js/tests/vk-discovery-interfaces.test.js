import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  discoveryKinds,
  discoveryPolicies,
} from '../src/automation/vk-discovery-settings.js';
import { createVkDiscoveryApi } from '../src/web/vk-discovery-api.js';
import { createVkDiscoveryCommands } from '../src/cli/vk-discovery-commands.js';
import {
  saveVkMaintenance,
  readVkMaintenanceSettings,
} from '../src/automation/vk-maintenance-settings.js';
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
  discoveryServer,
  discoveryAdapter,
  discoveryJob,
  seedDiscovery,
} from '../../experiments/issue-56/vk-discovery-fixture.mjs';

test(
  'discovery text/binary routes require same-origin explicit review for each independent policy',
  { timeout: 15000 },
  async () => {
    const fixture = await discoveryServer();
    try {
      for (const kind of discoveryKinds) {
        for (const encoding of [LINO_TEXT, LINO_BINARY]) {
          const post = createWirePost(
            fixture.base,
            `/api/vk/${kind}`,
            encoding
          );
          const plan = await assertReviewedVkPlan(
            post,
            await discoveryPolicies[kind].settings(fixture.store)
          );
          assert.ok(plan.items.length);
          assert.equal(fixture.effects.length, 0);
        }
      }
      await assertVkDeliveryAndSaveRetention(
        fixture,
        '/api/vk/rejections',
        discoveryPolicies.suggestions,
        { limit: 0 },
        (effects) => assert.deepEqual(effects, [{ kind: 'delete', id: 21 }])
      );
    } finally {
      await fixture.close();
    }
  }
);
test('all discovery offline settings and four-language controls retain truthful live capability', async () => {
  const { store, api } = offlineVkPolicy(createVkDiscoveryApi);
  for (const kind of discoveryKinds) {
    const title = `${kind[0].toUpperCase()}${kind.slice(1)}`;
    const settings = {
      ...(await discoveryPolicies[kind].settings(store)),
      priorityIds: [11],
    };
    assert.deepEqual(
      (await api[`saveVk${title}`](settings)).settings,
      settings
    );
    assert.equal((await api[`vk${title}`]()).canRun, false);
    assert.equal((await api[`planVk${title}`]()).ok, false);
    assertVkTranslations(
      `vk${title}`,
      ['title', 'hint', 'plan', 'run', 'priorityIds', 'runLimit', 'window'],
      { complete: true }
    );
  }
});
test('each discovery CLI command saves, confirms and drains owned foreground resources', async () => {
  for (const kind of discoveryKinds) {
    const store = createMemoryStore();
    const adapter = discoveryAdapter();
    await seedDiscovery(store, kind);
    const owned = ownedVkCommand(
      createVkDiscoveryCommands,
      `vk-${kind}`,
      store,
      () => discoveryJob(store, adapter, kind)
    );
    assert.equal(
      await owned.command(
        { _: ['save'], limit: '1', 'scan-limit': '100' },
        owned.log
      ),
      0
    );
    await assertVkOwnedCommandRun(owned, adapter, { limit: '-1' }, (effects) =>
      assert.equal(effects.length, 1)
    );
  }
});
test(
  'existing friends, incoming and outgoing inspections retain their complete fixture IDs without effects',
  { timeout: 15000 },
  async () => {
    const fixture = await discoveryServer();
    try {
      await saveVkMaintenance(fixture.store, 'outgoing', {
        ...(await readVkMaintenanceSettings(fixture.store, 'outgoing')),
        limit: 10000,
      });
      for (const [kind, expected] of [
        ['cleanup', [8, 24]],
        ['friends', [21, 22, 23]],
        ['outgoing', [31, 32]],
      ]) {
        const post = createWirePost(
          fixture.base,
          `/api/vk/${kind}`,
          LINO_BINARY
        );
        const response = await post('/plan', {});
        assert.equal(response.status, 200, kind);
        assert.deepEqual(
          response.answer.plan.items
            .map((item) => item.userId)
            .sort((a, b) => a - b),
          expected,
          kind
        );
      }
      assert.equal(fixture.effects.length, 0);
      assert.equal(fixture.messages(), 0);
    } finally {
      await fixture.close();
    }
  }
);
