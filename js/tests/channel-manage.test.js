// Managing a channel or group (R-Y216): the requests built for the public
// link, the colours, the emoji status and the inactive channels, Telegram's
// errors as codes, the routes' validation and the page's pure helpers. Fake
// clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createChannelManage } from '../src/sources/telegram-channel-manage.js';
import { moderationOf } from '../src/sources/telegram-chat-info.js';
import { nameOfInput } from '../src/web/chat-public-link.js';
import { dayOf } from '../src/web/chat-channel-limit.js';
import { isTooMany } from '../src/web/chat-invite.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  channels: Object.fromEntries(
    [
      'CheckUsername',
      'UpdateUsername',
      'GetAdminedPublicChannels',
      'DeactivateAllUsernames',
      'UpdateColor',
      'UpdateEmojiStatus',
      'GetInactiveChannels',
      'LeaveChannel',
    ].map((n) => [n, named(n)])
  ),
  InputChannel: named('InputChannel'),
  EmojiStatus: named('EmojiStatus'),
  EmojiStatusEmpty: named('EmojiStatusEmpty'),
};

const NOW = Date.parse('2026-01-01T00:00:00Z');
const CHAT = '-1001234';

const make = (answer) => {
  const log = [];
  const client = fakeClient(answer, log);
  const env = {
    now: () => NOW,
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  return {
    actions: createChannelManage(env, { userClient: async () => client }),
    log,
  };
};

test('checkUsername: free, taken by false, and Telegram errors as codes', async () => {
  const free = make(() => true);
  assert.deepEqual(
    await free.actions.channelUsernameCheck({
      chat: CHAT,
      username: 'my_news',
    }),
    { ok: true, status: 'available' }
  );
  assert.equal(free.log[0].username, 'my_news');
  const taken = make(() => false);
  assert.equal(
    (
      await taken.actions.channelUsernameCheck({
        chat: CHAT,
        username: 'my_news',
      })
    ).code,
    'taken'
  );
  for (const [name, code] of [
    ['USERNAME_INVALID', 'invalid'],
    ['USERNAME_OCCUPIED', 'taken'],
    ['CHANNELS_ADMIN_PUBLIC_TOO_MUCH', 'too-many-public'],
  ]) {
    const bad = make(() => telegramError(name));
    const out = await bad.actions.channelUsernameCheck({
      chat: CHAT,
      username: 'my_news',
    });
    assert.equal(out.code, code);
  }
  const junk = make(() => true);
  assert.equal(
    (await junk.actions.channelUsernameCheck({ chat: CHAT, username: 'a b' }))
      .code,
    'bad-request'
  );
  assert.equal(junk.log.length, 0);
});

test('updateUsername: sets a name, and an empty name makes the chat private', async () => {
  const { actions, log } = make(() => true);
  assert.equal(
    (await actions.channelUsernameSave({ chat: CHAT, username: 'my_news' })).ok,
    true
  );
  assert.equal(
    (await actions.channelUsernameSave({ chat: CHAT, username: '' })).ok,
    true
  );
  assert.deepEqual(
    log.map((r) => [r.className, r.username]),
    [
      ['UpdateUsername', 'my_news'],
      ['UpdateUsername', ''],
    ]
  );
  assert.equal(
    (await actions.channelUsernameSave({ chat: '-5', username: 'my_news' }))
      .code,
    'bad-request'
  );
});

test('the public channels are listed and one link is revoked by its own hash', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetAdminedPublicChannels'
      ? {
          chats: [
            {
              className: 'Channel',
              id: 7n,
              accessHash: 99n,
              title: 'A',
              username: 'aa_aa',
            },
            { className: 'ChatEmpty', id: 8n },
          ],
        }
      : true
  );
  const list = await actions.publicChannels();
  assert.deepEqual(list.channels, [
    { chat: '-1007', title: 'A', username: 'aa_aa' },
  ]);
  assert.equal((await actions.publicLinkRevoke({ chat: '-1007' })).ok, true);
  const update = log.find((r) => r.className === 'UpdateUsername');
  assert.equal(update.username, '');
  assert.equal(update.channel.accessHash, 99n);
  assert.equal(
    (await actions.publicLinkRevoke({ chat: '-1009' })).code,
    'no-access'
  );
});

test('updateColor: name and profile colour, a background emoji, boosts as a code', async () => {
  const { actions, log } = make(() => ({}));
  await actions.channelColorSave({
    chat: CHAT,
    forProfile: false,
    color: 3,
    emoji: '55',
  });
  await actions.channelColorSave({ chat: CHAT, forProfile: true });
  assert.equal(log[0].color, 3);
  assert.equal(log[0].backgroundEmojiId, 55n);
  assert.equal(log[0].forProfile, undefined);
  assert.equal(log[1].forProfile, true);
  assert.equal(log[1].color, undefined);
  const boosts = make(() => telegramError('BOOSTS_REQUIRED'));
  assert.equal(
    (
      await boosts.actions.channelColorSave({
        chat: CHAT,
        forProfile: true,
        color: 1,
      })
    ).code,
    'boosts'
  );
  assert.equal(
    (await actions.channelColorSave({ chat: CHAT, forProfile: 'x' })).code,
    'bad-request'
  );
});

test('updateEmojiStatus: set with an end time, or removed', async () => {
  const { actions, log } = make(() => ({}));
  const until = NOW / 1000 + 3600;
  await actions.channelEmojiStatusSet({ chat: CHAT, documentId: '77', until });
  await actions.channelEmojiStatusSet({ chat: CHAT, documentId: null });
  assert.equal(log[0].emojiStatus.documentId, 77n);
  assert.equal(log[0].emojiStatus.until, until);
  assert.equal(log[1].emojiStatus.className, 'EmojiStatusEmpty');
  assert.equal(
    (
      await actions.channelEmojiStatusSet({
        chat: CHAT,
        documentId: '77',
        until: 5,
      })
    ).code,
    'bad-request'
  );
});

test('inactive channels are listed with dates; only the chosen listed ones are left', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetInactiveChannels'
      ? {
          dates: [1_700_000_000, 1_600_000_000],
          chats: [
            {
              className: 'Channel',
              id: 1n,
              accessHash: 11n,
              title: 'One',
              broadcast: true,
            },
            { className: 'Channel', id: 2n, accessHash: 22n, title: 'Two' },
          ],
        }
      : {}
  );
  const list = await actions.inactiveChannels();
  assert.deepEqual(list.channels[0], {
    chat: '-1001',
    title: 'One',
    date: 1_700_000_000,
    broadcast: true,
  });
  assert.equal(log.filter((r) => r.className === 'LeaveChannel').length, 0);
  const left = await actions.leaveChannels({ chats: ['-1002', '-1009999'] });
  assert.deepEqual(left, { ok: true, left: ['-1002'] });
  const leaves = log.filter((r) => r.className === 'LeaveChannel');
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].channel.accessHash, 22n);
  assert.equal(
    (await actions.leaveChannels({ chats: [] })).code,
    'bad-request'
  );
});

test('deactivateAllUsernames asks once for the chat', async () => {
  const { actions, log } = make(() => true);
  assert.equal((await actions.usernamesDeactivate({ chat: CHAT })).ok, true);
  assert.equal(log[0].className, 'DeactivateAllUsernames');
});

test('the routes refuse junk before the account is asked', async () => {
  const asked = [];
  const account = new Proxy(
    {},
    {
      get: (_t, method) => async (body) => {
        asked.push([method, body]);
        return { ok: true };
      },
    }
  );
  const bad = [
    ['channel-username-check', { chat: CHAT, username: 'ab' }],
    ['channel-username-check', { chat: '5', username: 'my_news' }],
    ['channel-username-save', { chat: CHAT, username: 'no spaces' }],
    ['public-link-revoke', {}],
    ['usernames-deactivate', { chat: 'x' }],
    ['channel-color-save', { chat: CHAT, forProfile: 1 }],
    ['channel-emoji-status', { chat: CHAT, documentId: 'abc' }],
    ['leave-channels', { chats: [] }],
    ['leave-channels', { chats: ['-5'] }],
  ];
  for (const [route, body] of bad) {
    assert.equal((await post(route, body, account)).status, 400, route);
  }
  assert.equal(asked.length, 0);
  const good = [
    ['channel-username-check', { chat: CHAT, username: 'my_news' }],
    ['channel-username-save', { chat: CHAT, username: '' }],
    ['public-channels', {}],
    ['public-link-revoke', { chat: CHAT }],
    ['usernames-deactivate', { chat: CHAT }],
    ['channel-color-save', { chat: CHAT, forProfile: true, color: 2 }],
    ['channel-emoji-status', { chat: CHAT, documentId: null }],
    ['inactive-channels', {}],
    ['leave-channels', { chats: [CHAT] }],
  ];
  for (const [route, body] of good) {
    assert.equal((await post(route, body, account)).status, 200, route);
  }
  assert.equal(asked.length, good.length);
});

test('page helpers: the link typed, the limit codes and the date', () => {
  assert.equal(nameOfInput(' https://t.me/my_news '), 'my_news');
  assert.equal(nameOfInput('@my_news'), 'my_news');
  assert.equal(nameOfInput('t.me/x'), 't.me/x'.replace('t.me/', ''));
  assert.equal(isTooMany('too-many-chats'), true);
  assert.equal(isTooMany('too-many'), true);
  assert.equal(isTooMany('failed'), false);
  assert.equal(dayOf(0, 'en'), '');
  assert.match(dayOf(1_700_000_000, 'en'), /2023/);
  assert.equal(moderationOf({ creator: true }).owner, true);
});
