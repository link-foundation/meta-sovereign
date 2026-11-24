import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { saveVkCancelled } from '../src/automation/vk-cancelled.js';
import {
  cancelledLedgerId,
  readVkCancelledSettings,
} from '../src/automation/vk-cancelled-settings.js';
import { saveVkMaintenance } from '../src/automation/vk-maintenance.js';
import { saveSettings } from '../src/automation/safety.js';
import {
  cancelledNow,
  cancelledAdapter,
  cancelledJob,
  withCancelledJob,
  runCancelledReview,
} from '../../experiments/issue-56/vk-cancelled-fixture.mjs';

test('friendship follow-up starts off, reviews honest evidence and protects priority/opt-out accounts', async () => {
  await withCancelledJob(async ({ store, job, adapter }) => {
    assert.equal((await job.run({ scheduled: true })).skipped, 'not-due');
    await saveVkMaintenance(store, 'cleanup', {
      enabled: false,
      everyMinutes: 30,
      limit: 10,
      priorityIds: [9],
    });
    await saveSettings(store, { optOut: [{ source: 'vk', chat: '11' }] });
    const plan = (await job.preview()).plan;
    assert.deepEqual(
      plan.items.map((row) => row.reason),
      ['protected', 'optedOut']
    );
    assert.ok(plan.items.every((row) => row.evidence === 'outgoing-only'));
    await assert.rejects(job.run({ planId: plan.planId }), /Confirm/);
    await job.run({ planId: plan.planId, confirm: true });
    assert.deepEqual(adapter.effects, []);
  });
});

test(
  'one acknowledged greeting/question survives durable reopen and records the actual message in chat',
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vk-cancelled-'));
    const adapter = cancelledAdapter({ ids: [9] });
    let store;
    let job;
    try {
      for (let run = 0; run < 2; run++) {
        store = await createLinoTextStore(join(directory, 'state.lino'));
        job = cancelledJob(store, adapter);
        const plan = (await job.preview()).plan;
        assert.equal(
          plan.items[0].reason,
          run ? 'alreadyPrompted' : 'eligible'
        );
        await job.run({ planId: plan.planId, confirm: true });
        const record = await store.get(cancelledLedgerId(1, 9, 'prompt'));
        assert.equal(record.status, 'confirmed');
        assert.equal(
          (await store.get(`msg:vk:${record.messageId}`)).body,
          'Hello!\nWould you like to stay in touch?'
        );
        assert.equal(
          (await store.get('outbox:vk-cancelled:1:9:once')).status,
          'sent'
        );
        assert.equal(
          (await store.get('outbox:vk-cancelled:1:9:once')).sequence.step,
          'greeting-and-question'
        );
        await job.stop();
        await store.close();
        job = store = null;
      }
      assert.equal(adapter.effects.length, 1);
      assert.ok(Number(adapter.effects[0].randomId) > 0);
    } finally {
      await job?.stop();
      await store?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test('legacy outgoing questions suppress repeats, incoming lookalikes do not and blocking needs separate consent', async () => {
  for (const mode of [
    'legacy',
    'incoming',
    'unwritable',
    'unwritable-consent',
    'unanswered',
    'answered',
    'too-soon',
  ]) {
    await withCancelledJob(
      async ({ store, job, adapter }) => {
        if (mode !== 'unwritable' && mode !== 'unwritable-consent') {
          adapter.addMessage(9, 'Почему не хочешь больше дружить?', {
            out: mode === 'incoming' ? 0 : 1,
            date:
              Math.floor(cancelledNow / 1000) -
              (mode === 'too-soon' ? 100 : 3 * 86400),
          });
        } else {
          adapter.canWrite.set(9, false);
        }
        if (mode === 'answered') {
          adapter.addMessage(9, 'Yes, let us talk.', { out: 0 });
        }
        if (
          ['unwritable-consent', 'unanswered', 'answered', 'too-soon'].includes(
            mode
          )
        ) {
          await saveVkCancelled(store, {
            ...(await readVkCancelledSettings(store)),
            blockUnanswered: true,
            blockUnwritable: true,
          });
        }
        await runCancelledReview(job);
        assert.deepEqual(
          adapter.effects.map((row) => row.action),
          ['unwritable-consent', 'unanswered'].includes(mode)
            ? ['block']
            : mode === 'incoming'
              ? ['prompt']
              : []
        );
        const next = (await job.preview()).plan.items[0];
        if (adapter.effects[0]?.action === 'block') {
          assert.equal(next.reason, 'alreadyBlocked');
        }
      },
      { adapter: cancelledAdapter({ ids: [9] }) }
    );
  }
});

test('lost and unconfirmed receipts suppress prompt/block replay, definite refusals stay distinct', async () => {
  for (const action of ['prompt', 'block']) {
    for (const mode of ['unknown', 'unconfirmed', 'refused']) {
      await withCancelledJob(
        async ({ job, adapter }) => {
          if (action === 'block') {
            adapter.canWrite.set(9, false);
          }
          adapter.mode(mode);
          const result = await runCancelledReview(job);
          assert.equal(
            result.last.status,
            mode === 'refused' ? 'refused' : 'unknown'
          );
          const next = (await job.preview()).plan.items[0];
          assert.equal(
            next.reason,
            mode === 'refused' ? 'eligible' : 'unknown'
          );
          if (mode !== 'refused') {
            await job.run({
              planId: (await job.preview()).plan.planId,
              confirm: true,
            });
          }
          assert.equal(adapter.effects.length, 1);
        },
        {
          adapter: cancelledAdapter({ ids: [9] }),
          settings: { blockUnwritable: true },
        }
      );
    }
  }
});

test('changed history, permission, identity, relationship, saved text, time and opt-out refuse reviewed effects', async () => {
  const mutations = {
    history: ({ adapter }) => adapter.addMessage(9, 'A new reply', { out: 0 }),
    permission: ({ adapter }) => adapter.canWrite.set(9, false),
    account: ({ adapter }) => adapter.account(2),
    relationship: ({ adapter }) => adapter.relations.set(9, 3),
    text: async ({ store }) =>
      saveVkCancelled(store, {
        ...(await readVkCancelledSettings(store)),
        question: 'Changed question',
      }),
    optout: ({ store }) =>
      saveSettings(store, { optOut: [{ source: 'vk', chat: '9' }] }),
    expired: ({ time }) => {
      time.value += 300001;
    },
    backwards: ({ time }) => {
      time.value -= 1;
    },
  };
  for (const [mode, mutate] of Object.entries(mutations)) {
    const time = { value: cancelledNow };
    await withCancelledJob(
      async (fixture) => {
        const plan = (await fixture.job.preview()).plan;
        await mutate({ ...fixture, time });
        const result = await fixture.job.run({
          planId: plan.planId,
          confirm: true,
        });
        assert.equal(result.last.status, 'refused', mode);
        assert.deepEqual(fixture.adapter.effects, [], mode);
      },
      { adapter: cancelledAdapter({ ids: [9] }), now: () => time.value }
    );
  }
});

test('complete bounded history and exact native receipt validation never use partial or malformed evidence', async () => {
  for (const mode of [
    'limit',
    'duplicate',
    'foreign',
    'changed-total',
    'tail',
    'future',
  ]) {
    let page = 0;
    const adapter = cancelledAdapter({
      ids: [9],
      methods:
        mode === 'future'
          ? {}
          : {
              'messages.getHistory': () => {
                page++;
                const message = {
                  id: 10,
                  peer_id: mode === 'foreign' ? 11 : 9,
                  from_id: 9,
                  out: 0,
                  date: 1,
                  text: 'Message',
                };
                if (mode === 'limit') {
                  return { count: 1001, items: [] };
                }
                if (mode === 'changed-total') {
                  return { count: page === 1 ? 2 : 3, items: [message] };
                }
                return {
                  count: mode === 'duplicate' ? 2 : 1,
                  items: mode === 'duplicate' ? [message, message] : [message],
                };
              },
            },
    });
    if (mode === 'future') {
      adapter.addMessage(9, 'Future', {
        date: Math.floor(cancelledNow / 1000) + 1,
      });
    }
    await withCancelledJob(
      async ({ job }) => {
        if (['limit', 'future'].includes(mode)) {
          assert.equal(
            (await job.preview()).plan.items[0].reason,
            mode === 'limit' ? 'historyLimit' : 'futureHistory'
          );
          await runCancelledReview(job);
        } else {
          await assert.rejects(job.preview(), /Incomplete/);
        }
        assert.deepEqual(adapter.effects, []);
      },
      { adapter }
    );
  }
});

test('a refused durable intent prevents issue and a refused outcome leaves pending uncertainty', async () => {
  for (const mode of ['intent', 'outcome']) {
    await withCancelledJob(
      async ({ store, adapter, job }) => {
        const plan = (await job.preview()).plan;
        store.flush = async () => {
          const record = await store.get(cancelledLedgerId(1, 9, 'prompt'));
          if (
            record?.status === (mode === 'intent' ? 'pending' : 'confirmed')
          ) {
            throw new Error('Fixture durable follow-up write refused');
          }
        };
        const result = await job
          .run({ planId: plan.planId, confirm: true })
          .catch((error) => error);
        assert.ok(result instanceof Error || result.last.status === 'refused');
        assert.equal(adapter.effects.length, mode === 'intent' ? 0 : 1);
        if (mode === 'outcome') {
          assert.equal(
            (await store.get(cancelledLedgerId(1, 9, 'prompt'))).status,
            'pending'
          );
        }
      },
      { adapter: cancelledAdapter({ ids: [9] }) }
    );
  }
});
