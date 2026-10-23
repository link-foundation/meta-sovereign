// Which reactions a group or channel allows (R-Y160): the setting read off
// a full chat, the available list, the set call, the routes' validation and
// the page's pure helpers. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canReactIn,
  createChatReactions,
  reactionsOf,
  validEmojis,
} from '../src/sources/telegram-chat-reactions.js';
import { postRoute as post } from './helpers/post-route.js';
import {
  allowedReactions,
  DEFAULT_REACTIONS,
  settingOf,
} from '../src/web/chat-reactions.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: {
    GetAvailableReactions: named('GetAvailableReactions'),
    SetChatAvailableReactions: named('SetChatAvailableReactions'),
  },
  ChatReactionsNone: named('ChatReactionsNone'),
  ChatReactionsAll: named('ChatReactionsAll'),
  ChatReactionsSome: named('ChatReactionsSome'),
  ReactionEmoji: named('ReactionEmoji'),
};

const make = ({ answer, fail = null, now } = {}) => {
  const log = [];
  const invoke = async (request) => {
    log.push(request);
    if (fail) {
      throw Object.assign(new Error(fail), { errorMessage: fail });
    }
    return answer;
  };
  const env = {
    importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    ...(now ? { now } : {}),
  };
  const userClient = async () => ({ invoke });
  return { ...createChatReactions(env, { userClient }), log };
};

test('the setting is read off a full chat', () => {
  assert.deepEqual(reactionsOf({}), { mode: 'all' });
  assert.deepEqual(
    reactionsOf({ availableReactions: new Api.ChatReactionsNone() }),
    { mode: 'none' }
  );
  assert.deepEqual(
    reactionsOf({
      availableReactions: new Api.ChatReactionsSome({
        reactions: [
          new Api.ReactionEmoji({ emoticon: '👍' }),
          { className: 'ReactionCustomEmoji', documentId: 1n },
          new Api.ReactionEmoji({ emoticon: '🔥' }),
        ],
      }),
    }),
    { mode: 'some', emojis: ['👍', '🔥'] }
  );
});

test('only the creator or an admin who may change info may set it', () => {
  assert.equal(canReactIn({ creator: true }), true);
  assert.equal(canReactIn({ adminRights: { changeInfo: true } }), true);
  assert.equal(canReactIn({ adminRights: { pinMessages: true } }), false);
  assert.equal(canReactIn({}), false);
});

test('available reactions skip the inactive ones and are kept', async () => {
  let clock = 0;
  const a = make({
    now: () => clock,
    answer: {
      reactions: [
        { reaction: '👍', title: 'Thumbs up' },
        { reaction: '🤡', title: 'Clown', inactive: true },
        { reaction: '🔥', title: 'Fire', premium: true },
      ],
    },
  });
  const first = await a.availableReactions();
  assert.deepEqual(first, {
    ok: true,
    reactions: [
      { emoji: '👍', title: 'Thumbs up', premium: false },
      { emoji: '🔥', title: 'Fire', premium: true },
    ],
  });
  await a.availableReactions();
  assert.equal(a.log.length, 1, 'kept in memory');
  clock = 11 * 60_000;
  await a.availableReactions();
  assert.equal(a.log.length, 2, 'asked again after ten minutes');
});

test('setting some, all and none builds the right call', async () => {
  const a = make({ answer: {} });
  assert.deepEqual(
    await a.chatReactionsSet({
      chat: '-1005',
      mode: 'some',
      reactions: ['👍', '🔥'],
    }),
    { ok: true }
  );
  await a.chatReactionsSet({ chat: '-5', mode: 'all' });
  await a.chatReactionsSet({ chat: '-5', mode: 'none' });
  const [some, all, none] = a.log;
  assert.equal(some.className, 'SetChatAvailableReactions');
  assert.equal(some.peer.chat, '-1005');
  assert.deepEqual(
    some.availableReactions.reactions.map((r) => r.emoticon),
    ['👍', '🔥']
  );
  assert.equal(all.availableReactions.className, 'ChatReactionsAll');
  assert.equal(none.availableReactions.className, 'ChatReactionsNone');
});

test('Telegram errors become codes; nothing to change is fine', async () => {
  const body = { chat: '-5', mode: 'none' };
  const denied = make({ fail: 'CHAT_ADMIN_REQUIRED' });
  assert.equal((await denied.chatReactionsSet(body)).code, 'not-admin');
  const same = make({ fail: 'CHAT_NOT_MODIFIED' });
  assert.deepEqual(await same.chatReactionsSet(body), { ok: true });
  const odd = make({ fail: 'REACTION_INVALID' });
  assert.equal((await odd.chatReactionsSet(body)).code, 'reaction-invalid');
});

test('emoji lists are validated strictly', () => {
  assert.equal(validEmojis(['👍']), true);
  assert.equal(validEmojis([]), false);
  assert.equal(validEmojis(['👍', '👍']), false);
  assert.equal(validEmojis(['']), false);
  assert.equal(validEmojis([5]), false);
  assert.equal(validEmojis(['x'.repeat(17)]), false);
  assert.equal(validEmojis(['x'.repeat(16)]), true);
  const many = Array.from({ length: 101 }, (_, i) => `e${i}`);
  assert.equal(validEmojis(many), false);
  assert.equal(validEmojis(many.slice(0, 100)), true);
});

test('routes reject bad bodies and pass good ones', async () => {
  const seen = [];
  const account = {
    availableReactions: async () => ({ ok: true, reactions: [] }),
    chatReactionsSet: async (b) => {
      seen.push(b);
      return { ok: true };
    },
  };
  const bad = [
    { chat: '5', mode: 'all' },
    { chat: '-5', mode: 'most' },
    { chat: '-5', mode: 'some' },
    { chat: '-5', mode: 'some', reactions: [] },
    { chat: '-5', mode: 'some', reactions: ['x'.repeat(17)] },
    { chat: '-5', mode: 'all', reactions: ['👍'] },
  ];
  for (const body of bad) {
    assert.equal(await post('chat-reactions-set', body, account), 400);
  }
  assert.equal(seen.length, 0);
  assert.equal(
    await post(
      'chat-reactions-set',
      { chat: '-1005', mode: 'some', reactions: ['👍'] },
      account
    ),
    200
  );
  assert.equal(
    await post('chat-reactions-set', { chat: '-5', mode: 'none' }, account),
    200
  );
  assert.deepEqual(seen, [
    { chat: '-1005', mode: 'some', reactions: ['👍'] },
    { chat: '-5', mode: 'none' },
  ]);
  assert.equal(await post('available-reactions', {}, account), 200);
});

test('the picker offers only the allowed reactions', () => {
  assert.deepEqual(allowedReactions(null), DEFAULT_REACTIONS);
  assert.deepEqual(allowedReactions({ mode: 'all' }), DEFAULT_REACTIONS);
  assert.deepEqual(allowedReactions({ mode: 'none' }), []);
  assert.deepEqual(allowedReactions({ mode: 'some', emojis: ['🙏', '👏'] }), [
    '🙏',
    '👏',
  ]);
});

test('a setting just saved is believed over the info for a while', () => {
  const info = { reactions: { mode: 'none' } };
  assert.deepEqual(settingOf('-77', info), { mode: 'none' });
  assert.equal(settingOf('-77', null), null);
});
