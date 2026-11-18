import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoveryPolicies } from '../src/automation/vk-discovery-settings.js';
import { friendLedgerId } from '../src/automation/vk-friends-records.js';
import { discoveryQuotaId } from '../src/automation/vk-discovery-quota.js';
import { pausedVkPolicy } from './helpers/vk-policy-lifecycle.mjs';
import {
  withDiscovery,
  discoveryAdapter,
  runDiscovery,
} from '../../experiments/issue-56/vk-discovery-fixture.mjs';

const delayedDiscovery = () => {
  let mutate = async () => {};
  let writing = false;
  const adapter = discoveryAdapter({
    live: {
      limiter: {
        wait: async () => {
          if (writing) {
            writing = false;
            await mutate();
          }
        },
      },
    },
  });
  const add = adapter.live.addFriend;
  adapter.live.addFriend = (...args) => {
    writing = true;
    return add(...args);
  };
  return {
    adapter,
    mutate: (fn) => {
      mutate = fn;
    },
  };
};
test('discovery rechecks credentials, consent, receipt, profile and lifetime after actual rate admission', async () => {
  for (const change of [
    'account',
    'token',
    'policy',
    'consent',
    'priority',
    'profile',
    'relation',
    'mutual',
    'capacity',
    'expiry',
    'backwards',
    'receipt',
  ]) {
    const delayed = delayedDiscovery();
    let now = Date.UTC(2026, 10, 15, 12);
    let token = 'fixture-user-token';
    await withDiscovery(
      async ({ job, store, adapter }) => {
        const { plan } = await job.preview();
        delayed.mutate(async () => {
          if (change === 'account') {
            adapter.account(2);
          }
          if (change === 'token') {
            token = 'changed';
          }
          if (change === 'expiry') {
            now += 300001;
          }
          if (change === 'backwards') {
            now--;
          }
          if (change === 'profile') {
            adapter.profiles.get(11).can_post = 0;
          }
          if (change === 'relation') {
            adapter.relations.set(11, 1);
          }
          if (change === 'mutual') {
            adapter.mutuals.set(11, 10);
          }
          if (change === 'capacity') {
            adapter.count(plan.settings.maxFriends);
          }
          if (change === 'policy') {
            await discoveryPolicies.suggestions.save(store, {
              ...plan.settings,
              limit: 2,
            });
          }
          if (change === 'priority') {
            await discoveryPolicies.community.save(store, {
              ...(await discoveryPolicies.community.settings(store)),
              priorityIds: [11],
            });
          }
          if (change === 'consent') {
            await store.put({
              id: 'automation-settings:global',
              optOut: [{ source: 'vk', chat: '11' }],
            });
          }
          if (change === 'receipt') {
            await store.put({
              id: friendLedgerId(1, 11),
              status: 'unknown',
              planId: 'other',
            });
          }
        });
        assert.equal(
          (await job.run({ planId: plan.planId, confirm: true })).last.status,
          'refused',
          change
        );
        assert.equal(adapter.effects.length, 0, change);
        if (change === 'receipt') {
          assert.equal(
            (await store.get(friendLedgerId(1, 11))).planId,
            'other'
          );
        }
      },
      {
        adapter: delayed.adapter,
        options: { now: () => now, optionsFor: async () => ({ token }) },
      }
    );
  }
});
test('durable admission and quota acknowledgements cannot outlive their review or replace concurrent receipts', async () => {
  for (const stage of ['quota', 'intent', 'foreign']) {
    let now = Date.UTC(2026, 10, 15, 12);
    await withDiscovery(
      async ({ job, store, adapter }) => {
        const { plan } = await job.preview();
        const put = store.put.bind(store);
        let changed = false;
        store.put = async (row) => {
          const answer = await put(row);
          const selected =
            stage === 'quota'
              ? row.id === discoveryQuotaId(1, plan.date)
              : row.id === friendLedgerId(1, 11) && row.status === 'pending';
          if (!changed && selected) {
            changed = true;
            if (stage === 'foreign') {
              await put({ id: row.id, status: 'unknown', planId: 'foreign' });
            } else {
              now += 300001;
            }
          }
          return answer;
        };
        assert.equal(
          (await job.run({ planId: plan.planId, confirm: true })).last.status,
          'refused'
        );
        assert.equal(adapter.effects.length, 0);
        if (stage === 'foreign') {
          assert.equal(
            (await store.get(friendLedgerId(1, 11))).planId,
            'foreign'
          );
        }
      },
      { options: { now: () => now } }
    );
  }
});
test('tampered discovery reviews and incorrect rejection receipts never claim success', async () => {
  for (const changed of ['profile', 'reason', 'userId', 'signature', 'kind']) {
    await withDiscovery(async ({ job, store, adapter }) => {
      const { plan } = await job.preview();
      if (changed === 'profile') {
        plan.items[0].profile.canPost = false;
      } else if (changed === 'kind') {
        plan.kind = 'community';
      } else {
        plan.items[0][changed] = changed === 'userId' ? 999 : 'changed';
      }
      await store.put(plan);
      await assert.rejects(job.run({ planId: plan.planId, confirm: true }));
      assert.equal(adapter.effects.length, 0);
    });
  }
  await withDiscovery(
    async ({ job, adapter, store }) => {
      adapter.mode('unconfirmed');
      assert.equal((await runDiscovery(job)).last.status, 'unknown');
      assert.equal((await store.get(friendLedgerId(1, 21))).status, 'unknown');
      await runDiscovery(job);
      assert.equal(adapter.effects.filter((e) => e.id === 21).length, 1);
    },
    { kind: 'rejections' }
  );
});
test('failed intent and final acknowledgement preserve no-send or durable uncertainty', async () => {
  for (const stage of ['pending', 'confirmed']) {
    await withDiscovery(async ({ job, adapter, store }) => {
      const { plan } = await job.preview();
      const put = store.put.bind(store);
      let failed = false;
      store.put = async (row) => {
        if (
          !failed &&
          row.id === friendLedgerId(1, 11) &&
          row.status === stage
        ) {
          failed = true;
          throw new Error('Synthetic durable discovery receipt refused');
        }
        return put(row);
      };
      const run = () => job.run({ planId: plan.planId, confirm: true });
      if (stage === 'pending') {
        assert.equal((await run()).last.status, 'refused');
      } else {
        await assert.rejects(run(), /receipt refused/);
      }
      assert.equal(adapter.effects.length, stage === 'pending' ? 0 : 1);
      if (stage === 'confirmed') {
        assert.equal(
          (await store.get(friendLedgerId(1, 11))).status,
          'pending'
        );
        await runDiscovery(job);
        assert.equal(adapter.effects.filter((e) => e.id === 11).length, 1);
      }
    });
  }
});
test(
  'owned discovery jobs coalesce scheduled runs and Stop drains pacing',
  { timeout: 15000 },
  async () => {
    const held = pausedVkPolicy();
    await withDiscovery(async ({ job, adapter }) => held.verify(job, adapter), {
      settings: { enabled: true, limit: 2 },
      options: held.options,
    });
  }
);
test('fresh community membership and deactivation evidence are required at issuance', async () => {
  for (const kind of ['community', 'rejections']) {
    await withDiscovery(
      async ({ job, adapter, store }) => {
        const { plan } = await job.preview();
        if (kind === 'community') {
          adapter.members.delete(7);
        } else {
          adapter.profiles.get(21).deactivated = undefined;
        }
        assert.equal(
          (await job.run({ planId: plan.planId, confirm: true })).last.status,
          'refused'
        );
        assert.equal(adapter.effects.length, 0);
        assert.equal(
          (await discoveryPolicies[kind].read(store)).plan.status,
          'consumed'
        );
      },
      { kind }
    );
  }
});
