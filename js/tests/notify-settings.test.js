// Notification settings (R-Y157): the global read and write per peer type,
// the exceptions' mapping, a chat's own settings and its reset, the routes'
// validation, and the pure "should notify" rules. Fake clients; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createNotifySettings,
  exceptionOf,
} from '../src/sources/telegram-notify-settings.js';
import { MUTE_FOREVER } from '../src/sources/telegram-dialogs.js';
import { postRoute } from './helpers/post-route.js';
import {
  NO_RULES,
  exceptionState,
  rulesFrom,
  scopeOf,
  shouldNotify,
  showPreview,
  withChat,
  withScope,
} from '../src/web/notify-rules.js';
import { freshChats, notificationOf } from '../src/web/chat-notify.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  account: {
    GetNotifySettings: named('GetNotifySettings'),
    UpdateNotifySettings: named('UpdateNotifySettings'),
    GetNotifyExceptions: named('GetNotifyExceptions'),
  },
  InputNotifyUsers: named('InputNotifyUsers'),
  InputNotifyChats: named('InputNotifyChats'),
  InputNotifyBroadcasts: named('InputNotifyBroadcasts'),
  InputNotifyPeer: named('InputNotifyPeer'),
  InputPeerNotifySettings: named('InputPeerNotifySettings'),
};

const NOW = 1_700_000_000_000;

const make = ({ settings = {}, exceptions = null } = {}) => {
  const log = [];
  const live = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      if (request.className === 'GetNotifySettings') {
        return settings[request.peer.className] ?? {};
      }
      if (request.className === 'GetNotifyExceptions') {
        return exceptions ?? { updates: [], users: [], chats: [] };
      }
      return true;
    },
  };
  const actions = createNotifySettings(
    {
      now: () => NOW,
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: {
        withPeer: async (_c, chat, use) => use({ chat, userId: BigInt(chat) }),
      },
      live: { handle: async (_c, update) => live.push(update) },
    },
    { userClient: async () => client }
  );
  return { actions, log, live };
};

test('global settings are read for each peer type', async () => {
  const { actions, log } = make({
    settings: {
      InputNotifyUsers: { showPreviews: true },
      InputNotifyChats: {
        muteUntil: MUTE_FOREVER,
        showPreviews: false,
        storiesMuted: true,
      },
      InputNotifyBroadcasts: { muteUntil: 0 },
    },
  });
  const answer = await actions.notifyOverview();
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.scopes.users, {
    on: true,
    previews: true,
    stories: true,
  });
  assert.deepEqual(answer.scopes.chats, {
    on: false,
    previews: false,
    stories: false,
  });
  assert.equal(answer.scopes.broadcasts.on, true);
  const reads = log.filter((r) => r.className === 'GetNotifySettings');
  assert.deepEqual(
    reads.map((r) => r.peer.className),
    ['InputNotifyUsers', 'InputNotifyChats', 'InputNotifyBroadcasts']
  );
  const asked = log.find((r) => r.className === 'GetNotifyExceptions');
  assert.equal(asked.compareSound, true);
});

test('turning a peer type off writes muteUntil max, keeping the rest', async () => {
  const { actions, log } = make({
    settings: { InputNotifyChats: { showPreviews: false } },
  });
  const answer = await actions.notifyScopeSet({ scope: 'chats', on: false });
  assert.deepEqual(answer, {
    ok: true,
    scope: 'chats',
    on: false,
    previews: false,
    stories: true,
  });
  const write = log.find((r) => r.className === 'UpdateNotifySettings');
  assert.equal(write.peer.className, 'InputNotifyChats');
  assert.equal(write.settings.className, 'InputPeerNotifySettings');
  assert.equal(write.settings.muteUntil, MUTE_FOREVER);
  assert.equal(write.settings.showPreviews, false);
});

test('turning on, previews and stories per peer type', async () => {
  const { actions, log } = make({
    settings: { InputNotifyUsers: { muteUntil: MUTE_FOREVER } },
  });
  await actions.notifyScopeSet({ scope: 'users', on: true });
  await actions.notifyScopeSet({ scope: 'users', previews: false });
  await actions.notifyScopeSet({ scope: 'broadcasts', stories: false });
  const writes = log.filter((r) => r.className === 'UpdateNotifySettings');
  assert.equal(writes[0].settings.muteUntil, 0);
  assert.equal(writes[1].settings.showPreviews, false);
  assert.equal(writes[2].peer.className, 'InputNotifyBroadcasts');
  assert.equal(writes[2].settings.storiesMuted, true);
});

test('a bad change is refused before Telegram is asked', async () => {
  const { actions, log } = make();
  for (const body of [
    {},
    { scope: 'nobody', on: true },
    { scope: 'chats' },
    { scope: 'chats', on: 'yes' },
  ]) {
    assert.equal((await actions.notifyScopeSet(body)).ok, false);
  }
  assert.equal(log.length, 0);
});

test('exceptions are mapped with names, scope and state', async () => {
  const exceptions = {
    updates: [
      {
        className: 'UpdateNotifySettings',
        peer: { className: 'NotifyPeer', peer: { userId: 7n } },
        notifySettings: { muteUntil: 0 },
      },
      {
        className: 'UpdateNotifySettings',
        peer: { className: 'NotifyPeer', peer: { channelId: 5n } },
        notifySettings: { muteUntil: NOW / 1000 + 3600, showPreviews: false },
      },
      {
        className: 'UpdateNotifySettings',
        peer: { className: 'NotifyPeer', peer: { channelId: 6n } },
        notifySettings: { muteUntil: MUTE_FOREVER },
      },
      {
        className: 'UpdateNotifySettings',
        peer: { className: 'NotifyPeer', peer: { chatId: 9n } },
        notifySettings: { showPreviews: true },
      },
      {
        className: 'UpdateNotifySettings',
        peer: { className: 'NotifyForumTopic' },
        notifySettings: {},
      },
    ],
    users: [{ id: 7n, firstName: 'Ann', lastName: 'Lee' }],
    chats: [
      { id: 5n, title: 'News', broadcast: true },
      { id: 6n, title: 'Club', megagroup: true },
      { id: 9n, title: 'Old group' },
    ],
  };
  const { actions } = make({ exceptions });
  const { exceptions: list } = await actions.notifyOverview();
  assert.equal(list.length, 4);
  assert.deepEqual(list[0], {
    chat: '7',
    name: 'Ann Lee',
    scope: 'users',
    state: 'unmuted',
    muteUntil: 0,
    forever: false,
    previews: null,
    sound: 'default',
  });
  assert.equal(list[1].chat, '-1005');
  assert.equal(list[1].scope, 'broadcasts');
  assert.equal(list[1].state, 'muted');
  assert.equal(list[1].muteUntil, NOW / 1000 + 3600);
  assert.equal(list[1].previews, false);
  assert.equal(list[2].scope, 'chats');
  assert.equal(list[2].forever, true);
  assert.equal(list[3].chat, '-9');
  assert.equal(list[3].state, 'custom');
  assert.equal(
    exceptionOf({}, { peer: { className: 'NotifyUsers' } }, NOW),
    null
  );
});

test('a chat: its settings, mute, preview and the list following', async () => {
  const { actions, log, live } = make({
    settings: { InputNotifyPeer: { showPreviews: true, muteUntil: 0 } },
  });
  const row = await actions.notifyChat({ chat: '42' });
  assert.equal(row.exception, true);
  assert.equal(row.previews, true);
  assert.equal(row.muteUntil, 0);
  const read = log.find((r) => r.className === 'GetNotifySettings');
  assert.equal(read.peer.className, 'InputNotifyPeer');
  assert.equal(read.peer.peer.userId, 42n);

  const muted = await actions.notifyChatSet({ chat: '42', mute: 3600 });
  assert.equal(muted.muteUntil, NOW / 1000 + 3600);
  const write = log.findLast((r) => r.className === 'UpdateNotifySettings');
  assert.equal(write.settings.muteUntil, NOW / 1000 + 3600);
  assert.equal(write.settings.showPreviews, true);
  assert.equal(live.at(-1).notifySettings.muteUntil, NOW / 1000 + 3600);

  const forever = await actions.notifyChatSet({ chat: '42', mute: 'forever' });
  assert.equal(forever.forever, true);
  await actions.notifyChatSet({ chat: '42', mute: 'off' });
  assert.equal(
    log.findLast((r) => r.className === 'UpdateNotifySettings').settings
      .muteUntil,
    0
  );
  await actions.notifyChatSet({ chat: '42', previews: 'off' });
  assert.equal(
    log.findLast((r) => r.className === 'UpdateNotifySettings').settings
      .showPreviews,
    false
  );
  await actions.notifyChatSet({ chat: '42', previews: 'default' });
  assert.equal(
    'showPreviews' in
      log.findLast((r) => r.className === 'UpdateNotifySettings').settings,
    false
  );
});

test('reset to default sends empty settings', async () => {
  const { actions, log, live } = make({
    settings: { InputNotifyPeer: { showPreviews: false, muteUntil: 99 } },
  });
  const row = await actions.notifyChatSet({ chat: '-1005', reset: true });
  assert.equal(row.exception, false);
  const write = log.find((r) => r.className === 'UpdateNotifySettings');
  assert.equal(write.settings.className, 'InputPeerNotifySettings');
  assert.deepEqual(Object.keys(write.settings), ['className']);
  assert.equal(write.peer.className, 'InputNotifyPeer');
  assert.equal(live.at(-1).notifySettings.muteUntil, 0);
});

test('a chat change needs a chat and something to change', async () => {
  const { actions, log } = make();
  for (const body of [
    {},
    { chat: 'x', reset: true },
    { chat: '42' },
    { chat: '42', mute: -5 },
    { chat: '42', mute: 'soon' },
    { chat: '42', previews: 'maybe' },
  ]) {
    assert.equal((await actions.notifyChatSet(body)).ok, false);
  }
  assert.equal(log.length, 0);
});

test('Telegram refusals become codes', async () => {
  const client = {
    invoke: async () => {
      throw Object.assign(new Error('x'), { errorMessage: 'PEER_ID_INVALID' });
    },
  };
  const actions = createNotifySettings(
    {
      importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
      connection: { withPeer: async (_c, _chat, use) => use({}) },
    },
    { userClient: async () => client }
  );
  const answer = await actions.notifyChat({ chat: '42' });
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'no-access');
});

test('routes validate bodies strictly', async () => {
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
  assert.equal(await postRoute('notify-settings', {}, account), 200);
  assert.equal(
    await postRoute(
      'notify-settings-set',
      { scope: 'chats', on: false },
      account
    ),
    200
  );
  assert.equal(
    await postRoute('notify-settings-set', { scope: 'x', on: false }, account),
    400
  );
  assert.equal(await postRoute('notify-settings-set', {}, account), 400);
  assert.equal(await postRoute('notify-chat', { chat: '-1005' }, account), 200);
  assert.equal(await postRoute('notify-chat', { chat: 'a' }, account), 400);
  assert.equal(
    await postRoute('notify-chat-set', { chat: '42', reset: true }, account),
    200
  );
  assert.equal(
    await postRoute('notify-chat-set', { chat: '42', mute: 3600 }, account),
    200
  );
  assert.equal(
    await postRoute('notify-chat-set', { chat: '42' }, account),
    400
  );
  assert.equal(
    await postRoute('notify-chat-set', { chat: '42', mute: 1.5 }, account),
    400
  );
  assert.equal(
    await postRoute('notify-chat-set', { chat: '42', previews: 'x' }, account),
    400
  );
  assert.deepEqual(
    calls.map(([n]) => n),
    [
      'notifyOverview',
      'notifyScopeSet',
      'notifyChat',
      'notifyChatSet',
      'notifyChatSet',
    ]
  );
});

// --- The pure rules --------------------------------------------------------

const chat = (over = {}) => ({
  source: 'telegram',
  chat: '1',
  kind: 'private',
  muted: false,
  ...over,
});
const rules = (scopes = {}, list = []) =>
  rulesFrom({ ok: true, scopes, exceptions: list });

test('scopes of chats', () => {
  assert.equal(scopeOf(chat()), 'users');
  assert.equal(scopeOf(chat({ kind: 'group' })), 'chats');
  assert.equal(scopeOf(chat({ kind: 'channel' })), 'broadcasts');
});

test('should notify: the cases', () => {
  const off = { on: false, previews: true };
  const on = { on: true, previews: true };
  const cases = [
    ['no rules loaded: as before', chat(), NO_RULES, true],
    ['private on', chat(), rules({ users: on }), true],
    ['private off', chat(), rules({ users: off }), false],
    [
      'group off, private on: a private chat',
      chat(),
      rules({ chats: off, users: on }),
      true,
    ],
    ['group off', chat({ kind: 'group' }), rules({ chats: off }), false],
    [
      'channel off',
      chat({ kind: 'channel' }),
      rules({ broadcasts: off }),
      false,
    ],
    [
      'channel off, groups on',
      chat({ kind: 'channel' }),
      rules({ broadcasts: off, chats: on }),
      false,
    ],
    ['muted chat', chat({ muted: true }), rules({ users: on }), false],
    [
      'muted chat even if unmuted exception says so',
      chat({ muted: true }),
      rules({}, [{ chat: '1', state: 'unmuted', scope: 'users' }]),
      false,
    ],
    [
      'off scope, unmuted exception',
      chat({ kind: 'group', chat: '-5' }),
      rules({ chats: off }, [{ chat: '-5', state: 'unmuted', scope: 'chats' }]),
      true,
    ],
    [
      'off scope, custom exception (preview only)',
      chat({ kind: 'group', chat: '-5' }),
      rules({ chats: off }, [{ chat: '-5', state: 'custom', scope: 'chats' }]),
      false,
    ],
    [
      'on scope, muted exception for a long time',
      chat(),
      rules({ users: on }, [
        { chat: '1', state: 'muted', muteUntil: 4_000_000_000 },
      ]),
      false,
    ],
    [
      'on scope, muted exception that ended',
      chat(),
      rules({ users: on }, [{ chat: '1', state: 'muted', muteUntil: 5 }]),
      true,
    ],
    [
      'another source ignores Telegram rules',
      chat({ source: 'whatsapp' }),
      rules({ users: off }),
      true,
    ],
    [
      "another chat's exception does not apply",
      chat(),
      rules({ users: off }, [{ chat: '2', state: 'unmuted' }]),
      false,
    ],
  ];
  for (const [name, c, r, expected] of cases) {
    assert.equal(shouldNotify(c, r, NOW), expected, name);
  }
});

test("previews: the chat's own, else its scope's", () => {
  const hidden = rules({ chats: { on: true, previews: false } });
  assert.equal(showPreview(chat({ kind: 'group' }), hidden), false);
  assert.equal(showPreview(chat(), hidden), true);
  const own = rules({ chats: { on: true, previews: false } }, [
    { chat: '-5', state: 'custom', previews: true },
  ]);
  assert.equal(showPreview(chat({ kind: 'group', chat: '-5' }), own), true);
  const ownOff = rules({}, [{ chat: '1', state: 'custom', previews: false }]);
  assert.equal(showPreview(chat(), ownOff), false);
  assert.equal(showPreview(chat({ source: 'whatsapp' }), hidden), true);
  assert.equal(showPreview(chat(), NO_RULES), true);
});

test('fresh chats follow the rules and previews read "New message"', () => {
  const r = rules({ chats: { on: false, previews: true } });
  const message = (id, over = {}) => ({
    key: `telegram:${over.chat}`,
    source: 'telegram',
    muted: false,
    unread: 1,
    last: { message: { id }, at: new Date(NOW).toISOString(), mine: false },
    ...over,
  });
  const chats = [
    message(1, { chat: '1', kind: 'private' }),
    message(1, { chat: '-5', kind: 'group' }),
  ];
  const seen = new Map([
    ['telegram:1', 0],
    ['telegram:-5', 0],
  ]);
  const { fresh } = freshChats(seen, chats, {
    now: NOW,
    allow: (c) => shouldNotify(c, r, NOW),
  });
  assert.deepEqual(
    fresh.map((c) => c.chat),
    ['1']
  );
  const t = (key) =>
    ({ appName: 'app', 'chat.notify.hidden': 'New message' })[key] ?? key;
  assert.equal(notificationOf(t, chats[0], false).body, 'New message');
});

test('rules follow a changed scope or chat', () => {
  const start = rules({ chats: { on: true, previews: true } });
  const next = withScope(start, 'chats', { on: false });
  assert.equal(next.scopes.chats.on, false);
  assert.equal(next.scopes.chats.previews, true);
  assert.equal(start.scopes.chats.on, true);
  const added = withChat(
    next,
    {
      chat: '-5',
      exception: true,
      muteUntil: 0,
      forever: false,
      previews: null,
    },
    { name: 'Club', scope: 'chats' }
  );
  assert.equal(added.exceptions.get('-5').state, 'unmuted');
  const gone = withChat(added, { chat: '-5', exception: false }, {});
  assert.equal(gone.exceptions.has('-5'), false);
  assert.deepEqual(exceptionState({ state: 'muted', forever: true }), {
    key: 'muted',
  });
  assert.deepEqual(exceptionState({ state: 'muted', muteUntil: 10 }), {
    key: 'mutedUntil',
    until: 10_000,
  });
  assert.deepEqual(exceptionState({ state: 'unmuted' }), { key: 'unmuted' });
  assert.deepEqual(exceptionState({ state: 'custom' }), { key: 'custom' });
});
