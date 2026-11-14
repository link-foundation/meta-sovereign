import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupGreetingFixture,
  groupScan,
  groupPlan,
  groupApply,
} from './helpers/group-greeting-fakes.mjs';
import { userOf, usersFinished } from './helpers/chat-users-fakes.mjs';
import { greetingGate } from './helpers/greeting-send-fakes.mjs';
import { messageAck } from './helpers/telegram-message-ack.mjs';

test('group scan accepts typed groups and supergroups, rejects users, channels and mismatched numeric peers', async () => {
  const f = await groupGreetingFixture();
  f.entities.set('-55', { className: 'Chat', id: 44n });
  for (const chat of ['@GreetingUser', '@GreetingChannel', '-55', '-10044']) {
    assert.equal(
      (await f.account.chatUsersGreetingsStart({ chat })).code,
      'group-required'
    );
  }
  for (const chat of ['@GreetingGroup', '-44', '@Supergroup', '-10045']) {
    const scan = await groupScan(f, { chat });
    assert.equal(scan.job.state, 'done');
    assert.equal(scan.job.options.messagesLimit, 0);
    assert.equal(scan.job.coverage.messages.disabled, true);
  }
  assert.equal(f.history(), 0);
  assert.equal(f.closed(), 4);
  assert.equal(f.sends().length, 0);
});
test('read-only preview excludes self, all requested flags and visibly configured business users', async () => {
  const flags = [
    'bot',
    'deleted',
    'fake',
    'scam',
    'support',
    'verified',
    'botBusiness',
  ];
  const participants = [
    userOf(1),
    ...flags.map((flag, i) => userOf(i + 4, { [flag]: true })),
    ...[20, 21, 22, 23, 24, 25, 26, 27].map((id) => userOf(id)),
  ];
  const fields = [
    'businessWorkHours',
    'businessLocation',
    'businessGreetingMessage',
    'businessAwayMessage',
    'businessIntro',
  ];
  const f = await groupGreetingFixture({
    participants,
    fullUser: async (id) => {
      if (id === '25') {
        throw new Error('read timeout');
      }
      if (id === '26') {
        return { fullUser: { className: 'UserFull', id: 999n } };
      }
      return {
        fullUser: {
          className: 'UserFull',
          id: BigInt(id),
          ...(+id < 25 ? { [fields[+id - 20]]: {} } : {}),
        },
      };
    },
  });
  const plan = await groupPlan(f);
  assert.equal(plan.selected, 1);
  assert.equal(plan.sample[0].id, '27');
  assert.deepEqual(plan.skipped, {
    self: 1,
    bot: 1,
    deleted: 1,
    fake: 1,
    scam: 1,
    support: 1,
    verified: 1,
    business: 6,
    'business-unavailable': 2,
  });
  assert.equal(f.sends().length, 0);
  assert.equal(plan.options.delayMs, 30_000);
  assert.equal(plan.options.limit, 0);
  assert.equal(Object.hasOwn(plan.sample[0], 'phone'), false);
});
test('participant bounds and forbidden membership retain truthful coverage without a history fallback', async () => {
  const limited = await groupGreetingFixture();
  const scan = await groupScan(limited, {
    participantsLimit: 1,
    messagesLimit: 99,
  });
  assert.equal(scan.users.length, 1);
  assert.equal(scan.job.coverage.participants.limited, true);
  assert.equal(scan.job.coverage.participants.complete, false);
  const f = await groupGreetingFixture({
    memberError: { errorMessage: 'CHAT_ADMIN_REQUIRED' },
  });
  const plan = await groupPlan(f);
  assert.equal(plan.selected, 0);
  assert.equal(plan.coverage.participants.error, 'CHAT_ADMIN_REQUIRED');
  assert.equal(plan.coverage.participants.complete, false);
  assert.equal(f.history(), 0);
});
test('one-use preview freezes recipients, per-recipient sticker IDs and options; acknowledgements drive progress', async () => {
  const f = await groupGreetingFixture();
  const select = f.context.greetingSticker;
  let selection = 0;
  f.context.greetingSticker = (c) => select(c, selection++ ? '22' : '11');
  const plan = await groupPlan(f, { delayMs: 123 });
  plan.sample[0].id = '999';
  plan.sample[0].sticker.id = '44';
  plan.options.delayMs = 0;
  assert.equal(
    (await f.account.chatUsersGreetingsApply({ planId: plan.planId })).code,
    'bad-request'
  );
  const result = await groupApply(f, plan);
  assert.equal(result.job.state, 'done');
  assert.deepEqual(result.job.counts, { sent: 2 });
  assert.equal(result.job.processed, 2);
  assert.deepEqual(
    f.sends().map((r) => String(r.peer.userId)),
    ['2', '3']
  );
  assert.deepEqual(
    f.sends().map((r) => String(r.media.id.id)),
    ['11', '22']
  );
  assert.deepEqual(f.waits, [123]);
  assert.ok(
    result.results.every(
      (row) => row.status === 'sent' && row.messageId === '1'
    )
  );
  assert.equal(
    (
      await f.account.chatUsersGreetingsApply({
        confirm: true,
        planId: plan.planId,
      })
    ).code,
    'preview-expired'
  );
});
test('preview expiry, new scans, owner changes and invalid options cannot authorize writes', async () => {
  let clock = 1_000_000;
  const f = await groupGreetingFixture({ now: () => clock });
  const plan = await groupPlan(f, { limit: 1, sticker: '11' });
  assert.equal(plan.selected, 1);
  assert.equal(plan.eligible, 2);
  clock += 300_001;
  assert.equal(
    (
      await f.account.chatUsersGreetingsApply({
        confirm: true,
        planId: plan.planId,
      })
    ).code,
    'preview-expired'
  );
  const old = await groupPlan(f);
  await groupScan(f);
  assert.equal(
    (
      await f.account.chatUsersGreetingsApply({
        confirm: true,
        planId: old.planId,
      })
    ).code,
    'preview-expired'
  );
  const next = await groupPlan(f);
  f.setOwner('99');
  const result = await groupApply(f, next);
  assert.equal(result.job.state, 'failed');
  assert.equal(result.job.code, 'account-changed');
  for (const options of [
    { limit: -1 },
    { delayMs: 3_600_001 },
    { sticker: 11 },
    { delayMs: '30' },
  ]) {
    assert.equal(
      (await f.account.chatUsersGreetingsPreview({ jobId: 'x', ...options }))
        .code,
      'bad-request'
    );
  }
  assert.equal(f.sends().length, 0);
});
test('group and individual greetings share rolling 24-hour deduplication across midnight and restart', async () => {
  let clock = Date.UTC(2026, 10, 10, 23, 59);
  const f = await groupGreetingFixture({ now: () => clock });
  const plan = await groupPlan(f, { limit: 1 });
  await groupApply(f, plan);
  clock += 120_000;
  f.account = f.createUsers();
  const fresh = await groupPlan(f);
  assert.equal(fresh.skipped['already-greeted'], 1);
  const single = await f.actions.greetingSendPreview({
    chat: '2',
    sticker: '11',
  });
  assert.equal(single.willSend, false);
  assert.equal(single.delivery.code, 'already-greeted');
  clock += 86_400_000;
  assert.equal((await groupPlan(f)).selected, 2);
});
test('missing acknowledgements stop the batch, create no sent progress and block replay after restart', async () => {
  const f = await groupGreetingFixture();
  const plan = await groupPlan(f);
  f.client.invoke = async (request) => {
    f.calls.push(request);
    return request.className === 'GetFullUser'
      ? { fullUser: { className: 'UserFull', id: request.id.userId } }
      : { updates: [] };
  };
  const result = await groupApply(f, plan);
  assert.equal(result.job.state, 'partial');
  assert.equal(result.job.processed, 1);
  assert.deepEqual(result.job.counts, { unknown: 1 });
  assert.equal(result.results[0].messageId, null);
  assert.equal(f.sends().length, 1);
  f.account = f.createUsers();
  const next = await groupPlan(f);
  assert.equal(next.skipped['previous-outcome-unknown'], 1);
  assert.equal(next.selected, 1);
});
test('an explicit RPC refusal stops the batch without retrying or counting a sent greeting', async () => {
  const f = await groupGreetingFixture();
  const plan = await groupPlan(f);
  const invoke = f.client.invoke;
  f.client.invoke = async (request) => {
    if (request.className !== 'SendMedia') {
      return invoke(request);
    }
    f.calls.push(request);
    throw Object.assign(new Error('private provider detail'), {
      errorMessage: 'FLOOD_WAIT_9',
      seconds: 9,
    });
  };
  const result = await groupApply(f, plan);
  assert.equal(result.job.state, 'partial');
  assert.deepEqual(result.job.counts, { failed: 1 });
  assert.equal(f.sends().length, 1);
  assert.equal(f.waits.length, 0);
});
test('eligibility and group identity are checked again immediately before every write', async () => {
  for (const changed of ['business', 'group']) {
    const f = await groupGreetingFixture();
    const plan = await groupPlan(f);
    const input = f.client.getInputEntity;
    let full = 0;
    f.client.getInputEntity = async (entity) => {
      full += 1;
      if (full === 1) {
        if (changed === 'business') {
          f.entities.get('2').verified = true;
        } else {
          f.entities.set('@GreetingGroup', { className: 'Chat', id: 99n });
        }
      }
      return input(entity);
    };
    const result = await groupApply(f, plan);
    assert.equal(result.job.state, 'partial');
    assert.equal(result.job.processed, 1);
    assert.equal(f.sends().length, 0);
  }
});
test('cancellation during the pacing wait prevents the next RPC and retains acknowledged progress', async () => {
  const entered = greetingGate();
  const release = greetingGate();
  const f = await groupGreetingFixture({
    sleep: async () => {
      entered.resolve();
      await release.promise;
    },
  });
  const plan = await groupPlan(f);
  await f.account.chatUsersGreetingsApply({
    confirm: true,
    planId: plan.planId,
  });
  try {
    await entered.promise;
    await f.account.chatUsersCancel();
  } finally {
    release.resolve();
  }
  const result = await usersFinished(f.account);
  assert.equal(result.job.state, 'cancelled');
  assert.deepEqual(result.job.counts, { sent: 1 });
  assert.equal(f.sends().length, 1);
});
test('shutdown waits for the active acknowledgement and records it without starting another recipient', async () => {
  const entered = greetingGate();
  const release = greetingGate();
  const f = await groupGreetingFixture();
  const invoke = f.client.invoke;
  f.client.invoke = async (request) => {
    if (request.className !== 'SendMedia') {
      return invoke(request);
    }
    f.calls.push(request);
    entered.resolve();
    await release.promise;
    return messageAck(request);
  };
  const plan = await groupPlan(f);
  await f.account.chatUsersGreetingsApply({
    confirm: true,
    planId: plan.planId,
  });
  await entered.promise;
  let stopped = false;
  const pending = f.env.chatUsersStop().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => globalThis.setImmediate(resolve));
  assert.equal(stopped, false);
  release.resolve();
  await pending;
  const result = await f.account.chatUsersStatus();
  assert.equal(result.job.state, 'cancelled');
  assert.deepEqual(result.job.counts, { sent: 1 });
  assert.equal(result.results[0].messageId, '1');
  assert.equal(f.sends().length, 1);
});
test('default pacing is 30 seconds and a sent result is persisted only after its durable acknowledgement', async () => {
  const f = await groupGreetingFixture();
  const plan = await groupPlan(f);
  const put = f.store.put.bind(f.store);
  let receipts = 0;
  f.store.put = async (link) => {
    if (link.kind === 'telegram-greeting-result' && link.status === 'sent') {
      const outbox = await f.store.get(link.outbox);
      assert.equal(outbox.status, 'sent');
      assert.equal(link.messageId, '1');
      receipts += 1;
    }
    return put(link);
  };
  await groupApply(f, plan);
  assert.equal(receipts, 2);
  assert.deepEqual(f.waits, [30_000]);
});
test('an intent storage failure sends nothing and stops the batch before the next user', async () => {
  const f = await groupGreetingFixture();
  const plan = await groupPlan(f);
  const put = f.store.put.bind(f.store);
  f.store.put = async (link) => {
    if (link.kind === 'telegram-greeting-intent') {
      throw new Error('storage failed');
    }
    return put(link);
  };
  const result = await groupApply(f, plan);
  assert.equal(result.job.state, 'partial');
  assert.deepEqual(result.job.counts, { failed: 1 });
  assert.equal(f.sends().length, 0);
});
