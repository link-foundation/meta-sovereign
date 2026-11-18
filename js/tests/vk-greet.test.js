import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import {
  vkGreetSettings,
  greetLedgerId,
} from '../src/automation/vk-greet-settings.js';
import { saveSettings } from '../src/automation/safety.js';
import { cancelledNow } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';
import {
  withGreetJob,
  greetAdapter,
  greetJob,
  runGreet,
} from '../../experiments/issue-56/vk-greet-fixture.mjs';

test('live filters hold offline, unread, unwritable, recent, non-friend and protected candidates', async () => {
  const ids = [9, 11, 13, 15, 17, 19, 21];
  const adapter = greetAdapter({ ids });
  adapter.online.set(9, 0);
  adapter.unread.set(11, 1);
  adapter.canWrite.set(13, false);
  adapter.addMessage(15, 'recent', { out: 0 });
  adapter.relations.set(17, 1);
  await withGreetJob(
    async ({ job, store }) => {
      await saveSettings(store, { optOut: [{ source: 'vk', chat: '21' }] });
      assert.equal((await job.run({ scheduled: true })).skipped, 'not-due');
      const { plan } = await job.preview();
      assert.deepEqual(
        Object.fromEntries(
          plan.items.map((item) => [item.userId, item.reason])
        ),
        {
          9: 'offline',
          11: 'unread',
          13: 'unwritable',
          15: 'recent',
          17: 'changed',
          19: 'protected',
          21: 'optedOut',
        }
      );
      await assert.rejects(job.run({ planId: plan.planId }), /Confirm/);
      await job.run({ planId: plan.planId, confirm: true });
      assert.equal(adapter.effects.length, 0);
    },
    { adapter, settings: { priorityIds: [19] } }
  );
});

test('empty-first oldest ordering, optional total-friend ordering and finite scan/action limits', async () => {
  const adapter = greetAdapter();
  adapter.addMessage(9, 'old', { date: cancelledNow / 1000 - 60 * 86400 });
  adapter.addMessage(11, 'older', { date: cancelledNow / 1000 - 90 * 86400 });
  adapter.counts.set(9, 900);
  await withGreetJob(
    async ({ job, store }) => {
      let result = await job.preview();
      assert.deepEqual(
        result.plan.items.map((item) => item.userId),
        [13, 11, 9]
      );
      assert.deepEqual(
        result.plan.items.map((item) => item.reason),
        ['eligible', 'runLimit', 'runLimit']
      );
      await vkGreetSettings.save(store, {
        ...result.settings,
        orderByFriends: true,
      });
      result = await job.preview();
      assert.deepEqual(
        result.plan.items.map((item) => item.userId),
        [9, 11, 13]
      );
      await vkGreetSettings.save(store, {
        ...result.settings,
        emptyOnly: true,
        scanLimit: 2,
      });
      result = await job.preview();
      assert.equal(result.plan.inspected, 2);
      assert.ok(
        result.plan.items.every((item) => item.reason === 'hasHistory')
      );
    },
    { adapter, settings: { limit: 1 } }
  );
});

test(
  'acknowledged greeting, native chat receipt and cooldown survive durable reopen',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-greet-'));
    const adapter = greetAdapter({ ids: [9] });
    let store, job;
    try {
      for (let run = 0; run < 2; run++) {
        store = await createLinoTextStore(join(dir, 'state.lino'));
        job = greetJob(store, adapter);
        const { plan } = await job.preview();
        assert.equal(plan.items[0].reason, run ? 'cooldown' : 'eligible');
        await job.run({ planId: plan.planId, confirm: true });
        const record = await store.get(greetLedgerId(1, 9));
        assert.equal(record.status, 'confirmed');
        assert.equal(
          (await store.get(`msg:vk:${record.messageId}`)).body,
          'Hello!'
        );
        await job.stop();
        await store.close();
        job = store = null;
      }
      assert.equal(adapter.effects.length, 1);
    } finally {
      await job?.stop();
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('a later reviewed greeting is possible only after both silence and per-person cooldown', async () => {
  let now = cancelledNow;
  await withGreetJob(
    async ({ job, store, adapter }) => {
      await runGreet(job);
      now += 2 * 86400000;
      assert.equal((await job.preview()).plan.items[0].reason, 'recent');
      now += 30 * 86400000;
      adapter.now(now);
      await runGreet(job);
      assert.equal(adapter.effects.length, 2);
      assert.equal(
        (await store.query((r) => r.id.startsWith('outbox:vk-greet:'))).length,
        2
      );
    },
    { adapter: greetAdapter({ ids: [9] }), now: () => now }
  );
});

test('refused, unknown and invalid native acknowledgements retain distinct durable outcomes without replay', async () => {
  for (const mode of ['refused', 'unknown', 'unconfirmed']) {
    const adapter = greetAdapter({ ids: [9] });
    adapter.mode(mode);
    await withGreetJob(
      async ({ job, store }) => {
        const result = await runGreet(job);
        assert.equal(
          result.last.status,
          mode === 'refused' ? 'refused' : 'unknown'
        );
        const ledger = await store.get(greetLedgerId(1, 9));
        assert.equal(ledger.status, result.last.status);
        if (mode !== 'refused') {
          await runGreet(job);
          assert.equal(adapter.effects.length, 1);
        }
      },
      { adapter }
    );
  }
});

test('malformed or partial history never authorizes a greeting and zero limit issues nothing', async () => {
  const adapter = greetAdapter({ ids: [9] });
  for (let i = 0; i < 1001; i++) {
    adapter.addMessage(9, 'old', { date: cancelledNow / 1000 - 60 * 86400 });
  }
  await withGreetJob(
    async ({ job, store }) => {
      assert.equal((await job.preview()).plan.items[0].reason, 'historyLimit');
      await runGreet(job);
      await vkGreetSettings.save(store, {
        ...(await vkGreetSettings.settings(store)),
        limit: 0,
      });
      assert.equal((await job.preview()).plan.items.length, 0);
      assert.equal(adapter.effects.length, 0);
    },
    { adapter }
  );
});

test('a reviewed sticker replaces text and stores the acknowledged native Chat receipt', async () => {
  await withGreetJob(
    async ({ job, store, adapter }) => {
      const { plan } = await job.preview();
      assert.equal(plan.items[0].sticker, 123);
      assert.equal(plan.items[0].text, null);
      const result = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(result.last.status, 'confirmed');
      assert.equal(adapter.effects[0].text, null);
      assert.equal(adapter.effects[0].stickerId, 123);
      const receipt = await store.get(greetLedgerId(1, 9));
      const message = await store.get(`msg:vk:${receipt.messageId}`);
      assert.deepEqual(message.sticker, { id: '123' });
      assert.equal((await job.preview()).plan.items[0].reason, 'cooldown');
    },
    {
      adapter: greetAdapter({ ids: [9] }),
      settings: { stickerId: 123, message: '' },
    }
  );
});
