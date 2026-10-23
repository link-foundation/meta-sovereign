// Delete all from a member, anti-spam false positives, a broadcast group,
// ownership and the channels left (R-Y200): the requests built, the paging,
// the password's handling, Telegram's errors as codes, the routes and the
// page's helpers. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createModeration } from '../src/sources/telegram-moderation.js';
import { createOwnership } from '../src/sources/telegram-ownership.js';
import {
  createLeftChannels,
  nextOffset,
} from '../src/sources/telegram-left-channels.js';
import { createAdminActions } from '../src/sources/telegram-admin.js';
import { moderationOf } from '../src/sources/telegram-chat-info.js';
import {
  answerText,
  deleteModeration,
  moderationOptions,
} from '../src/web/chat-moderation.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  channels: {
    ReportSpam: named('ReportSpam'),
    EditBanned: named('EditBanned'),
    DeleteParticipantHistory: named('DeleteParticipantHistory'),
    ReportAntiSpamFalsePositive: named('ReportAntiSpamFalsePositive'),
    ConvertToGigagroup: named('ConvertToGigagroup'),
    GetLeftChannels: named('GetLeftChannels'),
    GetAdminLog: named('GetAdminLog'),
  },
  messages: { EditChatCreator: named('EditChatCreator') },
  account: { GetPassword: named('GetPassword') },
  ChatBannedRights: named('ChatBannedRights'),
  InputPeerUser: named('InputPeerUser'),
  InputUser: named('InputUser'),
};

const SECRET = 'correct horse battery staple';
const checks = [];
const srp = {
  computeCheck: async (pwd, password) => {
    checks.push({ pwd, password });
    return { className: 'InputCheckPasswordSRP', M1: 'check' };
  },
};

const make = (answer) => {
  const log = [];
  const client = fakeClient(answer, log);
  const env = {
    importer: async () => ({ Api, helpers, password: srp }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const context = { userClient: async () => client };
  return {
    mod: {
      ...createModeration(env, context),
      ...createOwnership(env, context),
    },
    left: createLeftChannels(env, context),
    admin: createAdminActions(env, context),
    log,
  };
};

const names = (log) => log.map((r) => r.className);
const CHAT = '-1001234';

test('moderateUser: report first, then ban, then delete all while offset is left', async () => {
  let rounds = 0;
  const { mod, log } = make((request) => {
    if (request.className === 'DeleteParticipantHistory') {
      rounds += 1;
      return { pts: 1, ptsCount: 1, offset: rounds < 3 ? 9 : 0 };
    }
    return {};
  });
  const answer = await mod.moderateUser({
    chat: CHAT,
    user: '77',
    ids: [5, 6],
    reportSpam: true,
    ban: true,
    deleteAll: true,
  });
  assert.deepEqual(answer, { ok: true, deleted: true });
  assert.deepEqual(names(log), [
    'ReportSpam',
    'EditBanned',
    'DeleteParticipantHistory',
    'DeleteParticipantHistory',
    'DeleteParticipantHistory',
  ]);
  assert.deepEqual(log[0].id, [5, 6]);
  assert.equal(log[1].bannedRights.viewMessages, true);
  assert.equal(log[1].bannedRights.untilDate, 0);
  assert.equal(log[2].participant.userId, 77n);
});

test('moderateUser asks only for what was ticked and refuses junk', async () => {
  const { mod, log } = make(() => ({}));
  assert.equal(
    (await mod.moderateUser({ chat: CHAT, user: '7', ban: true })).ok,
    true
  );
  assert.deepEqual(names(log), ['EditBanned']);
  for (const junk of [
    { chat: CHAT, user: '7' },
    { chat: '-12', user: '7', ban: true },
    { chat: CHAT, user: 'x', ban: true },
    { chat: CHAT, user: '7', reportSpam: true },
    { chat: CHAT, user: '7', reportSpam: true, ids: [] },
    { chat: CHAT, user: '7', deleteAll: 'yes' },
  ]) {
    assert.equal((await mod.moderateUser(junk)).code, 'bad-request');
  }
  assert.equal(log.length, 1, 'junk never reached Telegram');
});

test('moderateUser: Telegram errors become codes', async () => {
  const { mod } = make(() => telegramError('USER_ADMIN_INVALID'));
  const answer = await mod.moderateUser({ chat: CHAT, user: '7', ban: true });
  assert.deepEqual(answer, {
    ok: false,
    error: 'USER_ADMIN_INVALID',
    code: 'user-admin',
  });
});

test('notSpam reports the message as a false positive', async () => {
  const { mod, log } = make(() => true);
  assert.deepEqual(await mod.notSpam({ chat: CHAT, msgId: '42' }), {
    ok: true,
  });
  assert.equal(log[0].className, 'ReportAntiSpamFalsePositive');
  assert.equal(log[0].msgId, 42);
  assert.equal(
    (await mod.notSpam({ chat: CHAT, msgId: 'x' })).code,
    'bad-request'
  );
});

test('convertToGigagroup needs the confirmation', async () => {
  const { mod, log } = make(() => ({}));
  assert.equal(
    (await mod.convertToGigagroup({ chat: CHAT })).code,
    'bad-request'
  );
  assert.equal(log.length, 0);
  assert.deepEqual(
    await mod.convertToGigagroup({ chat: CHAT, confirm: true }),
    { ok: true }
  );
  assert.equal(log[0].className, 'ConvertToGigagroup');
});

test('transferOwnership: SRP check, the call, and the password goes nowhere', async () => {
  checks.length = 0;
  const { mod, log } = make((request) =>
    request.className === 'GetPassword' ? { hasPassword: true } : {}
  );
  const answer = await mod.transferOwnership({
    chat: CHAT,
    user: '9',
    password: SECRET,
  });
  assert.deepEqual(answer, { ok: true });
  assert.equal(checks[0].password, SECRET);
  const call = log.find((r) => r.className === 'EditChatCreator');
  assert.equal(call.userId.userId, 9n);
  assert.equal(call.password.M1, 'check');
  assert.ok(!JSON.stringify(answer).includes(SECRET));
});

test('transferOwnership: a missing 2-Step password stops before Telegram is asked', async () => {
  const { mod, log } = make(() => ({ hasPassword: false }));
  const answer = await mod.transferOwnership({
    chat: CHAT,
    user: '9',
    password: SECRET,
  });
  assert.equal(answer.code, 'password-missing');
  assert.ok(!names(log).includes('EditChatCreator'));
});

test('transferOwnership: fresh password/session carry the wait; the password never leaks', async () => {
  for (const [name, code, wait] of [
    ['PASSWORD_TOO_FRESH_86400', 'password-fresh', 86400],
    ['SESSION_TOO_FRESH_3600', 'session-fresh', 3600],
    ['PASSWORD_MISSING', 'password-missing', undefined],
    ['PASSWORD_HASH_INVALID', 'password-wrong', undefined],
  ]) {
    const { mod } = make((request) =>
      request.className === 'GetPassword'
        ? { hasPassword: true }
        : telegramError(name)
    );
    const answer = await mod.transferOwnership({
      chat: CHAT,
      user: '9',
      password: SECRET,
    });
    assert.equal(answer.code, code, name);
    assert.equal(answer.waitSeconds, wait, name);
    assert.ok(!JSON.stringify(answer).includes(SECRET), name);
  }
});

test('transferOwnership retries once when the SRP data went stale', async () => {
  let tries = 0;
  const { mod } = make((request) => {
    if (request.className === 'GetPassword') {
      return { hasPassword: true };
    }
    tries += 1;
    return tries === 1 ? telegramError('SRP_ID_INVALID') : {};
  });
  assert.deepEqual(
    await mod.transferOwnership({ chat: CHAT, user: '9', password: SECRET }),
    { ok: true }
  );
  assert.equal(tries, 2);
});

test('transferOwnership validates the request', async () => {
  const { mod, log } = make(() => ({}));
  for (const junk of [
    { chat: CHAT, user: '9' },
    { chat: CHAT, user: '9', password: '' },
    { chat: CHAT, user: '9', password: 'x'.repeat(257) },
    { chat: '12', user: '9', password: 'x' },
    { chat: CHAT, user: 'abc', password: 'x' },
  ]) {
    assert.equal((await mod.transferOwnership(junk)).code, 'bad-request');
  }
  assert.equal(log.length, 0);
});

test('leftChannels: a page, the channel list, the next offset', async () => {
  const channel = (id) => ({
    className: 'Channel',
    id: BigInt(id),
    title: `Chan ${id}`,
    broadcast: true,
    participantsCount: 5,
  });
  const { left, log } = make((request) => ({
    chats: [channel(1), { className: 'Chat', id: 2n }, channel(3)],
    count: request.offset === 0 ? 5 : 3,
  }));
  const first = await left.leftChannels({});
  assert.equal(log[0].offset, 0);
  assert.deepEqual(
    first.channels.map((c) => c.chat),
    ['-1001', '-1003']
  );
  assert.equal(first.next, 2);
  const second = await left.leftChannels({ offset: 2 });
  assert.equal(second.next, null);
  assert.equal((await left.leftChannels({ offset: -1 })).code, 'bad-request');
  assert.equal(nextOffset({ chats: [] }, 0, 100), 100);
  assert.equal(nextOffset({ chats: [] }, 0, 3), null);
});

test('adminLog carries a deleted message id for Not spam', async () => {
  const { admin } = make(() => ({
    users: [{ id: 1n, firstName: 'Bot' }],
    events: [
      {
        id: 5n,
        date: 10,
        userId: 1n,
        action: {
          className: 'ChannelAdminLogEventActionDeleteMessage',
          message: { id: 321, message: 'buy now' },
        },
      },
    ],
  }));
  const answer = await admin.adminLog({ chat: CHAT });
  assert.equal(answer.events[0].kind, 'delete');
  assert.equal(answer.events[0].msgId, 321);
});

test('routes validate strictly', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (body) => {
        calls.push([name, body]);
        return { ok: true };
      },
    }
  );
  for (const [route, bad, good] of [
    [
      'moderate-user',
      { chat: CHAT, user: '7' },
      { chat: CHAT, user: '7', ban: true },
    ],
    ['not-spam', { chat: CHAT }, { chat: CHAT, msgId: 3 }],
    ['convert-gigagroup', { chat: CHAT }, { chat: CHAT, confirm: true }],
    [
      'transfer-ownership',
      { chat: CHAT, user: '7', password: '' },
      { chat: CHAT, user: '7', password: 'p' },
    ],
    ['left-channels', { offset: 'a' }, {}],
  ]) {
    assert.equal((await post(route, bad, account)).status, 400, route);
    assert.equal((await post(route, good, account)).status, 200, route);
  }
  assert.equal(calls.length, 5);
});

test('page helpers: what a delete dialog may offer', () => {
  const info = { canBan: true, canDeleteMessages: true };
  assert.deepEqual(moderationOptions(info, { withReport: true }), [
    'reportSpam',
    'ban',
    'deleteAll',
  ]);
  assert.deepEqual(moderationOptions(info), ['ban', 'deleteAll']);
  assert.deepEqual(moderationOptions({ canBan: true }, { withReport: true }), [
    'ban',
  ]);
  assert.deepEqual(moderationOptions({}), []);
  const current = { source: 'telegram', chat: CHAT };
  const one = (sender) => ({ id: 1, sender, senderName: 'Eve' });
  assert.deepEqual(deleteModeration(current, info, [one('5'), one('5')]), {
    options: ['reportSpam', 'ban', 'deleteAll'],
    user: '5',
    name: 'Eve',
  });
  assert.equal(
    deleteModeration(current, info, [one('5'), one('6')]),
    null,
    'two senders'
  );
  assert.equal(
    deleteModeration(current, info, [one('me')]),
    null,
    'own message'
  );
  assert.equal(
    deleteModeration(current, { ...info, broadcast: true }, [one('5')]),
    null,
    'channel'
  );
  assert.equal(
    deleteModeration({ source: 'telegram', chat: '-12' }, info, [one('5')]),
    null,
    'basic group'
  );
  assert.equal(deleteModeration(current, {}, [one('5')]), null, 'no rights');
});

test('page helpers: waits in hours, owner flags', () => {
  const t = (key, vars) =>
    key === 'chat.mod.err.password-fresh' ? `wait ${vars.hours}` : key;
  assert.equal(
    answerText(t, { code: 'password-fresh', waitSeconds: 86400 }),
    'wait 24'
  );
  assert.equal(
    answerText(t, { code: 'password-fresh', waitSeconds: 1 }),
    'wait 1'
  );
  assert.deepEqual(moderationOf({ creator: true, megagroup: true }), {
    canDeleteMessages: true,
    owner: true,
    canConvertGiga: true,
    gigagroup: false,
  });
  assert.equal(
    moderationOf({ creator: true, megagroup: true, gigagroup: true })
      .canConvertGiga,
    false
  );
  assert.equal(
    moderationOf({ adminRights: { deleteMessages: true } }).owner,
    false
  );
});
