import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import {
  reengageKinds,
  vkReengageSettings,
  reengageLedgerId,
} from '../src/automation/vk-reengage-settings.js';
import {
  withReengageJob,
  reengageAdapter,
  reengageJob,
  runReengage,
} from '../../experiments/issue-56/vk-reengage-fixture.mjs';
import { cancelledNow } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';
import { saveSettings } from '../src/automation/safety.js';

test('three disabled independent policies validate catalogs, payload and strict limits', async () => {
  for (const kind of reengageKinds) {
    await withReengageJob(kind, async ({ store, policy, job, adapter }) => {
      const defaults = await policy.settings(store);
      assert.equal(defaults.enabled, false);
      assert.equal(defaults.staleDays, kind === 'topic' ? 7 : 31);
      for (const input of [
        { questions: '' },
        { questions: 'x'.repeat(501) },
        { questions: Array(21).fill('Question').join('\n') },
        { staleDays: 0 },
        { limit: 101 },
        { onlineOnly: 'yes' },
        { greeting: '', stickerId: 0 },
        ...(kind === 'music'
          ? [
              { audio: 'https://vk.com/audio-1_23' },
              { enabled: true, audio: '' },
            ]
          : []),
      ]) {
        await assert.rejects(policy.save(store, { ...defaults, ...input }));
      }
      await policy.save(store, { ...defaults, limit: 0 });
      assert.equal((await runReengage(job)).last.status, 'confirmed');
      assert.equal(adapter.effects.length, 0);
    });
  }
});
test('actual VK adapter retains ordered native receipts, attachment identity and canonical Chat records', async () => {
  for (const kind of reengageKinds) {
    await withReengageJob(kind, async ({ job, adapter, store }) => {
      const { plan } = await job.preview();
      const item = plan.items[0];
      assert.equal(item.reason, 'eligible');
      assert.equal(adapter.effects.length, 0);
      const result = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(result.last.status, 'confirmed');
      assert.deepEqual(
        adapter.effects.map(({ text, audio, sticker }) => ({
          text,
          audio,
          sticker,
        })),
        item.steps.map((step) => ({
          text: step.text,
          audio: step.audio ?? null,
          sticker: step.sticker ?? 0,
        }))
      );
      assert.equal(
        new Set(adapter.effects.map((step) => step.randomId)).size,
        item.steps.length
      );
      const ledger = await store.get(reengageLedgerId(kind, 1, 9));
      assert.equal(ledger.status, 'confirmed');
      for (const step of ledger.steps) {
        const message = await store.get(`msg:vk:${step.receipt}`);
        assert.equal(message.sender, 'me');
        assert.equal(message.body, step.text);
        if (step.audio) {
          assert.equal(message.attachments[0].providerId, step.audio);
        }
      }
      assert.equal((await job.preview()).plan.items[0].reason, 'cooldown');
      await runReengage(job);
      assert.equal(adapter.effects.length, item.steps.length);
    });
  }
});
test('nonempty history, minimum silence, online, consent and write filters hold before review', async () => {
  for (const change of [
    'empty',
    'recent',
    'offline',
    'unread',
    'permission',
    'relation',
    'optOut',
    'protected',
    'future',
    'service',
    'attachment',
    'overflow',
  ]) {
    await withReengageJob('music', async ({ adapter, store, job, policy }) => {
      if (change === 'empty') {
        adapter.histories.set(9, []);
      }
      if (change === 'recent') {
        adapter.addMessage(9, 'Recent', { out: 0 });
      }
      if (change === 'offline') {
        adapter.online.set(9, 0);
      }
      if (change === 'unread') {
        adapter.unread.set(9, 1);
      }
      if (change === 'permission') {
        adapter.canWrite.set(9, false);
      }
      if (change === 'relation') {
        adapter.relations.set(9, 1);
      }
      if (change === 'optOut') {
        await saveSettings(store, { optOut: [{ source: 'vk', chat: '9' }] });
      }
      if (change === 'protected') {
        await policy.save(store, {
          ...(await policy.settings(store)),
          priorityIds: [9],
        });
      }
      if (change === 'future') {
        adapter.addMessage(9, 'Future', {
          date: Math.floor(cancelledNow / 1000) + 1,
        });
      }
      if (change === 'service') {
        adapter.histories.get(9)[0].action = { type: 'chat_create' };
      }
      if (change === 'attachment') {
        adapter.histories.get(9)[0].attachments = [
          { type: 'audio', audio: { id: 23 } },
        ];
      }
      if (change === 'overflow') {
        for (let index = 0; index < 1000; index++) {
          adapter.addMessage(9, 'Earlier', {
            date: Math.floor(cancelledNow / 1000) - 40 * 86400,
          });
        }
      }
      if (change === 'attachment') {
        await assert.rejects(job.preview(), /attachment identity/);
      } else {
        assert.notEqual(
          (await job.preview()).plan.items[0].reason,
          'eligible',
          change
        );
        await runReengage(job);
      }
      assert.equal(adapter.effects.length, 0, change);
    });
  }
});
test('definite partial delivery resumes only original remaining steps after explicit review and durable restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vk-sequence-'));
  let store;
  let job;
  try {
    store = withCausalWrites(
      await createLinoTextStore(join(directory, 'state.lino'))
    );
    const adapter = reengageAdapter({
      response: (_effect, number) => (number === 2 ? 'refused' : 'confirmed'),
    });
    await vkReengageSettings.music.save(store, {
      ...(await vkReengageSettings.music.settings(store)),
      audio: 'audio-1_23',
      enabled: true,
    });
    job = reengageJob('music', store, adapter);
    const first = await runReengage(job);
    assert.equal(first.last.status, 'refused');
    const partial = await store.get(reengageLedgerId('music', 1, 9));
    assert.equal(partial.status, 'partial');
    assert.ok(partial.steps[0].receipt);
    await job.stop();
    await store.close();
    store = withCausalWrites(
      await createLinoTextStore(join(directory, 'state.lino'))
    );
    job = reengageJob('music', store, adapter, {
      now: () => cancelledNow + 1200000,
    });
    assert.equal(
      (await job.run({ scheduled: true })).plan.items[0].reason,
      'manualReview'
    );
    assert.equal(adapter.effects.length, 2);
    const review = await job.preview();
    assert.equal(review.plan.items[0].resumed, true);
    assert.equal(review.plan.items[0].reason, 'eligible');
    assert.deepEqual(review.plan.items[0].steps, partial.steps);
    assert.equal(
      (await job.run({ planId: review.plan.planId, confirm: true })).last
        .status,
      'confirmed'
    );
    assert.deepEqual(
      adapter.effects.map((step) => step.text),
      ['Hello!', '', '', 'What do you think of this music?']
    );
    assert.equal(adapter.effects[1].randomId, adapter.effects[2].randomId);
  } finally {
    await job?.stop();
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test('lost or unconfirmed receipts retain uncertainty without replay through new reviews', async () => {
  for (const mode of ['unknown', 'unconfirmed']) {
    await withReengageJob('music', async ({ adapter, job, store }) => {
      adapter.mode(mode);
      assert.equal((await runReengage(job)).last.status, 'unknown');
      assert.equal(
        (await store.get(reengageLedgerId('music', 1, 9))).status,
        'unknown'
      );
      adapter.mode('confirmed');
      assert.equal((await job.preview()).plan.items[0].reason, 'unknown');
      await runReengage(job);
      assert.equal(adapter.effects.length, 1);
    });
  }
});
test('new replies, edits, online and permission changes between steps stop delivery and cannot be erased by continuation', async () => {
  for (const change of [
    'reply',
    'edit',
    'attachment',
    'permission',
    'online',
    'token',
    'time',
    'consent',
    'settings',
    'receipt',
    'receiptText',
    'receiptAudio',
    'receiptChat',
  ]) {
    let mutate = async () => {};
    let token = 'fixture-user-token';
    let now = cancelledNow;
    await withReengageJob(
      'music',
      async ({ job, store, adapter, policy }) => {
        mutate = async () => {
          if (change === 'reply') {
            adapter.addMessage(9, 'A new reply', { out: 0 });
          }
          if (change === 'edit') {
            adapter.histories.get(9)[0].text = 'Owner edit';
          }
          if (change === 'attachment') {
            adapter.histories.get(9)[0].attachments = [
              { type: 'audio', audio: { owner_id: -1, id: 99 } },
            ];
          }
          if (change === 'permission') {
            adapter.canWrite.set(9, false);
          }
          if (change === 'online') {
            adapter.online.set(9, 0);
          }
          if (change === 'token') {
            token = 'changed-token';
          }
          if (change === 'time') {
            now += 300001;
          }
          if (change === 'consent') {
            await saveSettings(store, {
              optOut: [{ source: 'vk', chat: '9' }],
            });
          }
          if (change === 'settings') {
            await policy.save(store, {
              ...(await policy.settings(store)),
              questions: 'Changed question',
            });
          }
          if (change.startsWith('receipt')) {
            const rows = await store.query((row) =>
              row.id.startsWith('outbox:vk-music:')
            );
            const row = rows[0];
            const patch = {
              receipt: { vkReceipt: null },
              receiptText: { text: 'Edited receipt' },
              receiptAudio: {
                attachments: [{ kind: 'audio', providerId: 'audio-1_99' }],
              },
              receiptChat: { vkReceipt: { ...row.vkReceipt, chat: '10' } },
            }[change];
            await store.put({ ...row, ...patch });
          }
        };
        const result = await runReengage(job);
        assert.equal(result.last.status, 'refused', change);
        assert.equal(adapter.effects.length, 1, change);
        const review = await job.preview();
        if (change === 'time') {
          // A fresh explicit review may renew an expired review of unchanged
          // history. It still resumes only the original remaining steps.
          assert.equal(review.plan.items[0].reason, 'eligible');
          await runReengage(job);
          assert.equal(adapter.effects.length, 3);
          return;
        }
        assert.notEqual(review.plan.items[0].reason, 'eligible', change);
        await runReengage(job);
        assert.equal(adapter.effects.length, 1, change);
      },
      {
        optionsFor: async () => ({ token }),
        now: () => now,
        sleep: async () => {
          const current = mutate;
          mutate = async () => {};
          await current();
        },
      }
    );
  }
});
test('sticker greeting is distinct from configured text and music retains three ordered effects', async () => {
  await withReengageJob(
    'music',
    async ({ job, adapter }) => {
      assert.equal((await runReengage(job)).last.status, 'confirmed');
      assert.deepEqual(
        adapter.effects.map((step) => [step.sticker, step.audio, step.text]),
        [
          [512, null, ''],
          [0, 'audio-1_23', ''],
          [0, null, 'Question one'],
        ]
      );
    },
    { settings: { stickerId: 512, questions: 'Question one' } }
  );
});
