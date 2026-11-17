import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSettings } from '../src/automation/safety.js';
import {
  vkPersonPolicies,
  withVkPersonPolicy,
} from '../../experiments/issue-56/vk-person-consent-fixture.mjs';
import {
  retentionAdapter,
  withRetention,
} from '../../experiments/issue-56/vk-retention-fixture.mjs';
import { withWallJob } from '../../experiments/issue-56/vk-wall-fixture.mjs';

for (const policy of vkPersonPolicies) {
  for (const stage of ['preview', 'review', 'provider-wait', 'other-source']) {
    test(
      `${policy.name} respects explicit person consent at ${stage}`,
      { timeout: 5000 },
      async () =>
        withVkPersonPolicy(policy, async ({ store, adapter, job, atIssue }) => {
          const { plan } = await job.preview();
          assert.ok(plan.items.some((item) => item.reason === 'eligible'));
          const revoke = () =>
            saveSettings(store, {
              optOut: plan.items.map((item) => ({
                source: stage === 'other-source' ? 'telegram' : 'vk',
                contact: String(item.userId),
              })),
            });
          let changed = false;
          if (stage === 'provider-wait') {
            atIssue(async () => {
              changed = true;
              await revoke();
            });
          } else {
            await revoke();
          }
          const reviewed =
            stage === 'preview' ? (await job.preview()).plan : plan;
          if (stage === 'preview') {
            assert.ok(
              reviewed.items.every((item) => item.reason !== 'eligible')
            );
          }
          const result = await job.run({
            planId: reviewed.planId,
            confirm: true,
          });
          if (stage === 'other-source') {
            assert.equal(result.last.status, 'confirmed');
            assert.ok(adapter.effects.length > 0);
            const outbox = await store.query((record) =>
              record.id?.startsWith('outbox:')
            );
            for (const record of outbox) {
              assert.equal(
                record.contact,
                record.chat,
                'native user identity reaches shared outbox'
              );
            }
          } else {
            if (stage !== 'preview') {
              assert.equal(result.last.status, 'refused');
            }
            assert.equal(adapter.effects.length, 0);
            if (stage === 'provider-wait') {
              assert.equal(
                changed,
                true,
                'actual provider wait was not exercised'
              );
            }
          }
        })
    );
  }
}

for (const peer of [-9, 2000000009]) {
  test(
    `person opt-outs do not identify non-private retention peer ${peer}`,
    { timeout: 5000 },
    async () => {
      const adapter = retentionAdapter();
      adapter.histories.set(
        peer,
        adapter.histories.get(9).map((row) => ({ ...row, peer_id: peer }))
      );
      await withRetention(
        async ({ store, job }) => {
          await saveSettings(store, {
            optOut: ['9', String(peer)].map((contact) => ({
              source: 'vk',
              contact,
            })),
          });
          const { plan } = await job.preview();
          assert.equal(plan.items[0].reason, 'eligible');
          const result = await job.run({ planId: plan.planId, confirm: true });
          assert.equal(result.last.status, 'confirmed');
          assert.equal(adapter.effects.length, 1);
          assert.equal(adapter.effects[0].peer, peer);
        },
        { adapter, settings: { peers: String(peer) } }
      );
    }
  );
}

test(
  'person opt-outs do not identify a same-numbered community wall',
  { timeout: 5000 },
  async () => {
    await withWallJob(async ({ store, job, adapter }) => {
      await saveSettings(store, { optOut: [{ source: 'vk', contact: '42' }] });
      const { plan } = await job.preview();
      assert.equal(plan.items[0].reason, 'eligible');
      const result = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(result.last.status, 'confirmed');
      assert.ok(adapter.effects.length > 0);
      assert.ok(adapter.effects.every((effect) => effect.community === 42));
    });
  }
);
