// Who read a message and who reacted to it (R-Y127): the readers of a
// small group's message with their times, the reactions' pages, the
// error codes, the menu's offers and the routes. Fake clients; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReadersActions } from '../src/sources/telegram-readers.js';
import { named, postRoute } from './helpers/telegram-route.js';
import { menuItems } from '../src/web/chat-selection.js';
import { reactionsOf } from '../src/web/chat-readers.js';

const Api = {
  messages: {
    GetMessageReadParticipants: named('GetMessageReadParticipants'),
    GetMessageReactionsList: named('GetMessageReactionsList'),
  },
  ReactionEmoji: named('ReactionEmoji'),
};

const make = ({ answer, fail = null } = {}) => {
  const log = [];
  const actions = createReadersActions(
    {
      importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
      queue: { run: async (_k, _p, fn) => fn() },
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => ({
        invoke: async (request) => {
          log.push(request);
          if (fail) {
            throw Object.assign(new Error(fail), { errorMessage: fail });
          }
          return answer;
        },
        getEntity: async (id) => {
          if (String(id) === '3') {
            throw new Error('unknown');
          }
          return { firstName: `User${id}`, lastName: 'X' };
        },
      }),
    }
  );
  return { ...actions, log };
};

test('readers: names and times, the latest first', async () => {
  const { messageReaders, log } = make({
    answer: [
      { userId: 1n, date: 100 },
      { userId: 3n, date: 300 },
      { userId: 2n, date: 200 },
    ],
  });
  const got = await messageReaders({ chat: '-5', id: 9 });
  assert.equal(got.ok, true);
  assert.deepEqual(got.readers, [
    { id: '3', name: '3', date: 300_000 },
    { id: '2', name: 'User2 X', date: 200_000 },
    { id: '1', name: 'User1 X', date: 100_000 },
  ]);
  assert.deepEqual([log[0].peer, log[0].msgId], [{ chat: '-5' }, 9]);
});

test('readers and reactors: Telegram errors become codes', async () => {
  const old = make({ fail: 'MSG_TOO_OLD' });
  assert.equal(
    (await old.messageReaders({ chat: '-5', id: 9 })).code,
    'too-old'
  );
  const big = make({ fail: 'CHAT_TOO_BIG' });
  assert.equal(
    (await big.messageReactors({ chat: '-5', id: 9 })).code,
    'too-big'
  );
  const odd = make({ fail: 'SOMETHING' });
  assert.equal(
    (await odd.messageReaders({ chat: '-5', id: 9 })).code,
    'failed'
  );
  assert.equal((await odd.messageReaders({ chat: 'x', id: 9 })).ok, false);
  assert.equal(odd.log.length, 1, 'nothing asked for bad input');
});

test('reactors: who reacted with what, by page', async () => {
  const { messageReactors, log } = make({
    answer: {
      count: 3,
      reactions: [
        {
          peerId: { userId: 1n },
          date: 10,
          my: true,
          reaction: { className: 'ReactionEmoji', emoticon: '👍' },
        },
        {
          peerId: { userId: 2n },
          date: 20,
          reaction: { className: 'ReactionCustomEmoji', documentId: 77n },
        },
      ],
      users: [
        { id: 1n, firstName: 'Ann' },
        { id: 2n, username: 'bob' },
      ],
      chats: [],
      nextOffset: 'abc',
    },
  });
  const got = await messageReactors({
    chat: '-1005',
    id: 4,
    emoji: '👍',
    offset: 'zz',
  });
  assert.equal(got.count, 3);
  assert.equal(got.next, 'abc');
  assert.deepEqual(got.items[0], {
    peer: '1',
    name: 'Ann',
    kind: 'user',
    username: null,
    deletedAccount: false,
    emoji: '👍',
    customEmojiId: null,
    date: 10_000,
    my: true,
  });
  assert.equal(got.items[1].customEmojiId, '77');
  assert.equal(got.items[1].name, 'bob');
  assert.equal(log[0].offset, 'zz');
  assert.equal(log[0].reaction.emoticon, '👍');
  assert.equal(log[0].limit, 50);
});

test('the menu offers Seen by on own messages in groups, and reactions', () => {
  const own = {
    id: 'msg:telegram:-5:9',
    source: 'telegram',
    sender: 'me',
    raw: {
      reactions: {
        results: [{ reaction: { emoticon: '🔥' }, count: 2 }],
      },
    },
  };
  const group = { chat: '-5', kind: 'group' };
  const items = menuItems({ message: own, chat: group });
  assert.ok(items.includes('readers'));
  assert.ok(items.includes('reactors'));
  assert.deepEqual(reactionsOf(own), [{ emoji: '🔥', count: 2 }]);
  const other = { ...own, sender: '7', raw: {} };
  const plain = menuItems({ message: other, chat: group });
  assert.ok(!plain.includes('readers') && !plain.includes('reactors'));
  const dm = menuItems({ message: own, chat: { chat: '7', kind: 'private' } });
  assert.ok(!dm.includes('readers'));
  const channel = menuItems({ message: own, chat: { kind: 'channel' } });
  assert.ok(!channel.includes('readers'));
});

test('routes validate strictly', async () => {
  const account = {
    messageReaders: async () => ({ ok: true }),
    messageReactors: async () => ({ ok: true }),
  };
  for (const [route, bad, good] of [
    ['readers', { chat: '-5' }, { chat: '-5', id: 3 }],
    ['readers', { chat: '-5', id: 0 }, { chat: '-5', id: 1 }],
    [
      'reactors',
      { chat: '-5', id: 3, emoji: 4 },
      { chat: '-5', id: 3, emoji: '👍' },
    ],
    [
      'reactors',
      { chat: '-5', id: 3, offset: 4 },
      { chat: '-5', id: 3, offset: 'a' },
    ],
  ]) {
    assert.equal(await postRoute(route, bad, account), 400, route);
    assert.equal(await postRoute(route, good, account), 200, route);
  }
});
