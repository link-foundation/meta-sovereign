import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  retentionPolicy,
  retentionPeerIds,
  retentionLedgerId,
} from '../src/automation/vk-retention-settings.js';
import { isTombstone } from '../src/storage/soft-delete.js';
import {
  withRetention,
  retentionAdapter,
  retentionJob,
  seedRetention,
  runRetention,
} from '../../experiments/issue-56/vk-retention-fixture.mjs';
test('retention starts disabled and validates explicit peers, thresholds and finite limits', async () => {
  const store = createMemoryStore();
  const defaults = await retentionPolicy.settings(store);
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.threshold, 1000);
  assert.deepEqual(
    retentionPeerIds('9,-10,2000000001,9'),
    [9, -10, 2000000001]
  );
  for (const patch of [
    { peers: '0' },
    { peers: '1,,2' },
    { peers: '2147483648' },
    { threshold: 2, scanLimit: 2 },
    { scanLimit: 10001 },
    { enabled: true },
    { limit: -1 },
    { enabled: 'true' },
  ]) {
    await assert.rejects(
      retentionPolicy.save(store, { ...defaults, ...patch })
    );
  }
  for (const settings of [
    { threshold: 3 },
    { limit: 0 },
    { priorityIds: [9] },
  ]) {
    await withRetention(
      async ({ job, adapter }) => {
        await runRetention(job);
        assert.equal(adapter.effects.length, 0);
      },
      { settings }
    );
  }
});
test('current conversation deletion confirms provider absence and only tombstones reviewed local messages', async () => {
  await withRetention(async ({ job, store, adapter }) => {
    await store.put({
      id: 'msg:vk:900',
      source: 'vk',
      chat: '9',
      body: 'Unreviewed local message',
    });
    await store.put({
      id: 'msg:telegram:1',
      source: 'telegram',
      chat: '9',
      body: 'Other provider',
    });
    const { plan } = await job.preview();
    assert.equal(plan.items[0].messages.length, 3);
    assert.equal(plan.items[0].local.length, 3);
    assert.equal(adapter.effects.length, 0);
    await assert.rejects(job.run({ planId: plan.planId }), /Confirm/);
    assert.equal(
      (await job.run({ planId: plan.planId, confirm: true })).last.status,
      'confirmed'
    );
    assert.deepEqual(
      adapter.effects.map((e) => e.method),
      ['conversation']
    );
    for (const id of [1, 2, 3]) {
      const row = await store.get(`msg:vk:${id}`);
      assert.equal(isTombstone(row), true);
      assert.equal(row.body, `History ${id}`);
    }
    assert.equal(isTombstone(await store.get('msg:vk:900')), false);
    assert.equal(isTombstone(await store.get('msg:telegram:1')), false);
    assert.equal((await job.preview()).plan.items[0].reason, 'belowThreshold');
  });
});
test('unsupported conversation deletion falls back to current cmids in bounded paced account-only batches', async () => {
  const pauses = [];
  await withRetention(
    async ({ job, adapter }) => {
      assert.equal((await runRetention(job)).last.status, 'confirmed');
      assert.deepEqual(
        adapter.effects.map((e) => e.ids.length),
        [103, 100, 3]
      );
      const calls = adapter.fake.calls.filter(
        (c) => c.name === 'messages.delete'
      );
      assert.ok(
        calls.every(
          (c) =>
            c.params.delete_for_all === '0' &&
            c.params.cmids &&
            !c.params.conversation_message_ids &&
            !c.params.message_ids
        )
      );
      assert.deepEqual(pauses, [2000, 2000]);
    },
    {
      adapter: retentionAdapter({ count: 103, fallback: true }),
      options: { sleep: async (ms) => pauses.push(ms) },
    }
  );
});
test('partial fallback survives causal Lino reopen and resumes only remaining original messages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vk-retention-'));
  const path = join(directory, 'state.lino');
  const open = async () => withCausalWrites(await createLinoTextStore(path));
  const adapter = retentionAdapter({
    count: 103,
    fallback: true,
    response: (_method, n) => (n === 3 ? 'refused' : undefined),
  });
  let store;
  let job;
  let now = Date.UTC(2026, 10, 15, 12);
  try {
    store = await open();
    await seedRetention(store, adapter, { enabled: true });
    job = retentionJob(store, adapter, { now: () => now });
    assert.equal((await runRetention(job)).last.status, 'refused');
    assert.equal(
      (await store.get(retentionLedgerId(1, 9))).deleted.length,
      100
    );
    assert.equal(isTombstone(await store.get('msg:vk:1')), false);
    await job.stop();
    await store.close();
    store = await open();
    now += 3600001;
    job = retentionJob(store, adapter, { now: () => now });
    assert.equal(
      (await job.run({ scheduled: true })).plan.items[0].reason,
      'manualReview'
    );
    assert.equal(adapter.effects.length, 3);
    assert.equal((await runRetention(job)).last.status, 'confirmed');
    assert.deepEqual(
      adapter.effects.map((e) => [e.method, e.ids.length]),
      [
        ['conversation', 103],
        ['messages', 100],
        ['messages', 3],
        ['messages', 3],
      ]
    );
    assert.equal(
      (await store.get(retentionLedgerId(1, 9))).localDone.length,
      103
    );
  } finally {
    await job?.stop();
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test('mixed per-message acknowledgements retain successes and never replay them', async () => {
  await withRetention(
    async ({ job, adapter, store }) => {
      assert.equal((await runRetention(job)).last.status, 'refused');
      const ledger = await store.get(retentionLedgerId(1, 9));
      assert.equal(ledger.deleted.length, 2);
      assert.equal((await runRetention(job)).last.status, 'confirmed');
      assert.deepEqual(
        adapter.effects.map((e) => e.ids.length),
        [3, 3, 1]
      );
    },
    {
      adapter: retentionAdapter({
        fallback: true,
        response: (_method, n) => (n === 2 ? 'mixed' : undefined),
      }),
    }
  );
});
test('unknown or invalid conversation replies never trigger fallback, local deletion or automatic replay', async () => {
  for (const response of ['unknown', 'invalid']) {
    await withRetention(
      async ({ job, adapter, store }) => {
        assert.equal((await runRetention(job)).last.status, 'unknown');
        assert.equal((await job.preview()).plan.items[0].reason, 'unknown');
        await runRetention(job);
        assert.equal(adapter.effects.length, 1);
        assert.equal(isTombstone(await store.get('msg:vk:1')), false);
      },
      { adapter: retentionAdapter({ response: () => response }) }
    );
  }
});
test('definite refusal has no fallback; contradictory acknowledgement cannot clear local history', async () => {
  for (const response of ['refused', 'ackOnly']) {
    await withRetention(
      async ({ job, adapter, store }) => {
        assert.equal((await runRetention(job)).last.status, 'refused');
        assert.equal(adapter.effects.length, 1);
        assert.equal(isTombstone(await store.get('msg:vk:1')), false);
        assert.equal(adapter.histories.get(9).length, 3);
      },
      { adapter: retentionAdapter({ response: () => response }) }
    );
  }
});
test('over-limit and incomplete or duplicated pages refuse bounded history without any write', async () => {
  await withRetention(
    async ({ job, adapter }) => {
      assert.equal((await job.preview()).plan.items[0].reason, 'incomplete');
      assert.equal(
        adapter.fake.calls.filter((c) => c.name === 'messages.getHistory')
          .length,
        1
      );
      assert.equal(adapter.effects.length, 0);
    },
    { adapter: retentionAdapter({ count: 201 }) }
  );
  for (const history of [
    { count: 3, items: [] },
    { count: 3, items: [{ id: 1 }] },
  ]) {
    await withRetention(
      async ({ job, adapter }) => {
        await assert.rejects(job.preview(), /Incomplete/);
        assert.equal(adapter.effects.length, 0);
      },
      {
        adapter: retentionAdapter({
          methods: { 'messages.getHistory': () => history },
        }),
      }
    );
  }
});
