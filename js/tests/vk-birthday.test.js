import {
  changePersonalConversation,
  assertPersonalReviewHeld,
} from '../../experiments/issue-56/vk-personal-admission.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { birthdayDecision } from '../src/automation/vk-birthday.js';
import {
  birthdayDate,
  birthdayMessages,
  vkBirthdaySettings,
} from '../src/automation/vk-birthday-settings.js';
import { reengageLedgerId } from '../src/automation/vk-reengage-settings.js';
import {
  withBirthdayJob,
  birthdayAdapter,
  birthdayJob,
} from '../../experiments/issue-56/vk-birthday-fixture.mjs';
import { runReengage } from '../../experiments/issue-56/vk-reengage-fixture.mjs';
import { cancelledNow } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';

test('birthday defaults are independent, disabled, bounded and validate owner catalogs', async () => {
  const store = createMemoryStore();
  const defaults = await vkBirthdaySettings.settings(store);
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.onlineOnly, false);
  assert.equal(defaults.timeZone, 'UTC');
  assert.equal(birthdayMessages.length, 10);
  for (const message of birthdayMessages) {
    assert.ok([...message.matchAll(/\p{Extended_Pictographic}/gu)].length <= 2);
  }
  for (const patch of [
    { timeZone: '' },
    { timeZone: 'Mars/Olympus' },
    { messages: 'x'.repeat(501) },
    { messages: Array(21).fill('x').join('\n') },
    { stickers: '0' },
    { stickers: '2147483648' },
    { stickers: '3,,4' },
    { attachments: 'https://vk.com/video1_2' },
    { messages: '', stickers: '', attachments: '' },
    { limit: -1 },
    { limit: 101 },
    { onlineOnly: 'false' },
  ]) {
    await assert.rejects(
      vkBirthdaySettings.save(store, { ...defaults, ...patch })
    );
  }
  await withBirthdayJob(
    async ({ job, adapter }) => {
      assert.equal((await runReengage(job)).last.status, 'confirmed');
      assert.equal(adapter.effects.length, 0);
    },
    { settings: { limit: 0 } }
  );
});
test('explicit calendar dates validate privacy, leap days, birth years and zone boundaries', () => {
  const now = Date.UTC(2028, 1, 29, 0, 30);
  const settings = { timeZone: 'UTC', onlineOnly: false };
  const state = {
    relation: 3,
    canWrite: true,
    messages: [],
    unreadCount: 0,
    markedUnread: false,
  };
  const decision = (birthday, at = now, zone = 'UTC') =>
    birthdayDecision(
      { ...state, birthday },
      { ...settings, timeZone: zone },
      null,
      at,
      birthdayDate(at, zone)
    );
  for (const value of ['29.2', '29.02.2000']) {
    assert.equal(decision(value), 'eligible');
  }
  for (const value of [
    '29.2.2001',
    '31.2',
    '0.2',
    '1.13',
    '29.2.2029',
    '29.2.extra',
    229,
  ]) {
    assert.equal(decision(value), 'birthdayInvalid', String(value));
  }
  assert.equal(decision(null), 'birthdayPrivate');
  assert.equal(decision('28.2'), 'notBirthday');
  assert.equal(decision('28.2', now, 'America/Los_Angeles'), 'eligible');
  assert.equal(
    birthdayDate(Date.UTC(2026, 11, 31, 23), 'Asia/Kolkata'),
    '2027-01-01'
  );
  assert.equal(
    birthdayDecision(
      { ...state, birthday: '29.2' },
      settings,
      null,
      now,
      '2028-02-28'
    ),
    'dateChanged'
  );
});
test('actual adapter acknowledges sticker then text with native media and retains canonical receipts and day dedup', async () => {
  await withBirthdayJob(
    async ({ job, adapter, store }) => {
      const { plan } = await job.preview();
      const item = plan.items[0];
      assert.equal(item.reason, 'eligible');
      assert.equal(item.cycle, '2026-11-15');
      assert.equal(item.steps.length, 2);
      assert.equal(adapter.effects.length, 0);
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'confirmed'
      );
      assert.deepEqual(
        adapter.effects.map((effect) => effect.text),
        ['', 'Owner birthday wishes']
      );
      assert.equal(adapter.effects[0].sticker, 60302);
      assert.equal(adapter.effects[1].audio, 'video1_23,photo-2_3_key');
      const ledger = await store.get(reengageLedgerId('birthday', 1, 9));
      assert.equal(ledger.status, 'confirmed');
      for (const step of ledger.steps) {
        const message = await store.get(`msg:vk:${step.receipt}`);
        assert.equal(message.body, step.text);
        if (step.attachments) {
          assert.deepEqual(
            message.attachments.map((a) => a.providerId),
            step.attachments
          );
        }
      }
      assert.equal((await job.preview()).plan.items[0].reason, 'cooldown');
      await runReengage(job);
      assert.equal(adapter.effects.length, 2);
    },
    {
      settings: {
        stickers: '60302',
        messages: 'Owner birthday wishes',
        attachments: 'video1_23,photo-2_3_key',
      },
    }
  );
});
test('private, malformed and other-date birthdays and recent or unsafe conversations stay held', async () => {
  for (const change of [
    'private',
    'malformed',
    'otherDate',
    'recent',
    'unread',
    'permission',
    'relation',
    'protected',
    'optOut',
    'offline',
  ]) {
    await withBirthdayJob(async ({ job, adapter, store, policy }) => {
      if (change === 'private') {
        adapter.birthdays.delete(9);
      }
      if (change === 'malformed') {
        adapter.birthdays.set(9, '31.11');
      }
      if (change === 'otherDate') {
        adapter.birthdays.set(9, '16.11');
      }
      await changePersonalConversation(change, { adapter, store, policy });
      await assertPersonalReviewHeld(job, adapter, runReengage, change);
    });
  }
});
test('birthday messages support empty history, sticker-only and native-media-only variants', async () => {
  for (const settings of [
    { stickers: '60302', messages: '' },
    { messages: '', attachments: 'audio-1_23' },
    { messages: 'Happy birthday' },
  ]) {
    await withBirthdayJob(
      async ({ job, adapter }) => {
        adapter.histories.set(9, []);
        assert.equal((await runReengage(job)).last.status, 'confirmed');
        assert.equal(adapter.effects.length, 1);
      },
      { settings }
    );
  }
});
test('definite partial birthday delivery resumes original remaining payload through causal Lino restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vk-birthday-'));
  let store;
  let job;
  const open = async () =>
    withCausalWrites(await createLinoTextStore(join(directory, 'state.lino')), {
      actor: 'birthday-fixture',
    });
  const adapter = birthdayAdapter({
    response: (_effect, count) => (count === 2 ? 'refused' : 'confirmed'),
  });
  try {
    store = await open();
    await vkBirthdaySettings.save(store, {
      ...(await vkBirthdaySettings.settings(store)),
      stickers: '60302',
      messages: 'Owner text',
      attachments: 'video1_23',
    });
    job = birthdayJob(store, adapter);
    const { plan } = await job.preview();
    const first = plan.items[0];
    assert.equal(
      (await job.run({ planId: plan.planId, confirm: true })).last.status,
      'refused'
    );
    assert.equal(
      (await store.get(reengageLedgerId('birthday', 1, 9))).status,
      'partial'
    );
    await job.stop();
    await store.close();
    store = await open();
    job = birthdayJob(store, adapter);
    const resumed = (await job.preview()).plan.items[0];
    assert.equal(resumed.reason, 'eligible');
    assert.equal(resumed.resumed, true);
    assert.deepEqual(
      resumed.steps.map(({ receipt: _receipt, ...step }) => step),
      first.steps
    );
    assert.equal((await runReengage(job)).last.status, 'confirmed');
    assert.deepEqual(
      adapter.effects.map((e) => e.sticker),
      [60302, 0, 0]
    );
  } finally {
    await job?.stop();
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test('unknown and nonpositive acknowledgements never replay, including after review', async () => {
  for (const response of ['unknown', 'unconfirmed']) {
    await withBirthdayJob(async ({ job, adapter }) => {
      adapter.mode(response);
      assert.equal((await runReengage(job)).last.status, 'unknown');
      adapter.mode('confirmed');
      assert.equal((await job.preview()).plan.items[0].reason, 'unknown');
      await runReengage(job);
      assert.equal(adapter.effects.length, 1);
    });
  }
});
test('a completed greeting remains deduplicated with old history and can run next year without repeating the last text', async () => {
  let now = cancelledNow;
  await withBirthdayJob(
    async ({ store, adapter, job }) => {
      assert.equal((await runReengage(job)).last.status, 'confirmed');
      const first = adapter.effects[0].text;
      adapter.histories.set(9, []);
      const retained = (await job.preview()).plan.items[0];
      assert.equal(retained.reason, 'cooldown');
      assert.equal(retained.steps[0].text, first);
      assert.ok(retained.steps[0].receipt > 0);
      now = Date.UTC(2027, 10, 15, 12);
      adapter.now(now);
      assert.equal((await runReengage(job)).last.status, 'confirmed');
      assert.notEqual(adapter.effects[1].text, first);
      assert.equal(
        (await store.get(reengageLedgerId('birthday', 1, 9))).cycle,
        '2027-11-15'
      );
    },
    { settings: { messages: 'One\nTwo' }, now: () => now }
  );
});
test('duplicate catalog lines still select a nonempty greeting next year with bounded selection', async () => {
  let now = cancelledNow;
  await withBirthdayJob(
    async ({ adapter, job }) => {
      await runReengage(job);
      now = Date.UTC(2027, 10, 15, 12);
      adapter.now(now);
      await runReengage(job);
      assert.deepEqual(
        adapter.effects.map((e) => e.text),
        ['One', 'One']
      );
    },
    { settings: { messages: 'One\nOne' }, now: () => now }
  );
});
