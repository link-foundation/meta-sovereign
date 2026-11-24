import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingSendRequest } from '../src/sources/telegram-greeting-target.js';
import { resolveOutbox } from '../src/automation/outbox.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { messageAck } from './helpers/telegram-message-ack.mjs';
import {
  greetingSendFixture,
  greetingGate,
} from './helpers/greeting-send-fakes.mjs';

const preview = (fixture, patch = {}) =>
  fixture.actions.greetingSendPreview({
    chat: '@GreetingUser',
    sticker: '11',
    ...patch,
  });
const apply = (fixture, plan, patch = {}) =>
  fixture.actions.greetingSendApply({
    planId: plan.planId,
    confirm: true,
    ...patch,
  });

test('validates exact targets, operations and greeting document IDs before connection', () => {
  for (const body of [
    {},
    { chat: 'two words' },
    { chat: '8', operation: 'erase' },
    { chat: '9', operation: 'bot-start', sticker: '11' },
    { chat: '8', sticker: 11 },
    { chat: '8', sticker: '0' },
  ]) {
    assert.equal(greetingSendRequest(body), null);
  }
  assert.deepEqual(
    greetingSendRequest({ chat: 'https://t.me/GreetingUser', sticker: '11' }),
    { chat: '@GreetingUser', operation: 'greeting-sticker', sticker: '11' }
  );
});

test('opening a bot preview is read-only and confirmation sends exactly /start with a retained receipt', async () => {
  const f = await greetingSendFixture();
  const plan = await preview(f, {
    chat: '@GreetingBot',
    operation: 'bot-start',
    sticker: null,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.target.bot, true);
  assert.equal(plan.target.chat, '9');
  assert.equal(f.sends().length, 0);
  assert.equal((await apply(f, plan, { confirm: false })).code, 'bad-request');
  assert.equal(f.sends().length, 0);
  const result = await apply(f, plan);
  assert.equal(result.status, 'sent');
  assert.equal(result.messageId, '1');
  assert.equal(f.sends()[0].message, '/start');
  assert.equal(f.sends()[0].peer.userId, 9n);
  const intent = (
    await f.store.query((link) => link.kind === 'telegram-greeting-intent')
  )[0];
  assert.equal(intent.messageId, '1');
  assert.equal((await apply(f, plan)).code, 'plan-expired');
  assert.equal(f.sends().length, 1);
});

test('bot start requires a currently resolved bot rather than a username or numeric guess', async () => {
  const f = await greetingSendFixture();
  for (const chat of ['@GreetingUser', '@GreetingGroup', '@GreetingChannel']) {
    assert.equal(
      (await preview(f, { chat, operation: 'bot-start', sticker: null })).code,
      'bot-required'
    );
  }
  const plan = await preview(f, {
    chat: '@GreetingBot',
    operation: 'bot-start',
    sticker: null,
  });
  f.entities.set('@GreetingBot', { className: 'User', id: 9n });
  assert.equal((await apply(f, plan)).status, 'failed');
  assert.equal(f.sends().length, 0);
});

test('freezes the selected greeting and typed user/group/channel target in each one-use plan', async () => {
  const f = await greetingSendFixture();
  for (const [chat, id, field] of [
    ['@GreetingUser', '8', 'userId'],
    ['@GreetingGroup', '-44', 'chatId'],
    ['@GreetingChannel', '-10044', 'channelId'],
  ]) {
    const plan = await preview(f, { chat });
    assert.equal(plan.target.chat, id);
    plan.sticker.id = '44';
    const answer = await apply(f, plan, {
      chat: '@GreetingBot',
      sticker: '22',
    });
    assert.equal(answer.status, 'sent');
    assert.equal(f.sends().at(-1).media.id.id, 11n);
    assert.equal(
      f.sends().at(-1).peer[field],
      BigInt(id.replace(/^-100|^-/, ''))
    );
  }
});

test('expired and bounded previews cannot send; missing greeting documents never cause discovery or sends', async () => {
  let clock = 1_000_000;
  const f = await greetingSendFixture({ now: () => clock });
  assert.equal(
    (await preview(f, { sticker: '999' })).code,
    'sticker-unavailable'
  );
  const first = await preview(f);
  for (let i = 0; i < 3; i += 1) {
    await preview(f);
  }
  assert.equal((await apply(f, first)).code, 'plan-expired');
  const latest = await preview(f);
  clock += 300_001;
  assert.equal((await apply(f, latest)).code, 'plan-expired');
  assert.equal(f.sends().length, 0);
});

test('a changed owner, reassigned username, wrong peer type or deleted target prevents delivery', async () => {
  for (const change of ['owner', 'target', 'peer', 'deleted']) {
    const f = await greetingSendFixture();
    const plan = await preview(f);
    if (change === 'owner') {
      f.setOwner('2');
    }
    if (change === 'target') {
      f.entities.set('@GreetingUser', { className: 'Chat', id: 8n });
    }
    if (change === 'peer') {
      f.client.getInputEntity = async () => ({ chatId: 8n });
    }
    if (change === 'deleted') {
      f.entities.get('@GreetingUser').deleted = true;
    }
    assert.equal((await apply(f, plan)).status, 'failed');
    assert.equal(f.sends().length, 0);
  }
});

test('a replaced active client cannot send from a previously connected session', async () => {
  const f = await greetingSendFixture();
  const plan = await preview(f);
  f.context.userClient = async () => ({ ...f.client });
  const result = await apply(f, plan);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'account-changed');
  assert.equal(f.sends().length, 0);
});

test('an account or target read timeout before invoking is a definite non-send', async () => {
  const f = await greetingSendFixture();
  const plan = await preview(f);
  const getEntity = f.client.getEntity;
  f.client.getEntity = async () => {
    throw new Error('ETIMEDOUT private selector');
  };
  const outcome = await apply(f, plan);
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.code, 'read-failed');
  assert.equal(f.sends().length, 0);
  f.client.getEntity = getEntity;
  assert.equal((await preview(f)).willSend, true);
});

test('cancellation before the RPC prevents a send and invalidates unused previews', async () => {
  const f = await greetingSendFixture();
  const plan = await preview(f);
  const entered = greetingGate();
  const gate = greetingGate();
  const getInput = f.client.getInputEntity;
  f.client.getInputEntity = async (entity) => {
    entered.resolve();
    await gate.promise;
    return getInput(entity);
  };
  const pending = apply(f, plan);
  try {
    await entered.promise;
    await f.actions.greetingSendCancel();
  } finally {
    gate.resolve();
  }
  const outcome = await pending;
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.code, 'cancelled');
  assert.equal(f.sends().length, 0);
  const unused = await preview(f);
  await f.actions.greetingSendCancel();
  assert.equal((await apply(f, unused)).code, 'plan-expired');
});

test('a local projection failure after /start acknowledgement cannot undo delivery', async () => {
  const f = await greetingSendFixture();
  f.context.apply = async () => {
    throw new Error('projection failed');
  };
  const plan = await preview(f, {
    chat: '@GreetingBot',
    operation: 'bot-start',
    sticker: null,
  });
  const outcome = await apply(f, plan);
  assert.equal(outcome.status, 'sent');
  assert.equal(outcome.messageId, '1');
});

test('missing acknowledgements are unknown and block fresh plans and restarted services until resolved', async () => {
  const f = await greetingSendFixture();
  f.client.invoke = async (request) => {
    f.calls.push(request);
    return { updates: [] };
  };
  const plan = await preview(f);
  const outcome = await apply(f, plan);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 'unknown');
  assert.equal(outcome.messageId, null);
  f.actions = f.create();
  const blocked = await preview(f, { sticker: '22' });
  assert.equal(blocked.willSend, false);
  assert.equal((await apply(f, blocked)).code, 'previous-outcome-unknown');
  assert.equal(f.sends().length, 1);
  await resolveOutbox(f.store, outcome.outbox, 'failed');
  f.client.invoke = async (request) => {
    f.calls.push(request);
    return messageAck(request);
  };
  assert.equal((await apply(f, await preview(f))).status, 'sent');
  assert.equal(f.sends().length, 2);
});

test('24-hour deduplication follows acknowledged delivery time rather than the calendar day or preview', async () => {
  let clock = Date.parse('2026-11-10T23:59:59Z');
  const f = await greetingSendFixture({ now: () => clock });
  const plan = await preview(f);
  assert.equal((await apply(f, plan)).status, 'sent');
  clock += 2000;
  const later = await preview(f, { sticker: '22' });
  assert.equal(later.delivery.code, 'already-greeted');
  assert.equal((await apply(f, later)).status, 'skipped');
  clock += 86_400_000;
  assert.equal((await apply(f, await preview(f))).status, 'sent');
  assert.equal(f.sends().length, 2);
});

test('network errors after invoking /start are unknown; explicit Telegram refusals remain failed', async () => {
  for (const refusal of [false, true]) {
    const f = await greetingSendFixture();
    f.client.invoke = async (request) => {
      f.calls.push(request);
      throw Object.assign(
        new Error('private information'),
        refusal ? { errorMessage: 'USER_IS_BLOCKED' } : {}
      );
    };
    const plan = await preview(f, {
      chat: '@GreetingBot',
      operation: 'bot-start',
      sticker: null,
    });
    const outcome = await apply(f, plan);
    assert.equal(outcome.status, refusal ? 'failed' : 'unknown');
    assert.equal(
      JSON.stringify(await f.store.query()).includes('private information'),
      false
    );
  }
});

test('an intent or outbox storage failure happens before the RPC, while acknowledged sends survive receipt-write failure', async () => {
  for (const phase of ['intent', 'outbox', 'receipt']) {
    const f = await greetingSendFixture();
    const put = f.store.put;
    f.store.put = async (link) => {
      if (
        (phase === 'intent' && link.kind === 'telegram-greeting-intent') ||
        (phase === 'outbox' && link.status === 'sending') ||
        (phase === 'receipt' && link.messageId)
      ) {
        throw new Error('store unavailable');
      }
      return put(link);
    };
    const outcome = await apply(f, await preview(f));
    assert.equal(f.sends().length, phase === 'receipt' ? 1 : 0);
    assert.equal(outcome.ok, phase === 'receipt');
    if (phase === 'outbox') {
      assert.equal((await preview(f)).willSend, true);
    }
  }
});

test('cross-service concurrent plans cannot bypass the account/target intent lock', async () => {
  const f = await greetingSendFixture();
  const other = f.create();
  const one = await preview(f);
  const two = await other.greetingSendPreview({
    chat: '@GreetingUser',
    sticker: '22',
  });
  const gate = greetingGate();
  const entered = greetingGate();
  f.client.invoke = async (request) => {
    f.calls.push(request);
    entered.resolve();
    await gate.promise;
    return messageAck(request);
  };
  const pending = apply(f, one);
  try {
    await entered.promise;
    const answer = await other.greetingSendApply({
      planId: two.planId,
      confirm: true,
    });
    assert.equal(answer.code, 'send-in-progress');
    assert.equal(f.sends().length, 1);
  } finally {
    gate.resolve();
  }
  assert.equal((await pending).status, 'sent');
});

test('shutdown owns pending previews and never publishes a late usable plan', async () => {
  const f = await greetingSendFixture();
  const gate = greetingGate();
  const entered = greetingGate();
  f.context.userClient = async () => {
    entered.resolve();
    return gate.promise;
  };
  const pending = preview(f);
  await entered.promise;
  let stopped = false;
  const stopping = f.env.greetingSendStop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);
  gate.resolve(f.client);
  assert.equal((await pending).code, 'stopped');
  await stopping;
  assert.equal((await preview(f)).code, 'stopped');
  assert.equal(f.sends().length, 0);
});

test('shutdown waits for an active acknowledged RPC without relabelling it as cancelled or failed', async () => {
  const f = await greetingSendFixture();
  const plan = await preview(f);
  const gate = greetingGate();
  const entered = greetingGate();
  f.client.invoke = async (request) => {
    f.calls.push(request);
    entered.resolve();
    await gate.promise;
    return messageAck(request);
  };
  const pending = apply(f, plan);
  await entered.promise;
  let done = false;
  const stopping = f.env.greetingSendStop().then(() => {
    done = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  gate.resolve();
  assert.equal((await pending).status, 'sent');
  await stopping;
});

test('a stored unresolved intent without an outbox blocks a new send conservatively', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'telegram-greeting-intent:1:greeting-sticker:8',
    kind: 'telegram-greeting-intent',
    outbox: 'outbox:interrupted',
  });
  const f = await greetingSendFixture({ store });
  const plan = await preview(f);
  assert.equal(plan.willSend, false);
  assert.equal((await apply(f, plan)).status, 'unknown');
  assert.equal(f.sends().length, 0);
});
