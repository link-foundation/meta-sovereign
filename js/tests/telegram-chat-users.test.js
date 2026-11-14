import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createUserCollection,
  messageUserReferences,
} from '../src/sources/telegram-chat-users-shape.js';
import { createPeerActions } from '../src/sources/telegram-peer-actions.js';
import {
  createTelegramUsersCommands,
  usersCommandRequest,
} from '../src/cli/telegram-users-commands.js';
import { CHAT_USERS_POSTS } from '../src/server/routes-telegram-chat-users.js';
import { TELEGRAM_CALLS } from '../src/web/dom-telegram-calls.js';
import { telegramStatusResponse } from '../src/server/telegram-capabilities.js';
import {
  usersFixture,
  userOf,
  usersApi,
  scannedUsers,
  usersFinished,
  contactPlan,
  appliedUsers,
} from './helpers/chat-users-fakes.mjs';

const sends = (fixture) =>
  fixture.calls.filter((call) => call.className === 'AddContact');
const rpc = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });
const from = (id) => ({ className: 'PeerUser', userId: BigInt(id) });

test('extracts unique user identities with provenance; channels and migration IDs are not users', () => {
  const collection = createUserCollection();
  collection.message({
    id: 1,
    message: 'Hi @alice',
    fromId: from(2),
    sender: userOf(2),
    fwdFrom: { fromId: from(3) },
    action: { className: 'MessageActionChatAddUser', users: [4n, 2n] },
    entities: [
      { className: 'MessageEntityMention', offset: 3, length: 6 },
      { className: 'MessageEntityMentionName', userId: 5n },
    ],
    media: { className: 'MessageMediaContact', userId: 6n },
  });
  collection.message({
    id: 2,
    fromId: from(2),
    action: { className: 'MessageActionChatDeleteUser', userId: 4n },
  });
  collection.message({
    id: 3,
    fromId: from(7),
    action: { className: 'MessageActionChatJoinedByRequest' },
  });
  collection.message({
    id: 4,
    fromId: { className: 'PeerChannel', channelId: 99n },
    senderId: 99n,
    fwdFrom: { fromId: { className: 'PeerChannel', channelId: 100n } },
    action: { className: 'MessageActionChannelMigrateFrom', chatId: 101n },
  });
  collection.add({ className: 'Channel', id: 99n }, 'participant');
  assert.deepEqual(
    [...collection.users.keys()],
    ['2', '4', '3', '5', '6', '7']
  );
  assert.deepEqual(collection.users.get('2').sources, [
    'author',
    'service:members',
  ]);
  assert.deepEqual(collection.users.get('2').evidence, [1, 2]);
  assert.deepEqual(collection.users.get('4').sources, [
    'service:members',
    'service:removed',
  ]);
  assert.deepEqual([...collection.mentions.keys()], ['@alice']);
  assert.deepEqual(
    messageUserReferences({
      message: 'Display Name',
      fwdFrom: { fromName: 'Someone' },
    }),
    []
  );
});

test('collection bounds identities and evidence without silently claiming complete results', () => {
  const collection = createUserCollection({ maxUsers: 2 });
  for (let id = 1; id <= 12; id += 1) {
    collection.message({ id, fromId: from(2) });
  }
  assert.equal(collection.users.get('2').evidence.length, 8);
  collection.add(3n, 'participant');
  assert.throws(() => collection.add(4n, 'participant'), {
    code: 'user-capacity',
  });
});

test('scan supplements forbidden participants with history and resolves references honestly', async () => {
  const fixture = usersFixture({
    memberError: rpc('CHAT_ADMIN_REQUIRED'),
    participants: [],
    messages: [
      {
        id: 8,
        fromId: from(2),
        message: '@alice @unknown',
        entities: [
          { className: 'MessageEntityMention', offset: 0, length: 6 },
          { className: 'MessageEntityMention', offset: 7, length: 8 },
        ],
        media: { className: 'MessageMediaContact', userId: 3n },
      },
    ],
    profiles: [userOf(2), userOf(4, { username: 'alice' })],
  });
  const result = await scannedUsers(fixture);
  assert.equal(result.job.state, 'done');
  assert.equal(result.job.coverage.participants.complete, false);
  assert.equal(result.job.coverage.participants.error, 'CHAT_ADMIN_REQUIRED');
  assert.equal(result.job.coverage.messages.complete, true);
  assert.equal(result.job.unresolvedMentions, 1);
  assert.equal(result.users.find((user) => user.id === '3').resolved, false);
  assert.ok(
    result.users
      .find((user) => user.id === '4')
      .sources.includes('mention:username')
  );
  assert.equal(fixture.closed(), 2);
  assert.ok(fixture.waits.every((ms) => ms === 100));
  assert.ok(!fixture.calls.some((call) => call[0] === 'log'));
  assert.equal(
    (await fixture.store.query((link) => link.kind === 'telegram-chat-user'))
      .length,
    3
  );
});

test('scan limits, disabled history, exact targets and invalid fields are truthful', async () => {
  const fixture = usersFixture();
  for (const body of [
    { chat: 'Study group' },
    { chat: '-44', messagesLimit: -1 },
    { chat: '-44', debug: 'true' },
    { chat: '-44', participantsLimit: 1.5 },
  ]) {
    assert.equal(
      (await fixture.account.chatUsersStart(body)).code,
      'bad-request'
    );
  }
  assert.equal(fixture.calls.length, 0);
  const result = await scannedUsers(fixture, {
    participantsLimit: 1,
    messagesLimit: 0,
    debug: true,
  });
  assert.equal(result.users.length, 1);
  assert.equal(result.job.coverage.participants.limited, true);
  assert.equal(result.job.coverage.messages.disabled, true);
  assert.equal(result.job.coverage.messages.complete, false);
  assert.ok(fixture.calls.some((call) => call[0] === 'log'));
});

test('default contact preview filters unsafe profiles and performs no writes', async () => {
  const fixture = usersFixture({
    participants: [
      userOf(1),
      userOf(2),
      userOf(3, { bot: true }),
      userOf(4, { deleted: true }),
      userOf(5, { fake: true }),
      userOf(6, { scam: true }),
      userOf(7, { support: true }),
      userOf(8, { contact: true }),
    ],
  });
  const plan = await contactPlan(fixture);
  assert.equal(plan.selected, 1);
  assert.deepEqual(plan.options, {
    limit: 0,
    delayMs: 10_000,
    sharePhone: false,
    includeExisting: false,
  });
  assert.equal(plan.sample[0].id, '2');
  assert.deepEqual(plan.skipped, {
    self: 1,
    bot: 1,
    deleted: 1,
    fake: 1,
    scam: 1,
    support: 1,
    'already-contact': 1,
  });
  assert.equal(sends(fixture).length, 0);
  const included = await fixture.account.chatUsersContactsPreview({
    jobId: plan.scanId,
    includeExisting: true,
    limit: 1,
  });
  assert.equal(included.eligible, 2);
  assert.equal(included.selected, 1);
});

test('one-use preview freezes selection and keeps no-phone additions private by default', async () => {
  const fixture = usersFixture();
  const plan = await contactPlan(fixture, { limit: 1 });
  plan.sample[0].firstName = 'Tampered';
  plan.options.sharePhone = true;
  assert.equal(
    (await fixture.account.chatUsersContactsApply({ planId: plan.planId }))
      .code,
    'bad-request'
  );
  await fixture.account.chatUsersContactsApply({
    planId: plan.planId,
    confirm: true,
    sharePhone: true,
    limit: 999,
  });
  const result = await usersFinished(fixture.account);
  assert.equal(result.job.counts.added, 1);
  assert.equal(result.results[0].status, 'added');
  assert.equal(sends(fixture)[0].firstName, 'Person 2');
  assert.equal(sends(fixture)[0].phone, '');
  assert.equal(sends(fixture)[0].addPhonePrivacyException, false);
  assert.equal(
    (
      await fixture.account.chatUsersContactsApply({
        planId: plan.planId,
        confirm: true,
      })
    ).code,
    'preview-expired'
  );
});

test('explicit phone-sharing option and pacing are applied to every acknowledged contact', async () => {
  const fixture = usersFixture({
    participants: [userOf(2, { phone: '123456' }), userOf(3)],
  });
  const result = await appliedUsers(fixture, { sharePhone: true, delayMs: 77 });
  assert.equal(result.job.counts.added, 2);
  assert.equal(sends(fixture).length, 2);
  assert.ok(
    sends(fixture).every(
      (request) =>
        request.phone === '' && request.addPhonePrivacyException === true
    )
  );
  assert.deepEqual(fixture.waits, [77]);
});

test('expired preview, account changes and newly ineligible profiles cannot add contacts', async () => {
  let time = 0;
  const fixture = usersFixture({ now: () => time });
  let plan = await contactPlan(fixture);
  time = 300_001;
  assert.equal(
    (
      await fixture.account.chatUsersContactsApply({
        planId: plan.planId,
        confirm: true,
      })
    ).code,
    'preview-expired'
  );
  plan = await contactPlan(fixture);
  fixture.setMe(userOf(99));
  await fixture.account.chatUsersContactsApply({
    planId: plan.planId,
    confirm: true,
  });
  assert.equal(
    (await usersFinished(fixture.account)).job.code,
    'account-changed'
  );
  fixture.setMe(userOf(1));
  plan = await contactPlan(fixture);
  fixture.identities.set('2', userOf(2, { bot: true }));
  fixture.identities.set('3', userOf(3, { contact: true }));
  await fixture.account.chatUsersContactsApply({
    planId: plan.planId,
    confirm: true,
  });
  assert.equal((await usersFinished(fixture.account)).job.counts.skipped, 2);
  assert.equal(sends(fixture).length, 0);
});

test('missing receipts stop the batch and block repeats across fresh plans and privacy modes', async () => {
  const fixture = usersFixture({ invoke: () => ({}) });
  let result = await appliedUsers(fixture);
  assert.equal(result.job.state, 'partial');
  assert.equal(result.job.counts.unknown, 1);
  assert.equal(result.results[0].status, 'unknown');
  assert.equal(sends(fixture).length, 1);
  result = await appliedUsers(fixture, { sharePhone: true });
  assert.equal(result.job.counts.unknown, 1);
  assert.equal(result.results[0].code, 'previous-outcome-unknown');
  assert.equal(sends(fixture).length, 1);
});

test('transport uncertainty persists across account recreation; definite RPC refusals remain failures', async () => {
  const original = usersFixture({
    invoke: () => {
      throw new Error('Connection lost with a private value');
    },
  });
  const result = await appliedUsers(original);
  assert.equal(result.job.counts.unknown, 1);
  const restarted = usersFixture({ store: original.store });
  const resumed = await appliedUsers(restarted);
  assert.equal(resumed.job.counts.unknown, 1);
  assert.equal(sends(restarted).length, 0);
  const refused = usersFixture({
    invoke: () => {
      throw rpc('USER_PRIVACY_RESTRICTED');
    },
  });
  assert.equal((await appliedUsers(refused)).job.counts.failed, 2);
});

test('a known successful prior addition does not prevent a later explicit re-add', async () => {
  const fixture = usersFixture();
  await appliedUsers(fixture, { limit: 1 });
  const result = await appliedUsers(fixture, { limit: 1 });
  assert.equal(result.job.counts.added, 1);
  assert.equal(sends(fixture).length, 2);
});

test('flood RPC retries once after the requested pause and stops on a repeated flood', async () => {
  let calls = 0;
  const fixture = usersFixture({
    invoke: () => {
      if (calls++ < 2) {
        throw rpc('FLOOD_WAIT_2');
      }
      return { className: 'Updates' };
    },
  });
  const result = await appliedUsers(fixture);
  assert.equal(result.job.state, 'partial');
  assert.equal(result.job.stopped, 'flood-wait');
  assert.equal(sends(fixture).length, 2);
  assert.deepEqual(fixture.waits, [3000]);
  const accepted = usersFixture({
    invoke: () => {
      if (calls++ === 2) {
        throw rpc('FLOOD_PREMIUM_WAIT_1');
      }
      return { className: 'Updates' };
    },
  });
  assert.equal(
    (await appliedUsers(accepted, { limit: 1 })).job.counts.added,
    1
  );
  assert.deepEqual(accepted.waits, [2000]);
});

test('cancel waits for an active contact receipt and never starts the next user', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const fixture = usersFixture({
    invoke: async () => {
      await gate;
      return { className: 'Updates' };
    },
  });
  const plan = await contactPlan(fixture);
  await fixture.account.chatUsersContactsApply({
    planId: plan.planId,
    confirm: true,
  });
  for (let i = 0; i < 100 && !sends(fixture).length; i += 1) {
    await new Promise((resolve) => globalThis.setImmediate(resolve));
  }
  assert.equal(sends(fixture).length, 1);
  let stopped = false;
  const stopping = fixture.env.chatUsersStop().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => globalThis.setImmediate(resolve));
  assert.equal(stopped, false);
  assert.equal(
    (await fixture.account.chatUsersStart({ chat: '-44' })).code,
    'stopped'
  );
  release();
  await stopping;
  const result = await usersFinished(fixture.account);
  assert.equal(result.job.state, 'cancelled');
  assert.equal(result.job.counts.added, 1);
  assert.equal(sends(fixture).length, 1);
});

test('API routes validate before provider calls and advertise only implemented user-account support', async () => {
  let calls = 0;
  const account = {
    chatUsersStart: async () => {
      calls += 1;
      return { ok: true };
    },
    status: async () => ({ kind: 'user' }),
  };
  assert.equal(
    (
      await CHAT_USERS_POSTS['chat-users-start'](account, {
        chat: 'Fuzzy name',
      })
    )[0],
    400
  );
  assert.equal(
    (await CHAT_USERS_POSTS['chat-users-status'](account, { limit: 501 }))[0],
    400
  );
  assert.equal(
    (
      await CHAT_USERS_POSTS['chat-users-contacts-apply'](account, {
        planId: 'x',
        confirm: 'true',
      })
    )[0],
    400
  );
  assert.equal(calls, 0);
  assert.equal(
    (await CHAT_USERS_POSTS['chat-users-start'](account, { chat: '-44' }))[0],
    200
  );
  assert.equal(calls, 1);
  assert.equal(
    (await CHAT_USERS_POSTS['chat-users-start']({}, { chat: '-44' }))[0],
    501
  );
  assert.equal(
    (await telegramStatusResponse(account, {})).capabilities.chatUsersStart,
    true
  );
  account.status = async () => ({ kind: 'bot' });
  assert.equal(
    (await telegramStatusResponse(account, {})).capabilities.chatUsersStart,
    false
  );
  assert.equal(
    TELEGRAM_CALLS.telegramChatUsersContactsApply.capability,
    'chatUsersStart'
  );
});

test('CLI validates before opening storage, defaults to preview and closes after the job', async () => {
  assert.equal(usersCommandRequest({ chat: '-44', apply: 'yes' }), null);
  let fixture = usersFixture();
  const order = [];
  const reports = [];
  const commands = createTelegramUsersCommands({
    openStore: async () => ({ close: async () => order.push('store-close') }),
    createAccount: () => ({
      ...fixture.account,
      stop: async () => {
        await fixture.env.chatUsersStop();
        order.push('account-stop');
      },
    }),
    sleep: async () =>
      new Promise((resolve) => globalThis.setImmediate(resolve)),
  });
  assert.equal(
    await commands['telegram-chat-contacts']({ chat: '-44' }, (text) =>
      reports.push(JSON.parse(text))
    ),
    0
  );
  assert.equal(reports[0].applied, false);
  assert.equal(reports[0].preview.selected, 2);
  assert.equal(sends(fixture).length, 0);
  assert.deepEqual(order, ['account-stop', 'store-close']);
  reports.length = 0;
  // A real second CLI invocation constructs a fresh account after shutdown.
  fixture = usersFixture();
  assert.equal(
    await commands['telegram-chat-contacts'](
      { chat: '-44', apply: 'true', limit: '1' },
      (text) => reports.push(JSON.parse(text))
    ),
    0
  );
  assert.equal(reports[0].job.counts.added, 1);
});

test('individual contact action also requires a real acknowledgement and preserves uncertainty', async () => {
  const client = { invoke: async () => ({}) };
  const account = createPeerActions(
    {
      importer: async () => ({
        Api: usersApi,
        helpers: { returnBigInt: BigInt },
      }),
      connection: {
        withPeer: async (_client, chat, use) =>
          use({ userId: BigInt(chat), accessHash: 77n }),
      },
    },
    { userClient: async () => client }
  );
  const answer = await account.peerContact({
    chat: '2',
    add: true,
    firstName: 'Alice',
  });
  assert.equal(answer.ok, false);
  assert.equal(answer.outcome, 'unknown');
  assert.equal(answer.fallback, false);
});

test('outbox persistence precedes every provider write; storage failures cannot send', async () => {
  const fixture = usersFixture();
  const put = fixture.store.put.bind(fixture.store);
  fixture.store.put = async (link) => {
    if (link.id.startsWith('outbox:')) {
      throw new Error('unavailable');
    }
    return put(link);
  };
  const result = await appliedUsers(fixture, { limit: 1 });
  assert.equal(result.job.counts.failed, 1);
  assert.equal(sends(fixture).length, 0);
  assert.equal(
    (
      await fixture.store.query(
        (link) => link.kind === 'telegram-contact-intent'
      )
    ).length,
    0
  );
  fixture.store.put = put;
  assert.equal((await appliedUsers(fixture, { limit: 1 })).job.counts.added, 1);
});

test('scan pagination, scan cancellation and startup storage failures remain bounded and recoverable', async () => {
  const fixture = usersFixture({
    participants: Array.from({ length: 105 }, (_, index) => userOf(index + 2)),
  });
  const result = await scannedUsers(fixture, { messagesLimit: 0 });
  assert.equal(result.users.length, 100);
  assert.equal(result.more, true);
  const last = await fixture.account.chatUsersStatus({ offset: 100 });
  assert.equal(last.users.length, 5);
  assert.equal(last.more, false);
  const put = fixture.store.put.bind(fixture.store);
  fixture.store.put = async () => {
    throw new Error('store unavailable');
  };
  assert.equal(
    (await fixture.account.chatUsersStart({ chat: '-44' })).ok,
    false
  );
  assert.equal((await fixture.account.chatUsersStatus()).job.state, 'failed');
  fixture.store.put = put;
  await fixture.account.chatUsersStart({ chat: '-44' });
  await fixture.account.chatUsersCancel();
  const stopped = await usersFinished(fixture.account);
  assert.equal(stopped.job.state, 'cancelled');
  assert.equal(stopped.job.coverage.participants.complete, false);
  await fixture.env.chatUsersStop();
});

test('numeric scan targets reach the SDK as canonical typed peer IDs', async () => {
  const fixture = usersFixture();
  const getEntity = fixture.client.getEntity;
  fixture.client.getEntity = async (value) => {
    if (String(value) === '-44') {
      assert.equal(typeof value, 'bigint');
    }
    return getEntity(value);
  };
  const result = await scannedUsers(fixture);
  assert.equal(result.job.state, 'done');
});

test('SDK async iterables are opened before advancing participant and history cursors', async () => {
  const { RequestIter } = await import('teleproto/requestIter.js');
  class FakeSdkIterator extends RequestIter {
    async _init({ items }) {
      this.buffer = [...items];
      return true;
    }
  }
  const fixture = usersFixture();
  fixture.client.iterParticipants = () =>
    new FakeSdkIterator({}, 5, {}, { items: [userOf(2)] });
  fixture.client.iterMessages = () =>
    new FakeSdkIterator({}, 5, {}, { items: [{ id: 9, fromId: from(3) }] });
  const result = await scannedUsers(fixture);
  assert.equal(result.job.coverage.participants.error, null);
  assert.equal(result.job.coverage.messages.error, null);
  assert.deepEqual(
    result.users.map((user) => user.id),
    ['2', '3']
  );
});
