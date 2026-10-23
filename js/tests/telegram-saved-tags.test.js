// Reaction tags of Saved Messages and the default auto-delete timer
// (R-Y151): the tags' shape and Premium flag, the search by reaction (own
// chat, savedReaction, no filter), renaming (empty removes, 12 characters
// at most), the default timer's read and write, the routes' validation
// and the page's pure helpers. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSavedTags,
  tagsOf,
  validReaction,
} from '../src/sources/telegram-saved-tags.js';
import { createPrivacy } from '../src/sources/telegram-privacy.js';
import { reactionGlyph, reactionKey } from '../src/web/chat-saved-tags.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  messages: {
    GetSavedReactionTags: named('GetSavedReactionTags'),
    Search: named('Search'),
    UpdateSavedReactionTag: named('UpdateSavedReactionTag'),
    GetDefaultHistoryTTL: named('GetDefaultHistoryTTL'),
    SetDefaultHistoryTTL: named('SetDefaultHistoryTTL'),
  },
  InputPeerSelf: named('InputPeerSelf'),
  InputMessagesFilterEmpty: named('InputMessagesFilterEmpty'),
  ReactionEmoji: named('ReactionEmoji'),
  ReactionCustomEmoji: named('ReactionCustomEmoji'),
};

const make = (answer, premium = true) => {
  const log = [];
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const client = {
    ...fakeClient(answer, log),
    getMe: async () => ({ premium }),
  };
  const context = {
    userClient: async () => client,
    tools: {
      toLinks: (dialog, messages) =>
        messages.map((m) => ({ id: `msg:telegram:${dialog.id}:${m.id}` })),
    },
  };
  return {
    ...createSavedTags(env, context),
    ...createPrivacy(env, context),
    log,
  };
};

const tag = (emoticon, count, title) => ({
  className: 'SavedReactionTag',
  reaction: { className: 'ReactionEmoji', emoticon },
  count,
  title,
});

test('savedTags: the tags with their names and counts, and Premium', async () => {
  const { savedTags, log } = make(() => ({
    tags: [
      tag('👍', 3, 'Work'),
      tag('🔥', 1),
      {
        reaction: { className: 'ReactionCustomEmoji', documentId: 77n },
        count: 2,
      },
      { reaction: { className: 'ReactionPaid' }, count: 9 },
    ],
  }));
  const answer = await savedTags();
  assert.equal(answer.ok, true);
  assert.equal(answer.premium, true);
  assert.deepEqual(answer.tags, [
    { reaction: { emoji: '👍' }, title: 'Work', count: 3 },
    { reaction: { emoji: '🔥' }, title: '', count: 1 },
    { reaction: { custom: '77' }, title: '', count: 2 },
  ]);
  assert.equal(log[0].className, 'GetSavedReactionTags');
  assert.equal(String(log[0].hash), '0', 'hash 0 asks for them all');
  assert.equal(
    (await make(() => ({ tags: [] }), false).savedTags()).premium,
    false
  );
  assert.deepEqual(tagsOf(undefined), []);
});

test('savedTagSearch: the own chat, the reaction, no filter, oldest first', async () => {
  const { savedTagSearch, log } = make(() => ({
    messages: [
      { id: 9, className: 'Message' },
      { id: 4, className: 'Message' },
      { id: 5, className: 'MessageEmpty' },
    ],
  }));
  const answer = await savedTagSearch({
    chat: '6',
    reaction: { emoji: '👍' },
  });
  assert.deepEqual(answer, {
    ok: true,
    messages: [{ id: 'msg:telegram:6:4' }, { id: 'msg:telegram:6:9' }],
    more: false,
  });
  const request = log[0];
  assert.equal(request.className, 'Search');
  assert.equal(request.peer.className, 'InputPeerSelf');
  assert.equal(request.q, '');
  assert.equal(request.limit, 50);
  assert.equal(request.filter.className, 'InputMessagesFilterEmpty');
  assert.equal(request.savedReaction[0].className, 'ReactionEmoji');
  assert.equal(request.savedReaction[0].emoticon, '👍');
  const custom = make(() => ({ messages: [] }));
  await custom.savedTagSearch({ chat: '6', reaction: { custom: '77' } });
  assert.equal(custom.log[0].savedReaction[0].documentId, 77n);
  const bad = await custom.savedTagSearch({ chat: 'x', reaction: {} });
  assert.equal(bad.code, 'bad-request');
});

test('savedTagRename: a name, an empty one removes it, long ones are refused', async () => {
  const { savedTagRename, log } = make(() => ({}));
  assert.deepEqual(
    await savedTagRename({ reaction: { emoji: '👍' }, title: ' Work ' }),
    { ok: true, title: 'Work' }
  );
  assert.equal(log[0].className, 'UpdateSavedReactionTag');
  assert.equal(log[0].title, 'Work');
  assert.equal(log[0].reaction.emoticon, '👍');
  await savedTagRename({ reaction: { emoji: '👍' }, title: '' });
  assert.equal('title' in log[1], false, 'no title field removes the name');
  const long = await savedTagRename({
    reaction: { emoji: '👍' },
    title: 'x'.repeat(13),
  });
  assert.equal(long.code, 'bad-request');
  assert.equal(log.length, 2, 'the long one was not sent');
  const locked = make(() => telegramError('PREMIUM_ACCOUNT_REQUIRED'));
  assert.equal(
    (await locked.savedTagRename({ reaction: { emoji: '👍' }, title: 'a' }))
      .code,
    'premium'
  );
});

test('the default timer: read in seconds, set from the allowed periods', async () => {
  const { defaultTtl, setDefaultTtl, log } = make((r) =>
    r.className === 'GetDefaultHistoryTTL' ? { period: 86400 } : true
  );
  assert.deepEqual(await defaultTtl(), { ok: true, period: 86400 });
  assert.deepEqual(await setDefaultTtl({ period: 604800 }), {
    ok: true,
    period: 604800,
  });
  assert.equal(log[1].className, 'SetDefaultHistoryTTL');
  assert.equal(log[1].period, 604800);
  assert.equal((await setDefaultTtl({ period: 3600 })).code, 'bad-request');
  assert.equal(log.length, 2);
  const failing = make(() => telegramError('TTL_PERIOD_INVALID'));
  assert.equal((await failing.setDefaultTtl({ period: 0 })).code, 'bad-period');
});

test('validReaction accepts an emoji or a custom id, not both or neither', () => {
  assert.equal(validReaction({ emoji: '👍' }), true);
  assert.equal(validReaction({ custom: '12' }), true);
  assert.equal(validReaction({ custom: 'ab' }), false);
  assert.equal(validReaction({ emoji: '👍', custom: '1' }), false);
  assert.equal(validReaction({ emoji: '' }), false);
  assert.equal(validReaction(null), false);
});

test('the routes check their bodies before asking the account', async () => {
  const calls = [];
  const remember = (name) => async (r) => (calls.push([name, r]), { ok: true });
  const account = {
    savedTags: remember('tags'),
    savedTagSearch: remember('search'),
    savedTagRename: remember('rename'),
    defaultTtl: remember('ttl'),
    setDefaultTtl: remember('ttl-set'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('saved-tags', {}), 200);
  assert.equal(
    await status('saved-tag-search', { chat: '6', reaction: { emoji: '👍' } }),
    200
  );
  assert.equal(await status('saved-tag-search', { chat: '6' }), 400);
  assert.equal(
    await status('saved-tag-search', { chat: 'x', reaction: { emoji: '👍' } }),
    400
  );
  assert.equal(
    await status('saved-tag-search', {
      chat: '6',
      reaction: { emoji: '👍' },
      offsetId: -1,
    }),
    400
  );
  assert.equal(
    await status('saved-tag-rename', { reaction: { emoji: '👍' }, title: '' }),
    200
  );
  assert.equal(
    await status('saved-tag-rename', {
      reaction: { emoji: '👍' },
      title: 'x'.repeat(13),
    }),
    400
  );
  assert.equal(
    await status('saved-tag-rename', { reaction: { emoji: '👍' } }),
    400
  );
  assert.equal(await status('privacy-ttl', {}), 200);
  assert.equal(await status('privacy-ttl-set', { period: 604800 }), 200);
  assert.equal(await status('privacy-ttl-set', { period: 3600 }), 400);
  assert.equal(await status('privacy-ttl-set', {}), 400);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['tags', 'search', 'rename', 'ttl', 'ttl-set']
  );
  assert.equal(calls.at(-1)[1].period, 604800);
});

test('the page keys and shows a reaction', () => {
  assert.equal(reactionKey({ emoji: '👍' }), '👍');
  assert.equal(reactionKey({ custom: '5' }), 'custom:5');
  assert.equal(reactionGlyph({ emoji: '🔥' }), '🔥');
  assert.equal(reactionGlyph({ custom: '5' }), '★');
});
