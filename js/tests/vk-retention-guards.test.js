import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  retentionPolicy,
  retentionLedgerId,
} from '../src/automation/vk-retention-settings.js';
import { isTombstone } from '../src/storage/soft-delete.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { evidenceHash } from '../src/automation/vk-reengage-evidence.js';
import {
  withRetention,
  retentionAdapter,
  runRetention,
} from '../../experiments/issue-56/vk-retention-fixture.mjs';
test('changes after the actual rate wait refuse current account, credential, policy, consent, history and local evidence', async () => {
  for (const change of [
    'account',
    'token',
    'policy',
    'consent',
    'history',
    'local',
    'expiry',
    'receipt',
  ]) {
    let mutate = async () => {};
    let token = 'fixture-user-token';
    let now = Date.UTC(2026, 10, 15, 12);
    let writing = false;
    const adapter = retentionAdapter({
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
    const deletion = adapter.live.deleteRetention;
    adapter.live.deleteRetention = (...args) => {
      writing = true;
      return deletion(...args);
    };
    await withRetention(
      async ({ job, store }) => {
        const { plan } = await job.preview();
        mutate = async () => {
          mutate = async () => {};
          if (change === 'account') {
            adapter.account(2);
          }
          if (change === 'token') {
            token = 'changed';
          }
          if (change === 'expiry') {
            now += 300001;
          }
          if (change === 'history') {
            adapter.histories.get(9)[0].text = 'Edited';
          }
          if (change === 'local') {
            await store.put({
              ...(await store.get('msg:vk:1')),
              body: 'Owner edit',
            });
          }
          if (change === 'receipt') {
            await store.put({
              id: retentionLedgerId(1, 9),
              status: 'unknown',
              planId: 'other',
            });
          }
          if (change === 'policy') {
            await retentionPolicy.save(store, {
              ...plan.settings,
              threshold: 0,
            });
          }
          if (change === 'consent') {
            await store.put({
              id: 'automation-settings:global',
              optOut: [{ source: 'vk', chat: '9' }],
            });
          }
        };
        const result = await job.run({ planId: plan.planId, confirm: true });
        assert.equal(result.last.status, 'refused', change);
        assert.equal(adapter.effects.length, 0, change);
        assert.equal(isTombstone(await store.get('msg:vk:1')), false);
      },
      {
        adapter,
        options: { optionsFor: async () => ({ token }), now: () => now },
      }
    );
  }
});
test('edited persisted review cannot select unreviewed messages or replace a previous receipt', async () => {
  for (const change of ['messages', 'previousFingerprint', 'reason']) {
    await withRetention(async ({ job, store, adapter }) => {
      if (change === 'reason') {
        await retentionPolicy.save(store, {
          ...(await retentionPolicy.settings(store)),
          limit: 0,
        });
      }
      const { plan } = await job.preview();
      if (change === 'messages') {
        plan.items[0].messages[0].cmid = 999;
      } else if (change === 'reason') {
        plan.items[0].reason = 'eligible';
      } else {
        const receipt = { id: retentionLedgerId(1, 9), status: 'unknown' };
        await store.put(receipt);
        plan.items[0].previousFingerprint = await evidenceHash(receipt);
      }
      await store.put(plan);
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'refused'
      );
      assert.equal(adapter.effects.length, 0);
    });
  }
});
test('failed durable admission prevents provider effects; failed outcome remains unknown', async () => {
  for (const outcome of [false, true]) {
    await withRetention(async ({ job, store, adapter }) => {
      const { plan } = await job.preview();
      let failed = false;
      store.flush = async () => {
        const ledger = await store.get(retentionLedgerId(1, 9));
        if (!failed && ledger?.status === (outcome ? 'partial' : 'pending')) {
          failed = true;
          throw new Error('Synthetic durable acknowledgement rejected');
        }
      };
      const result = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(result.last.status, outcome ? 'unknown' : 'refused');
      assert.equal(adapter.effects.length, outcome ? 1 : 0);
      assert.equal(isTombstone(await store.get('msg:vk:1')), false);
    });
  }
});
test('a failed local tombstone restores payload and manual continuation never repeats provider deletion', async () => {
  await withRetention(async ({ job, store, adapter }) => {
    let failed = false;
    store.flush = async () => {
      if (!failed && isTombstone(await store.get('msg:vk:2'))) {
        failed = true;
        throw new Error('Synthetic local write rejected');
      }
    };
    assert.equal((await runRetention(job)).last.status, 'refused');
    assert.equal(isTombstone(await store.get('msg:vk:2')), false);
    assert.equal((await runRetention(job)).last.status, 'confirmed');
    assert.equal(adapter.effects.length, 1);
    assert.equal(
      (await store.get(retentionLedgerId(1, 9))).localDone.length,
      3
    );
  });
});
test('causal tombstones recover an acknowledgement gap without losing original content or replaying provider writes', async () => {
  await withRetention(
    async ({ job, store, adapter }) => {
      let failed = false;
      store.flush = async () => {
        const ledger = await store.get(retentionLedgerId(1, 9));
        if (!failed && ledger?.localDone?.length === 3) {
          failed = true;
          throw new Error('Synthetic tombstone receipt gap');
        }
      };
      assert.equal((await runRetention(job)).last.status, 'refused');
      assert.equal(isTombstone(await store.get('msg:vk:3')), true);
      assert.equal((await runRetention(job)).last.status, 'confirmed');
      assert.equal(adapter.effects.length, 1);
      assert.equal((await store.get('msg:vk:3')).body, 'History 3');
      assert.equal(
        (await store.get(retentionLedgerId(1, 9))).localDone.length,
        3
      );
    },
    { store: withCausalWrites(createMemoryStore(), { actor: 'retention-gap' }) }
  );
});
test('owned job coalesces active operations and Stop drains a held rate wait without writes', async () => {
  let release;
  let entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  let hold = false;
  const adapter = retentionAdapter({
    live: {
      limiter: {
        wait: async () => {
          if (hold) {
            hold = false;
            entered();
            await new Promise((resolve) => {
              release = resolve;
            });
          }
        },
      },
    },
  });
  await withRetention(
    async ({ job }) => {
      const { plan } = await job.preview();
      hold = true;
      const first = job.run({ planId: plan.planId, confirm: true });
      assert.equal(job.run({ planId: plan.planId, confirm: true }), first);
      await waiting;
      let stopped = false;
      const close = job.stop().then(() => {
        stopped = true;
      });
      await Promise.resolve();
      assert.equal(stopped, false);
      release();
      await close;
      await first;
      assert.equal(adapter.effects.length, 0);
    },
    { adapter }
  );
});
