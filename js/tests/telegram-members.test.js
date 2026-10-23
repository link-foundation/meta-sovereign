// A group's members (R-Y125): the requests built, the roles, a basic
// group, removing, Telegram's errors as codes, and the routes. Fake
// clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createMembers } from '../src/sources/telegram-members.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  channels: {
    GetParticipants: named('GetParticipants'),
    EditBanned: named('EditBanned'),
  },
  messages: {
    GetFullChat: named('GetFullChat'),
    DeleteChatUser: named('DeleteChatUser'),
  },
  ChannelParticipantsSearch: named('ChannelParticipantsSearch'),
  ChannelParticipantsRecent: named('ChannelParticipantsRecent'),
  ChatBannedRights: named('ChatBannedRights'),
  InputPeerUser: named('InputPeerUser'),
  InputUser: named('InputUser'),
};

const make = (answer) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const members = createMembers(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    { userClient: async () => client }
  );
  return { members, log };
};

const user = (id, firstName, extra = {}) => ({
  id: BigInt(id),
  firstName,
  ...extra,
});

const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

test('a supergroup page: recent participants, roles, rank, the rights', async () => {
  const { members, log } = make(() => ({
    count: 9,
    participants: [
      { className: 'ChannelParticipantCreator', userId: 1n, rank: 'boss' },
      { className: 'ChannelParticipantAdmin', userId: 2n },
      { className: 'ChannelParticipantSelf', userId: 3n },
      {
        className: 'ChannelParticipantBanned',
        peer: { userId: 4n },
        bannedRights: { viewMessages: false },
      },
      {
        className: 'ChannelParticipantBanned',
        peer: { userId: 5n },
        bannedRights: { viewMessages: true },
      },
      { className: 'ChannelParticipant', userId: 6n },
    ],
    chats: [{ creator: false, adminRights: { banUsers: true } }],
    users: [
      user(1, 'Olga', { lastName: 'Owner' }),
      user(2, 'Adam'),
      user(3, 'Me', { self: true }),
      user(4, 'Rita', { username: 'rita' }),
      user(5, 'Bob'),
    ],
  }));
  const answer = await members.chatMembers({
    chat: '-1005',
    offset: 10,
    limit: 25,
  });
  assert.equal(log.length, 1);
  assert.equal(log[0].className, 'GetParticipants');
  assert.deepEqual(log[0].channel, { chat: '-1005' });
  assert.equal(log[0].filter.className, 'ChannelParticipantsRecent');
  assert.equal(log[0].offset, 10);
  assert.equal(log[0].limit, 25);
  assert.equal(answer.ok, true);
  assert.equal(answer.total, 9);
  assert.equal(answer.canBan, true);
  assert.equal(answer.canInvite, false);
  assert.deepEqual(
    answer.members.map((m) => [m.id, m.role, m.rank, m.self]),
    [
      ['1', 'creator', 'boss', false],
      ['2', 'admin', null, false],
      ['3', 'member', null, true],
      ['4', 'restricted', null, false],
      ['5', 'banned', null, false],
      ['6', 'member', null, false],
    ]
  );
  assert.equal(answer.members[0].name, 'Olga Owner');
  assert.equal(answer.members[3].username, 'rita');
  assert.equal(answer.members[5].name, '6');
});

test('a search uses the search filter with the words', async () => {
  const { members, log } = make(() => ({
    count: 0,
    participants: [],
    chats: [{ creator: true }],
    users: [],
  }));
  const answer = await members.chatMembers({ chat: '-1005', q: ' ann ' });
  assert.equal(log[0].filter.className, 'ChannelParticipantsSearch');
  assert.equal(log[0].filter.q, 'ann');
  assert.equal(log[0].limit, 50);
  assert.equal(answer.canBan, true);
  assert.equal(answer.canInvite, true);
  assert.deepEqual(answer.members, []);
});

test('a basic group: its full chat, paged and searched here', async () => {
  const { members, log } = make(() => ({
    fullChat: {
      participants: {
        participants: [
          { className: 'ChatParticipantCreator', userId: 1n },
          { className: 'ChatParticipantAdmin', userId: 2n, rank: 'mod' },
          { className: 'ChatParticipant', userId: 3n },
        ],
      },
    },
    chats: [{ creator: false }],
    users: [user(1, 'Olga'), user(2, 'Adam'), user(3, 'Carl')],
  }));
  const all = await members.chatMembers({ chat: '-77' });
  assert.equal(log[0].className, 'GetFullChat');
  assert.equal(log[0].chatId, 77n);
  assert.equal(all.total, 3);
  assert.equal(all.canBan, false);
  assert.deepEqual(
    all.members.map((m) => m.role),
    ['creator', 'admin', 'member']
  );
  const page = await members.chatMembers({ chat: '-77', offset: 1, limit: 1 });
  assert.deepEqual(
    page.members.map((m) => m.name),
    ['Adam']
  );
  const found = await members.chatMembers({ chat: '-77', q: 'car' });
  assert.deepEqual(
    found.members.map((m) => m.name),
    ['Carl']
  );
  assert.equal(found.total, 3);
});

test('remove in a supergroup: banned, then at once let go', async () => {
  const { members, log } = make(() => ({}));
  const answer = await members.removeMember({ chat: '-1005', user: '42' });
  assert.deepEqual(answer, { ok: true });
  assert.equal(log.length, 2);
  assert.deepEqual(
    log.map((r) => r.className),
    ['EditBanned', 'EditBanned']
  );
  assert.equal(log[0].participant.userId, 42n);
  assert.equal(log[0].bannedRights.viewMessages, true);
  assert.equal(log[0].bannedRights.untilDate, 0);
  assert.equal(log[1].bannedRights.viewMessages, undefined);
  assert.equal(log[1].bannedRights.untilDate, 0);
});

test('remove in a basic group: the member deleted', async () => {
  const { members, log } = make(() => ({}));
  const answer = await members.removeMember({ chat: '-77', user: '42' });
  assert.equal(answer.ok, true);
  assert.equal(log.length, 1);
  assert.equal(log[0].className, 'DeleteChatUser');
  assert.equal(log[0].chatId, 77n);
  assert.equal(log[0].userId.userId, 42n);
});

test('errors become codes; bad input is refused before Telegram', async () => {
  const { members, log } = make(() => telegramError('CHAT_ADMIN_REQUIRED'));
  assert.deepEqual(await members.removeMember({ chat: '-1005', user: '1' }), {
    ok: false,
    error: 'CHAT_ADMIN_REQUIRED',
    code: 'not-admin',
  });
  assert.equal(
    (await members.chatMembers({ chat: '-1005' })).code,
    'not-admin'
  );
  assert.equal((await members.chatMembers({ chat: '555' })).ok, false);
  assert.equal(
    (await members.removeMember({ chat: '-5', user: 'x' })).ok,
    false
  );
  assert.equal(log.length, 2);
});

const post = async (route, body, account) => {
  const path = `/api/telegram/${route}`;
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
  };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end() {},
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return { status: res.status };
};

test('routes validate strictly', async () => {
  const account = {
    chatMembers: async (r) => ({ ok: true, ...r }),
    removeMember: async (r) => ({ ok: true, ...r }),
  };
  const long = 'x'.repeat(65);
  for (const [route, bad, good] of [
    ['members', { chat: '555' }, { chat: '-1005' }],
    ['members', { chat: '-1005', q: long }, { chat: '-1005', q: 'ann' }],
    ['members', { chat: '-1005', q: 5 }, { chat: '-1005', q: '' }],
    ['members', { chat: '-1005', limit: 201 }, { chat: '-1005', limit: 200 }],
    ['members', { chat: '-1005', limit: 0 }, { chat: '-1005', limit: 1 }],
    ['members', { chat: '-1005', offset: -1 }, { chat: '-1005', offset: 0 }],
    ['members', { chat: '-1005', offset: '1' }, { chat: '-1005', offset: 3 }],
    ['member-remove', { chat: '-1005' }, { chat: '-1005', user: '42' }],
    ['member-remove', { chat: '5', user: '42' }, { chat: '-5', user: '42' }],
    ['member-remove', { chat: '-5', user: '-42' }, { chat: '-5', user: '42' }],
  ]) {
    assert.equal((await post(route, bad, account)).status, 400, route);
    assert.equal((await post(route, good, account)).status, 200, route);
  }
});
