// Adding members and administrators (R-Y204): the requests built for a
// supergroup, a channel and a basic group, the people Telegram's privacy
// keeps out, Telegram's errors as codes, the rights shaped per chat type,
// the routes' strictness and the page's helpers. Fake clients; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createChatAdmins } from '../src/sources/telegram-chat-admins.js';
import {
  ALL_ADMIN_RIGHTS,
  grantable,
  kindOfChat,
  rightsFor,
  shapeRights,
  validRank,
  validRights,
} from '../src/sources/telegram-admin-rights.js';
import { canAddMembers, adminErrorText } from '../src/web/chat-add-members.js';
import { mayGrant, startRights } from '../src/web/chat-admin-rights.js';
import {
  canEditAdmin,
  hasAdminSection,
  hasHistorySwitch,
  kindOf,
} from '../src/web/chat-admins.js';
import { named, postRoute } from './helpers/telegram-route.js';

const classes = [
  'contacts.GetContacts',
  'contacts.GetTopPeers',
  'channels.InviteToChannel',
  'channels.GetParticipants',
  'channels.EditAdmin',
  'channels.TogglePreHistoryHidden',
  'messages.AddChatUser',
  'messages.ExportChatInvite',
  'messages.SendMessage',
  'messages.GetFullChat',
  'messages.EditChatAdmin',
  'messages.MigrateChat',
];
const Api = {
  ChannelParticipantsAdmins: named('ChannelParticipantsAdmins'),
  ChatAdminRights: named('ChatAdminRights'),
  InputUser: named('InputUser'),
  InputPeerUser: named('InputPeerUser'),
};
for (const path of classes) {
  const [ns, cls] = path.split('.');
  Api[ns] ??= {};
  Api[ns][cls] = named(cls);
}

const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: () => 7n,
};

const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

const make = (answer) => {
  const log = [];
  const applied = [];
  const remembered = [];
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
  const actions = createChatAdmins(
    {
      importer: async () => ({ Api, helpers }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
      peers: { remember: (...args) => remembered.push(args) },
    },
    {
      userClient: async () => client,
      apply: async (_c, updates) => applied.push(updates),
    }
  );
  return { actions, log, applied, remembered };
};

const person = (id, firstName, extra = {}) => ({
  id: BigInt(id),
  firstName,
  accessHash: 9n,
  ...extra,
});

test('candidates: contacts and top people, no bots, no yourself, no repeats', async () => {
  const { actions } = make((request) =>
    request.className === 'GetContacts'
      ? {
          users: [
            person(2, 'Bob'),
            person(1, 'Ann'),
            person(3, 'Bot', { bot: true }),
            person(4, 'Me', { self: true }),
          ],
        }
      : { users: [person(1, 'Ann'), person(5, 'Cid')] }
  );
  const answer = await actions.addCandidates({ chat: '-1005' });
  assert.deepEqual(
    answer.people.map((p) => [p.id, p.contact]),
    [
      ['1', true],
      ['2', true],
      ['5', false],
    ]
  );
  assert.deepEqual(await actions.addCandidates({ chat: 'x' }), {
    ok: false,
    error: 'bad-request',
    code: 'bad-request',
  });
});

test('a supergroup: inviteToChannel, the missing invitees named', async () => {
  const { actions, log, applied } = make((request) => {
    if (request.className === 'GetContacts') {
      return { users: [person(1, 'Ann'), person(2, 'Bob Brown')] };
    }
    if (request.className === 'GetTopPeers') {
      return { users: [] };
    }
    return {
      updates: { className: 'Updates' },
      missingInvitees: [{ userId: 2n }],
    };
  });
  await actions.addCandidates({ chat: '-1001' });
  const answer = await actions.addMembers({
    chat: '-1001',
    users: ['1', '2'],
  });
  const call = log.find((r) => r.className === 'InviteToChannel');
  assert.equal(call.channel.chat, '-1001');
  assert.deepEqual(
    call.users.map((u) => [u.className, u.userId, u.accessHash]),
    [
      ['InputUser', 1n, 9n],
      ['InputUser', 2n, 9n],
    ]
  );
  assert.deepEqual(answer, {
    ok: true,
    added: ['1'],
    missing: [{ id: '2', name: 'Bob Brown' }],
    failed: [],
  });
  assert.equal(applied.length, 1, 'the updates go through the live handler');
});

test('a basic group: addChatUser one by one, fwd limit 100, privacy is missing', async () => {
  const { actions, log } = make((request) => {
    const id = request.userId.userId;
    if (id === 2n) {
      return telegramError('USER_PRIVACY_RESTRICTED');
    }
    if (id === 3n) {
      return telegramError('USER_NOT_MUTUAL_CONTACT');
    }
    return { updates: {}, missingInvitees: [] };
  });
  const answer = await actions.addMembers({
    chat: '-77',
    users: ['1', '2', '3'],
  });
  assert.equal(log.length, 3);
  assert.equal(log[0].chatId, 77n);
  assert.equal(log[0].fwdLimit, 100);
  assert.deepEqual(
    [answer.added, answer.missing.map((m) => m.id), answer.failed],
    [['1'], ['2', '3'], []]
  );
});

test('errors become codes the page shows', async () => {
  const cases = {
    USER_PRIVACY_RESTRICTED: 'privacy',
    USER_NOT_MUTUAL_CONTACT: 'not-mutual',
    USERS_TOO_MUCH: 'users-too-much',
    USER_CHANNELS_TOO_MUCH: 'user-channels-too-much',
    CHAT_ADMIN_REQUIRED: 'not-admin',
    USER_KICKED: 'kicked',
    BOT_GROUPS_BLOCKED: 'bot-blocked',
  };
  for (const [name, code] of Object.entries(cases)) {
    const { actions } = make(() => telegramError(name));
    const answer = await actions.addMembers({ chat: '-1001', users: ['1'] });
    assert.equal(answer.code, code, name);
    assert.equal(answer.ok, false);
  }
  // A basic group's only person failing for another reason is a failure too.
  const { actions } = make(() => telegramError('USERS_TOO_MUCH'));
  assert.equal(
    (await actions.addMembers({ chat: '-9', users: ['1'] })).code,
    'users-too-much'
  );
});

test('the invite link is exported once and sent to each person asked', async () => {
  const { actions, log } = make((request) =>
    request.className === 'ExportChatInvite'
      ? { link: 'https://t.me/+AbCdEfGh1234' }
      : { updates: [] }
  );
  const answer = await actions.sendInviteLink({
    chat: '-1001',
    users: ['2', '3'],
  });
  assert.deepEqual(answer, { ok: true, sent: ['2', '3'], failed: [] });
  assert.equal(log.filter((r) => r.className === 'ExportChatInvite').length, 1);
  const sends = log.filter((r) => r.className === 'SendMessage');
  assert.equal(sends.length, 2);
  assert.equal(sends[0].message, 'https://t.me/+AbCdEfGh1234');
  assert.equal(sends[0].peer.className, 'InputPeerUser');
});

test('administrators of a supergroup: titles, rights, who promoted them', async () => {
  const { actions, log } = make(() => ({
    participants: [
      {
        className: 'ChannelParticipantCreator',
        userId: 1n,
        adminRights: {},
        rank: 'boss',
      },
      {
        className: 'ChannelParticipantAdmin',
        userId: 2n,
        promotedBy: 1n,
        adminRights: { banUsers: true, changeInfo: true },
        rank: 'mod',
        canEdit: true,
      },
      { className: 'ChannelParticipantSelf', userId: 3n },
    ],
    users: [person(1, 'Olga'), person(2, 'Adam'), person(3, 'Zed')],
  }));
  const answer = await actions.chatAdmins({ chat: '-1001' });
  assert.equal(log[0].filter.className, 'ChannelParticipantsAdmins');
  assert.deepEqual(
    answer.admins.map((a) => [a.id, a.role, a.rank, a.promotedByName]),
    [
      ['1', 'creator', 'boss', null],
      ['2', 'admin', 'mod', 'Olga'],
    ]
  );
  const adam = answer.admins[1];
  assert.equal(adam.rights.banUsers, true);
  assert.equal(adam.rights.postMessages, false);
  assert.equal(adam.canEdit, true);
});

test('administrators of a basic group come from its full chat', async () => {
  const { actions, log } = make(() => ({
    fullChat: {
      participants: {
        participants: [
          { className: 'ChatParticipantCreator', userId: 1n },
          { className: 'ChatParticipantAdmin', userId: 2n, inviterId: 1n },
          { className: 'ChatParticipant', userId: 3n },
        ],
      },
    },
    users: [person(1, 'Olga'), person(2, 'Adam')],
  }));
  const answer = await actions.chatAdmins({ chat: '-55' });
  assert.equal(log[0].chatId, 55n);
  assert.deepEqual(
    answer.admins.map((a) => [a.id, a.promotedByName]),
    [
      ['1', null],
      ['2', 'Olga'],
    ]
  );
});

test('promoting in a supergroup sends the rights of its kind and the title', async () => {
  const { actions, log } = make(() => ({ updates: [] }));
  const answer = await actions.setAdmin({
    chat: '-1001',
    user: '2',
    rights: { banUsers: true, pinMessages: true, postMessages: true },
    rank: 'helper',
  });
  assert.equal(answer.ok, true);
  const call = log[0];
  assert.equal(call.className, 'EditAdmin');
  assert.equal(call.rank, 'helper');
  assert.equal(call.adminRights.banUsers, true);
  assert.equal(call.adminRights.pinMessages, true);
  assert.equal(call.adminRights.postMessages, undefined, 'not a group right');
  assert.equal(call.userId.userId, 2n);
});

test('a channel takes channel rights; no rights at all is refused, dismiss sends none', async () => {
  const { actions, log } = make(() => ({ updates: [] }));
  await actions.setAdmin({
    chat: '-1002',
    user: '2',
    broadcast: true,
    rights: { postMessages: true, banUsers: true },
  });
  assert.equal(log[0].adminRights.postMessages, true);
  assert.equal(log[0].adminRights.banUsers, undefined);
  assert.equal(
    (await actions.setAdmin({ chat: '-1002', user: '2', rights: {} })).code,
    'no-rights'
  );
  await actions.setAdmin({ chat: '-1002', user: '2', dismiss: true });
  assert.deepEqual({ ...log[1].adminRights }, { className: 'ChatAdminRights' });
  assert.equal(log[1].rank, '');
});

test('a basic group: editChatAdmin, no custom rights without an upgrade', async () => {
  const { actions, log } = make(() => true);
  assert.equal((await actions.setAdmin({ chat: '-55', user: '2' })).ok, true);
  assert.equal(log[0].className, 'EditChatAdmin');
  assert.equal(log[0].isAdmin, true);
  await actions.setAdmin({ chat: '-55', user: '2', dismiss: true });
  assert.equal(log[1].isAdmin, false);
  const refused = await actions.setAdmin({
    chat: '-55',
    user: '2',
    rights: { banUsers: true },
  });
  assert.equal(refused.code, 'needs-upgrade');
  assert.equal(log.length, 2);
});

test('rights errors: forbidden, too many admins, a bad title', async () => {
  for (const [name, code] of [
    ['RIGHT_FORBIDDEN', 'right-forbidden'],
    ['ADMINS_TOO_MUCH', 'admins-too-much'],
    ['ADMIN_RANK_INVALID', 'rank-invalid'],
    ['USER_CREATOR', 'user-creator'],
  ]) {
    const { actions } = make(() => telegramError(name));
    const answer = await actions.setAdmin({
      chat: '-1001',
      user: '2',
      rights: { banUsers: true },
    });
    assert.equal(answer.code, code);
  }
});

test('the history for new members: a supergroup toggles, a basic group must upgrade', async () => {
  const { actions, log } = make(() => ({ updates: [] }));
  assert.deepEqual(
    await actions.setHistoryHidden({ chat: '-1001', hidden: true }),
    {
      ok: true,
      hidden: true,
    }
  );
  assert.equal(log[0].className, 'TogglePreHistoryHidden');
  assert.equal(log[0].enabled, true);
  const group = await actions.setHistoryHidden({ chat: '-55', hidden: true });
  assert.equal(group.code, 'needs-upgrade');
  assert.equal(log.length, 1);
});

test('upgrading a group: migrateChat, the new channel id, remembered', async () => {
  const { actions, log, applied, remembered } = make(() => ({
    chats: [
      { className: 'Chat', id: 55n, title: 'Old' },
      { className: 'Channel', id: 9001n, title: 'Old' },
    ],
  }));
  const answer = await actions.upgradeGroup({ chat: '-55' });
  assert.deepEqual(answer, { ok: true, chat: '-1009001', title: 'Old' });
  assert.equal(log[0].chatId, 55n);
  assert.equal(applied.length, 1);
  assert.equal(remembered[0][0], '-1009001');
  assert.equal((await actions.upgradeGroup({ chat: '-1001' })).ok, false);
});

test('rights are shaped per chat type and limited to what the user has', () => {
  assert.equal(kindOfChat('-55'), 'group');
  assert.equal(kindOfChat('-1001'), 'supergroup');
  assert.equal(kindOfChat('-1001', true), 'channel');
  assert.deepEqual(rightsFor('group'), []);
  assert.ok(rightsFor('channel').includes('postMessages'));
  assert.ok(!rightsFor('supergroup').includes('postMessages'));
  assert.ok(rightsFor('supergroup').includes('banUsers'));
  assert.ok(!rightsFor('channel').includes('banUsers'));
  for (const kind of ['channel', 'supergroup']) {
    for (const key of rightsFor(kind)) {
      assert.ok(ALL_ADMIN_RIGHTS.includes(key));
    }
  }
  assert.deepEqual(
    shapeRights({ banUsers: true, postMessages: true }, 'supergroup').banUsers,
    true
  );
  assert.equal(
    'postMessages' in shapeRights({ postMessages: true }, 'supergroup'),
    false
  );
  const mine = { banUsers: true };
  const wanted = { banUsers: true, pinMessages: true };
  const out = grantable(wanted, mine, 'supergroup');
  assert.equal(out.banUsers, true);
  assert.equal(out.pinMessages, false, 'a right we lack cannot be given');
  assert.equal(grantable(wanted, {}, 'supergroup', true).pinMessages, true);
  assert.ok(validRights({ banUsers: true }));
  assert.ok(!validRights({ banUsers: 'yes' }));
  assert.ok(!validRights({ rootAccess: true }));
  assert.ok(!validRights([true]));
  assert.ok(validRank('a'.repeat(16)));
  assert.ok(!validRank('a'.repeat(17)));
  assert.ok(!validRank('a\nb'));
  assert.ok(!validRank(5));
});

test('the routes validate strictly', async () => {
  const calls = [];
  const spy = (name) => async (body) => {
    calls.push([name, body]);
    return { ok: true };
  };
  const account = {
    addCandidates: spy('candidates'),
    addMembers: spy('add'),
    sendInviteLink: spy('link'),
    chatAdmins: spy('admins'),
    setAdmin: spy('set'),
    setHistoryHidden: spy('history'),
    upgradeGroup: spy('upgrade'),
  };
  const bad = [
    ['members-add', { chat: '-1001', users: [] }],
    ['members-add', { chat: '-1001', users: ['x'] }],
    ['members-add', { chat: '-1001', users: ['1', '1'] }],
    ['members-add', { chat: '1001', users: ['1'] }],
    ['members-add', { chat: '-1001' }],
    ['members-invite-link', { chat: '-1001', users: 'all' }],
    ['chat-admins', { chat: 'abc' }],
    ['admin-set', { chat: '-1001', user: '2', rights: { hack: true } }],
    ['admin-set', { chat: '-1001', user: '2', rights: { banUsers: 1 } }],
    ['admin-set', { chat: '-1001', user: '2', rank: 'x'.repeat(17) }],
    ['admin-set', { chat: '-1001', user: 'me' }],
    ['admin-set', { chat: '-1001', user: '2', dismiss: 'yes' }],
    ['history-hidden', { chat: '-1001', hidden: 'true' }],
    ['group-upgrade', { chat: '-1001' }],
    ['group-upgrade', {}],
  ];
  for (const [route, body] of bad) {
    assert.equal(
      await postRoute(route, body, account),
      400,
      `${route} ${JSON.stringify(body)}`
    );
  }
  assert.equal(calls.length, 0, 'nothing reached the account');
  const good = [
    ['chat-add-candidates', { chat: '-1001' }],
    ['members-add', { chat: '-1001', users: ['1', 2] }],
    ['members-invite-link', { chat: '-55', users: ['1'] }],
    ['chat-admins', { chat: '-1001' }],
    [
      'admin-set',
      { chat: '-1001', user: '2', rights: { banUsers: true }, rank: 'ok' },
    ],
    ['admin-set', { chat: '-55', user: '2', rights: { banUsers: true } }],
    ['history-hidden', { chat: '-1001', hidden: false }],
    ['group-upgrade', { chat: '-55' }],
  ];
  for (const [route, body] of good) {
    assert.equal(await postRoute(route, body, account), 200, route);
  }
  assert.deepEqual(calls[1][1].users, ['1', '2'], 'ids as strings');
  assert.equal(
    await postRoute('members-add', { chat: '-1001', users: ['1'] }, {}),
    400,
    'an account without it'
  );
});

test('the page helpers decide what the dialogs offer', () => {
  const chat = { source: 'telegram', chat: '-1001' };
  const info = {
    kind: 'channel',
    canInvite: true,
    canAddAdmins: true,
    creator: true,
    canToggleHistory: true,
    myRights: { banUsers: true },
  };
  assert.ok(canAddMembers(chat, info));
  assert.ok(!canAddMembers(chat, { ...info, canInvite: false }));
  assert.ok(!canAddMembers({ source: 'telegram', chat: '5' }, info));
  assert.ok(hasAdminSection(chat, info));
  assert.ok(!hasAdminSection(chat, { kind: 'channel' }));
  assert.ok(hasHistorySwitch(chat, info));
  assert.ok(!hasHistorySwitch(chat, { ...info, broadcast: true }));
  assert.ok(
    hasHistorySwitch(
      { source: 'telegram', chat: '-55' },
      { ...info, kind: 'group' }
    )
  );
  assert.equal(kindOf(chat, info), 'supergroup');
  assert.equal(kindOf(chat, { broadcast: true }), 'channel');
  assert.ok(mayGrant(info, 'pinMessages'), 'the creator has all');
  assert.ok(mayGrant({ myRights: { banUsers: true } }, 'banUsers'));
  assert.ok(!mayGrant({ myRights: { banUsers: true } }, 'pinMessages'));
  assert.deepEqual(
    startRights({ rights: { banUsers: true } }, 'supergroup').banUsers,
    true
  );
  assert.equal(startRights({}, 'channel').postMessages, false);
  const admin = { role: 'admin', canEdit: true };
  assert.ok(canEditAdmin(info, 'supergroup', admin));
  assert.ok(!canEditAdmin(info, 'supergroup', { ...admin, canEdit: false }));
  assert.ok(!canEditAdmin(info, 'supergroup', { ...admin, self: true }));
  assert.ok(!canEditAdmin(info, 'supergroup', { role: 'creator' }));
  assert.ok(canEditAdmin(info, 'group', { role: 'admin' }));
  assert.ok(
    !canEditAdmin({ ...info, canAddAdmins: false }, 'supergroup', admin)
  );
  const words = {
    'chat.admins.err.privacy': 'P',
    'chat.admins.err.failed': 'F',
  };
  const t = (key) => words[key] ?? key;
  assert.equal(adminErrorText(t, 'privacy'), 'P');
  assert.equal(adminErrorText(t, 'zzz'), 'F');
});
