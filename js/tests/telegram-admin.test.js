// A group's permissions, slow mode and recent actions (R-Y133): rights
// converted both ways, the slow mode, the log's mapping and paging, the
// routes' validation and Telegram's errors. Fake clients; nothing reaches
// a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAdminActions, rightsOf } from '../src/sources/telegram-admin.js';
import { postRoute as post } from './helpers/post-route.js';
import { changesOf } from '../src/web/chat-admin.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  channels: {
    GetFullChannel: named('GetFullChannel'),
    ToggleSlowMode: named('ToggleSlowMode'),
    GetAdminLog: named('GetAdminLog'),
  },
  messages: {
    GetFullChat: named('GetFullChat'),
    EditChatDefaultBannedRights: named('EditChatDefaultBannedRights'),
  },
  ChatBannedRights: named('ChatBannedRights'),
};

const make = ({ answer, fail = null } = {}) => {
  const log = [];
  const invoke = async (request) => {
    log.push(request);
    if (fail) {
      throw Object.assign(new Error(fail), { errorMessage: fail });
    }
    return typeof answer === 'function' ? answer(request) : answer;
  };
  const env = {
    importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const userClient = async () => ({ invoke });
  return { ...createAdminActions(env, { userClient }), log };
};

const full = (entity, fullChat = {}) => ({ chats: [entity], fullChat });

test('rights: banned flags become allowed booleans', () => {
  assert.equal(Object.values(rightsOf()).every(Boolean), true);
  const r = rightsOf({
    sendMessages: true,
    sendPhotos: true,
    pinMessages: true,
  });
  assert.equal(r.sendMessages, false);
  assert.equal(r.sendMedia, false, 'any media flag forbids media');
  assert.equal(r.pinMessages, false);
  assert.equal(r.embedLinks, true);
  assert.equal(r.inviteUsers, true);
});

test('chatPermissions: a supergroup, with slow mode and canEdit', async () => {
  const { chatPermissions, log } = make({
    answer: full(
      {
        megagroup: true,
        creator: true,
        defaultBannedRights: { embedLinks: true },
      },
      { slowmodeSeconds: 30 }
    ),
  });
  const got = await chatPermissions({ chat: '-1005' });
  assert.equal(got.ok, true);
  assert.equal(got.slowMode, 30);
  assert.equal(got.canEdit, true);
  assert.equal(got.rights.embedLinks, false);
  assert.equal(got.rights.sendMessages, true);
  assert.deepEqual(log[0].channel, { chat: '-1005' });
});

test('chatPermissions: a basic group; canEdit follows ban-users', async () => {
  const admin = make({
    answer: full({ adminRights: { banUsers: true } }),
  });
  const got = await admin.chatPermissions({ chat: '-7' });
  assert.equal(got.canEdit, true);
  assert.equal(got.slowMode, 0);
  assert.equal(admin.log[0].chatId, 7n);
  const plain = make({ answer: full({ adminRights: { pinMessages: true } }) });
  assert.equal((await plain.chatPermissions({ chat: '-7' })).canEdit, false);
  const broadcast = make({
    answer: full({ broadcast: true, creator: true }),
  });
  assert.equal(
    (await broadcast.chatPermissions({ chat: '-1005' })).canEdit,
    false
  );
});

test('setPermissions: a full set becomes ChatBannedRights', async () => {
  const { setPermissions, log } = make({ answer: {} });
  const rights = {
    sendMessages: true,
    sendMedia: false,
    embedLinks: true,
    inviteUsers: false,
    pinMessages: true,
    changeInfo: false,
    manageTopics: true,
  };
  assert.deepEqual(await setPermissions({ chat: '-1005', rights }), {
    ok: true,
  });
  assert.equal(log.length, 1, 'no read when everything is named');
  const rq = log[0];
  assert.equal(rq.className, 'EditChatDefaultBannedRights');
  assert.equal(rq.bannedRights.untilDate, 0);
  assert.equal(rq.bannedRights.sendMessages, false);
  assert.equal(rq.bannedRights.sendPhotos, true);
  assert.equal(rq.bannedRights.sendPolls, true);
  assert.equal(rq.bannedRights.inviteUsers, true);
  assert.equal(rq.bannedRights.embedLinks, false);
});

test('setPermissions: rights not named stay as they are', async () => {
  const { setPermissions, log } = make({
    answer: (request) =>
      request.className === 'GetFullChannel'
        ? full({ defaultBannedRights: { pinMessages: true } })
        : {},
  });
  await setPermissions({ chat: '-1005', rights: { embedLinks: false } });
  const sent = log.at(-1).bannedRights;
  assert.equal(sent.pinMessages, true, 'kept');
  assert.equal(sent.embedLinks, true, 'changed');
  assert.equal(sent.sendMessages, false);
});

test('setPermissions and setSlowMode: bad input asks nothing', async () => {
  const { setPermissions, setSlowMode, adminLog, log } = make({ answer: {} });
  for (const rights of [null, {}, { nope: true }, { sendMessages: 1 }, []]) {
    assert.equal((await setPermissions({ chat: '-5', rights })).ok, false);
  }
  assert.equal((await setPermissions({ chat: '5', rights: {} })).ok, false);
  assert.equal((await setSlowMode({ chat: '-5', seconds: 10 })).ok, false);
  assert.equal((await setSlowMode({ chat: '-1005', seconds: 11 })).ok, false);
  assert.equal((await adminLog({ chat: '-5' })).ok, false);
  assert.equal((await adminLog({ chat: '-1005', maxId: 'x' })).ok, false);
  assert.equal(log.length, 0);
});

test('setSlowMode: the seconds are sent', async () => {
  const { setSlowMode, log } = make({ answer: {} });
  assert.deepEqual(await setSlowMode({ chat: '-1005', seconds: 300 }), {
    ok: true,
  });
  assert.equal(log[0].seconds, 300);
  assert.deepEqual(log[0].channel, { chat: '-1005' });
});

test('errors: Telegram names become codes; not modified is success', async () => {
  const codes = {
    CHAT_ADMIN_REQUIRED: 'not-admin',
    SECONDS_INVALID: 'seconds-invalid',
    CHANNEL_PRIVATE: 'no-access',
    ODD: 'failed',
  };
  for (const [name, code] of Object.entries(codes)) {
    const { setSlowMode } = make({ fail: name });
    const got = await setSlowMode({ chat: '-1005', seconds: 10 });
    assert.equal(got.ok, false);
    assert.equal(got.code, code);
  }
  const same = make({ fail: 'CHAT_NOT_MODIFIED' });
  assert.deepEqual(await same.setSlowMode({ chat: '-1005', seconds: 0 }), {
    ok: true,
  });
  const noClient = createAdminActions(
    { importer: async () => ({ Api, helpers: {} }) },
    { userClient: async () => null }
  );
  assert.equal(
    (await noClient.chatPermissions({ chat: '-5' })).supported,
    false
  );
});

const event = (id, userId, action, date = 1000) => ({
  id: BigInt(id),
  date,
  userId,
  action: { className: `ChannelAdminLogEventAction${action.kind}`, ...action },
});

test('adminLog: events mapped with names, text and times', async () => {
  const { adminLog, log } = make({
    answer: {
      users: [
        { id: 1n, firstName: 'Ann', lastName: 'Lee' },
        { id: 2n, username: 'bob' },
      ],
      events: [
        event(9, 1n, { kind: 'ChangeTitle', newValue: 'New' }),
        event(8, 2n, { kind: 'EditMessage', newMessage: { message: 'hey' } }),
        event(7, 2n, { kind: 'DeleteMessage', message: { message: 'bye' } }),
        event(6, 1n, { kind: 'UpdatePinned', message: { message: 'pinned' } }),
        event(5, 1n, { kind: 'ParticipantJoin' }),
        event(4, 1n, { kind: 'ParticipantLeave' }),
        event(3, 1n, {
          kind: 'ParticipantInvite',
          participant: { userId: 2n },
        }),
        event(2, 1n, {
          kind: 'ParticipantToggleBan',
          newParticipant: { peer: { userId: 2n } },
        }),
        event(1, 1n, {
          kind: 'ParticipantToggleAdmin',
          newParticipant: { userId: 2n },
        }),
        event(0, 1n, { kind: 'DefaultBannedRights' }),
        event(10, 1n, { kind: 'ToggleSlowMode', newValue: 30 }),
        event(11, 1n, { kind: 'ChangeAbout', newValue: 'about' }),
        event(12, 1n, { kind: 'ChangePhoto' }),
        event(13, 9n, { kind: 'ToggleSignatures' }),
      ],
    },
  });
  const got = await adminLog({ chat: '-1005' });
  assert.equal(got.ok, true);
  assert.equal(got.next, null, 'a short page is the last');
  const by = (id) => got.events.find((e) => e.id === String(id));
  assert.deepEqual(by(9), {
    id: '9',
    date: 1_000_000,
    user: '1',
    userName: 'Ann Lee',
    kind: 'title',
    text: 'New',
  });
  assert.equal(by(8).kind, 'edit');
  assert.equal(by(8).userName, 'bob');
  assert.equal(by(8).text, 'hey');
  assert.equal(by(7).kind, 'delete');
  assert.equal(by(6).kind, 'pin');
  assert.equal(by(5).kind, 'join');
  assert.equal(by(4).kind, 'leave');
  assert.deepEqual([by(3).kind, by(3).text], ['invite', 'bob']);
  assert.deepEqual([by(2).kind, by(2).text], ['ban', 'bob']);
  assert.deepEqual([by(1).kind, by(1).text], ['promote', 'bob']);
  assert.equal(by(0).kind, 'rights');
  assert.deepEqual([by(10).kind, by(10).text], ['slowmode', '30']);
  assert.equal(by(11).kind, 'about');
  assert.equal(by(12).kind, 'photo');
  assert.equal(by(13).kind, 'other');
  assert.equal(by(13).text, 'ChannelAdminLogEventActionToggleSignatures');
  assert.equal(by(13).userName, '9', 'an unknown user shows the id');
  assert.equal(log[0].maxId, 0n);
});

test('adminLog: a full page continues from its last id', async () => {
  const many = Array.from({ length: 50 }, (_, i) =>
    event(100 - i, 1n, { kind: 'ParticipantJoin' })
  );
  const { adminLog, log } = make({ answer: { users: [], events: many } });
  const first = await adminLog({ chat: '-1005' });
  assert.equal(first.events.length, 50);
  assert.equal(first.next, '51');
  await adminLog({ chat: '-1005', maxId: first.next });
  assert.equal(log[1].maxId, 51n);
});

test('changesOf: only what differs', () => {
  const was = rightsOf();
  assert.deepEqual(changesOf(was, { ...was, pinMessages: false }), {
    pinMessages: false,
  });
  assert.deepEqual(changesOf(was, was), {});
});

test('routes: validation of chat, rights, seconds and maxId', async () => {
  const calls = [];
  const account = {
    chatPermissions: async (a) => (calls.push(['p', a]), { ok: true }),
    setPermissions: async (a) => (calls.push(['s', a]), { ok: true }),
    setSlowMode: async (a) => (calls.push(['m', a]), { ok: true }),
    adminLog: async (a) => (calls.push(['l', a]), { ok: true }),
  };
  const bad = [
    ['chat-permissions', { chat: '12' }],
    ['chat-permissions-set', { chat: '-5', rights: { nope: true } }],
    ['chat-permissions-set', { chat: '-5', rights: { sendMessages: 'yes' } }],
    ['chat-permissions-set', { chat: '-5', rights: {} }],
    ['slow-mode', { chat: '-1005', seconds: 7 }],
    ['slow-mode', { chat: '-1005', seconds: '10' }],
    ['admin-log', { chat: '-1005', maxId: 'abc' }],
    ['admin-log', { chat: 'x' }],
  ];
  for (const [route, body] of bad) {
    const got = await post(route, body, account);
    assert.equal(got, 400, `${route} ${JSON.stringify(body)}`);
  }
  assert.equal(calls.length, 0);
  await post('chat-permissions', { chat: '-5' }, account);
  await post(
    'chat-permissions-set',
    { chat: '-5', rights: { pinMessages: false } },
    account
  );
  await post('slow-mode', { chat: '-1005', seconds: 3600 }, account);
  await post('admin-log', { chat: '-1005', maxId: '77' }, account);
  assert.deepEqual(calls, [
    ['p', { chat: '-5' }],
    ['s', { chat: '-5', rights: { pinMessages: false } }],
    ['m', { chat: '-1005', seconds: 3600 }],
    ['l', { chat: '-1005', maxId: '77' }],
  ]);
});
