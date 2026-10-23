// Sticker and emoji extras (R-Y206): trending sets, clearing the recent
// stickers, the sets of a photo, the quick reaction, custom emoji search,
// the emoji words kept in the store and brought up to date, the routes'
// validation and the page's pure helpers. Fake clients; nothing reaches a
// network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStickerTrending } from '../src/sources/telegram-sticker-trending.js';
import { createQuickReaction } from '../src/sources/telegram-quick-reaction.js';
import { createCustomEmojiSearch } from '../src/sources/telegram-custom-emoji-search.js';
import {
  applyDifference,
  createEmojiKeywords,
} from '../src/sources/telegram-emoji-keywords.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { colonWord, suggestedEmoji } from '../src/web/chat-emoji-suggest.js';
import { hasAttachedStickers } from '../src/web/chat-attached-button.js';
import { quickPick } from '../src/web/chat-quick-reaction.js';
import { named, postRoute } from './helpers/telegram-route.js';

const API = {
  ReactionEmoji: named('ReactionEmoji'),
  InputPhoto: named('InputPhoto'),
  InputDocument: named('InputDocument'),
  InputStickeredMediaPhoto: named('InputStickeredMediaPhoto'),
  InputStickeredMediaDocument: named('InputStickeredMediaDocument'),
  help: { GetConfig: named('help.GetConfig') },
  messages: Object.fromEntries(
    [
      'GetFeaturedStickers',
      'GetOldFeaturedStickers',
      'GetFeaturedEmojiStickers',
      'ReadFeaturedStickers',
      'ClearRecentStickers',
      'GetAttachedStickers',
      'SetDefaultReaction',
      'SearchCustomEmoji',
      'GetEmojiKeywords',
      'GetEmojiKeywordsDifference',
    ].map((n) => [n, named(`messages.${n}`)])
  ),
};

const makeEnv = (answers, store = undefined) => {
  const log = [];
  const env = {
    store,
    queue: { run: async (_k, _p, fn) => fn() },
    importer: async () => ({ Api: API, helpers: { returnBigInt: BigInt } }),
  };
  const userClient = async () => ({
    invoke: async (request) => {
      log.push(request);
      const answer = answers[request.className];
      if (answer instanceof Error) {
        throw answer;
      }
      return typeof answer === 'function' ? answer(request) : (answer ?? true);
    },
  });
  return { env, userClient, log };
};

const set = (id, extra = {}) => ({
  id: BigInt(id),
  accessHash: 9n,
  title: `Set ${id}`,
  count: 4,
  ...extra,
});

const makeTrending = (answers, raw = null) => {
  const store = createMemoryStore();
  const { env, userClient, log } = makeEnv(answers, store);
  const learned = [];
  let changed = 0;
  const actions = createStickerTrending(env, {
    userClient,
    stickers: {
      learn: (s) => learned.push(String(s.id)),
      changed: () => (changed += 1),
    },
  });
  return { actions, log, learned, store, raw, changes: () => changed };
};

test('trending: sets with installed and unread marks, learned for later', async () => {
  const { actions, log, learned } = makeTrending({
    'messages.GetFeaturedStickers': {
      count: 30,
      unread: [2n],
      sets: [
        { className: 'StickerSetCovered', set: set(1, { installedDate: 5 }) },
        { className: 'StickerSetNoCovered', set: set(2) },
        {
          className: 'StickerSetCovered',
          set: set(3, { installedDate: 1, archived: true }),
        },
      ],
    },
  });
  const answer = await actions.featuredStickers();
  assert.equal(answer.ok, true);
  assert.deepEqual(
    answer.sets.map((s) => [s.id, s.installed, s.unread]),
    [
      ['1', true, false],
      ['2', false, true],
      ['3', false, false],
    ]
  );
  assert.equal(answer.sets[0].accessHash, '9');
  assert.deepEqual(answer.unread, ['2']);
  assert.equal(answer.count, 30);
  assert.equal(answer.next, null);
  assert.deepEqual(learned, ['1', '2', '3']);
  assert.equal(log[0].className, 'messages.GetFeaturedStickers');
  assert.equal(log[0].hash, 0n);
});

test('trending: more asks older sets from an offset, emoji asks its own list', async () => {
  const { actions, log } = makeTrending({
    'messages.GetOldFeaturedStickers': { sets: [set(5), set(6)] },
    'messages.GetFeaturedEmojiStickers': { sets: [set(7, { emojis: true })] },
  });
  const more = await actions.featuredStickers({
    old: true,
    offset: 10,
    limit: 2,
  });
  assert.equal(log[0].className, 'messages.GetOldFeaturedStickers');
  assert.equal(log[0].offset, 10);
  assert.equal(log[0].limit, 2);
  assert.equal(more.next, 12, 'a full page leaves another');
  const short = await actions.featuredStickers({ old: true, limit: 5 });
  assert.equal(short.next, null, 'a short page is the last');
  const emoji = await actions.featuredStickers({ emojis: true });
  assert.equal(log.at(-1).className, 'messages.GetFeaturedEmojiStickers');
  assert.equal(emoji.sets[0].emoji, true);
  for (const body of [
    { offset: -1 },
    { limit: 0 },
    { limit: 101 },
    { offset: 1.5 },
  ]) {
    assert.equal((await actions.featuredStickers(body)).code, 'bad-request');
  }
});

test('trending: read, clear recent, and Telegram errors as codes', async () => {
  const { actions, log, changes } = makeTrending({});
  assert.deepEqual(await actions.featuredRead({ ids: ['3', '-4'] }), {
    ok: true,
  });
  assert.deepEqual(log[0].id, [3n, -4n]);
  for (const ids of [
    [],
    'x',
    ['a'],
    ['1;2'],
    Array.from({ length: 201 }, (_, i) => String(i)),
  ]) {
    assert.equal((await actions.featuredRead({ ids })).code, 'bad-request');
  }
  assert.deepEqual(await actions.recentStickersClear(), { ok: true });
  assert.equal(log.at(-1).className, 'messages.ClearRecentStickers');
  assert.equal(changes(), 1, 'the panel asks its lists again');
  const failing = makeTrending({
    'messages.GetFeaturedStickers': Object.assign(new Error('x'), {
      errorMessage: 'FLOOD',
    }),
  });
  const failed = await failing.actions.featuredStickers();
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'failed');
});

const photoRaw = (extra = {}) => ({
  media: {
    className: 'MessageMediaPhoto',
    photo: {
      id: 11n,
      accessHash: 12n,
      fileReference: Buffer.from('ref'),
      hasStickers: true,
      ...extra,
    },
  },
});

test('attached stickers: the sets of a stored photo or marked video', async () => {
  const { actions, log, store, learned } = makeTrending({
    'messages.GetAttachedStickers': [
      { className: 'StickerSetCovered', set: set(8) },
    ],
  });
  await store.put({ id: 'msg:telegram:5:7', raw: photoRaw() });
  const answer = await actions.attachedStickers({ chat: '5', id: '7' });
  assert.equal(answer.ok, true);
  assert.equal(answer.sets[0].id, '8');
  assert.deepEqual(learned, ['8']);
  const media = log[0].media;
  assert.equal(media.className, 'InputStickeredMediaPhoto');
  assert.equal(media.id.id, 11n);
  assert.equal(media.id.accessHash, 12n);
  assert.deepEqual([...media.id.fileReference], [...Buffer.from('ref')]);

  await store.put({
    id: 'msg:telegram:5:8',
    raw: {
      media: {
        className: 'MessageMediaDocument',
        document: {
          id: 21n,
          accessHash: 22n,
          attributes: [{ className: 'DocumentAttributeHasStickers' }],
        },
      },
    },
  });
  await actions.attachedStickers({ chat: '5', id: '8' });
  assert.equal(log.at(-1).media.className, 'InputStickeredMediaDocument');

  await store.put({ id: 'msg:telegram:5:9', raw: { media: null } });
  assert.equal(
    (await actions.attachedStickers({ chat: '5', id: '9' })).code,
    'no-stickers'
  );
  assert.equal(
    (await actions.attachedStickers({ chat: '5', id: '404' })).code,
    'no-stickers'
  );
  assert.equal(
    (await actions.attachedStickers({ chat: 'x', id: '1' })).code,
    'bad-request'
  );
  assert.equal(
    (await actions.attachedStickers({ chat: '5', id: '1;2' })).code,
    'bad-request'
  );
});

test('quick reaction: read from the config once, set with an emoji', async () => {
  const { env, userClient, log } = makeEnv({
    'help.GetConfig': {
      reactionsDefault: { className: 'ReactionEmoji', emoticon: '❤️' },
    },
  });
  const { quickReaction, quickReactionSet } = createQuickReaction(env, {
    userClient,
  });
  assert.deepEqual(await quickReaction(), { ok: true, emoji: '❤️' });
  await quickReaction();
  assert.equal(log.length, 1, 'asked once');
  assert.deepEqual(await quickReactionSet({ emoji: '🔥' }), {
    ok: true,
    emoji: '🔥',
  });
  assert.equal(log[1].className, 'messages.SetDefaultReaction');
  assert.equal(log[1].reaction.className, 'ReactionEmoji');
  assert.equal(log[1].reaction.emoticon, '🔥');
  assert.deepEqual(await quickReaction(), { ok: true, emoji: '🔥' });
  for (const emoji of ['', ' ', 'a b', 7, null, 'x'.repeat(17)]) {
    assert.equal((await quickReactionSet({ emoji })).code, 'bad-request');
  }
  const custom = makeEnv({
    'help.GetConfig': {
      reactionsDefault: { className: 'ReactionCustomEmoji', documentId: 1n },
    },
  });
  const other = createQuickReaction(custom.env, {
    userClient: custom.userClient,
  });
  assert.deepEqual(await other.quickReaction(), { ok: true, emoji: null });
});

test('custom emoji search: ids as strings, kept, strict words', async () => {
  let time = 0;
  const { env, userClient, log } = makeEnv({
    'messages.SearchCustomEmoji': {
      className: 'EmojiList',
      documentId: [5n, 6n],
    },
  });
  const { customEmojiSearch } = createCustomEmojiSearch(
    env,
    { userClient },
    { now: () => time }
  );
  assert.deepEqual(await customEmojiSearch({ q: ' cat ' }), {
    ok: true,
    ids: ['5', '6'],
  });
  await customEmojiSearch({ q: 'cat' });
  assert.equal(log.length, 1, 'kept');
  assert.equal(log[0].emoticon, 'cat');
  time = 11 * 60_000;
  await customEmojiSearch({ q: 'cat' });
  assert.equal(log.length, 2, 'asked again after ten minutes');
  for (const q of ['', '  ', null, 'x'.repeat(65)]) {
    assert.equal((await customEmojiSearch({ q })).code, 'bad-request');
  }
  const notModified = makeEnv({
    'messages.SearchCustomEmoji': { className: 'EmojiListNotModified' },
  });
  const none = createCustomEmojiSearch(notModified.env, {
    userClient: notModified.userClient,
  });
  assert.deepEqual(await none.customEmojiSearch({ q: 'dog' }), {
    ok: true,
    ids: [],
  });
});

test('emoji words: stored per language, then only the difference is asked', async () => {
  const store = createMemoryStore();
  const time = 0;
  const answers = {
    'messages.GetEmojiKeywords': {
      version: 3,
      keywords: [
        { className: 'EmojiKeyword', keyword: 'Cat', emoticons: ['🐱'] },
        { className: 'EmojiKeyword', keyword: 'dog', emoticons: ['🐶', '🐕'] },
      ],
    },
    'messages.GetEmojiKeywordsDifference': {
      version: 4,
      keywords: [
        { className: 'EmojiKeyword', keyword: 'cat', emoticons: ['😺'] },
        { className: 'EmojiKeywordDeleted', keyword: 'dog', emoticons: ['🐕'] },
      ],
    },
  };
  const first = makeEnv(answers, store);
  const one = createEmojiKeywords(
    first.env,
    { userClient: first.userClient },
    { now: () => time }
  );
  const got = await one.emojiKeywords({ lang: 'en' });
  assert.equal(got.version, 3);
  assert.deepEqual(got.keywords.cat, ['🐱']);
  assert.equal(first.log.length, 1);
  const stored = await store.get('emojikw:en');
  assert.equal(stored.version, 3);
  assert.deepEqual(stored.keywords.dog, ['🐶', '🐕']);

  // A new run (a restart): the stored list is made current.
  const second = makeEnv(answers, store);
  const two = createEmojiKeywords(
    second.env,
    { userClient: second.userClient },
    { now: () => time }
  );
  const next = await two.emojiKeywords({ lang: 'en' });
  assert.equal(second.log.length, 1);
  assert.equal(second.log[0].className, 'messages.GetEmojiKeywordsDifference');
  assert.equal(second.log[0].fromVersion, 3);
  assert.equal(next.version, 4);
  assert.deepEqual(next.keywords.cat, ['🐱', '😺']);
  assert.deepEqual(next.keywords.dog, ['🐶']);
  assert.equal((await store.get('emojikw:en')).version, 4);
  await two.emojiKeywords({ lang: 'en' });
  assert.equal(second.log.length, 1, 'kept in memory for a day');
  // Another language has its own list.
  await two.emojiKeywords({ lang: 'ru' });
  assert.equal(second.log.at(-1).className, 'messages.GetEmojiKeywords');
});

test('applyDifference adds, merges and removes words without touching its input', () => {
  const before = { cat: ['🐱'], dog: ['🐕'] };
  const after = applyDifference(before, {
    keywords: [
      { className: 'EmojiKeyword', keyword: 'Cat', emoticons: ['😺', '🐱'] },
      { className: 'EmojiKeywordDeleted', keyword: 'dog', emoticons: ['🐕'] },
      { className: 'EmojiKeyword', keyword: ' ', emoticons: ['🐶'] },
    ],
  });
  assert.deepEqual({ ...after }, { cat: ['🐱', '😺'] });
  assert.deepEqual(before, { cat: ['🐱'], dog: ['🐕'] });
});

test('the routes check their bodies before asking the account', async () => {
  const calls = [];
  const spy = (name) => async (arg) => {
    calls.push([name, arg]);
    return { ok: true };
  };
  const account = Object.fromEntries(
    [
      'featuredStickers',
      'featuredRead',
      'recentStickersClear',
      'attachedStickers',
      'quickReaction',
      'quickReactionSet',
      'customEmojiSearch',
    ].map((n) => [n, spy(n)])
  );
  const good = [
    ['sticker-featured', {}],
    ['sticker-featured', { emojis: true }],
    ['sticker-featured', { old: true, offset: 20, limit: 20 }],
    ['sticker-featured-read', { ids: ['1', 2] }],
    ['sticker-recent-clear', {}],
    ['sticker-attached', { chat: '-100', id: 7 }],
    ['quick-reaction', {}],
    ['quick-reaction-set', { emoji: '👍' }],
    ['custom-emoji-search', { q: 'cat' }],
  ];
  for (const [route, body] of good) {
    assert.equal(await postRoute(route, body, account), 200, route);
  }
  assert.equal(calls.length, good.length);
  assert.deepEqual(calls[3], ['featuredRead', { ids: ['1', '2'] }]);
  assert.deepEqual(calls[5], ['attachedStickers', { chat: '-100', id: '7' }]);
  const bad = [
    ['sticker-featured', { emojis: 'yes' }],
    ['sticker-featured', { limit: 101 }],
    ['sticker-featured', { offset: -1 }],
    ['sticker-featured-read', { ids: [] }],
    ['sticker-featured-read', { ids: ['x'] }],
    ['sticker-attached', { chat: 'a', id: 1 }],
    ['sticker-attached', { chat: '5' }],
    ['quick-reaction-set', { emoji: 'two words' }],
    ['quick-reaction-set', {}],
    ['custom-emoji-search', { q: ' ' }],
    ['custom-emoji-search', { q: 'x'.repeat(65) }],
  ];
  for (const [route, body] of bad) {
    assert.equal(
      await postRoute(route, body, account),
      400,
      JSON.stringify([route, body])
    );
  }
  assert.equal(calls.length, good.length, 'nothing asked for a bad body');
  assert.equal(
    await postRoute('quick-reaction', {}, {}),
    400,
    'no account support'
  );
});

test('colonWord: a colon and two letters at a word start, at the caret', () => {
  assert.deepEqual(colonWord(':sm'), { word: 'sm', start: 0 });
  assert.deepEqual(colonWord('hello :heart'), { word: 'heart', start: 6 });
  assert.deepEqual(colonWord('hello :heart and more', 12), {
    word: 'heart',
    start: 6,
  });
  assert.deepEqual(colonWord('(:кот'), null, 'not after a bracket');
  assert.deepEqual(colonWord('see\n:кот'), { word: 'кот', start: 4 });
  for (const text of ['', ':', ':a', 'time 12:30', 'a:bc', ':) ', 'x :ab cd']) {
    assert.equal(colonWord(text), null, JSON.stringify(text));
  }
});

test('suggestedEmoji: Telegram words first, English names after, at most eight', () => {
  const words = { heart: ['💖', '💗'], hearth: ['🔥'] };
  const found = suggestedEmoji('heart', words);
  assert.deepEqual(found.slice(0, 3), ['💖', '💗', '🔥']);
  assert.ok(found.length <= 8);
  assert.equal(new Set(found).size, found.length);
  assert.ok(suggestedEmoji('smile').length > 0, 'English names without words');
  assert.deepEqual(suggestedEmoji('zzzzqq'), []);
});

test('quickPick uses the chosen reaction only when the chat allows it', () => {
  assert.equal(quickPick('🔥', ['👍', '🔥']), '🔥');
  assert.equal(quickPick('🔥', ['👍']), null);
  assert.equal(quickPick(null, ['👍']), null);
  assert.equal(quickPick('🔥', undefined), null);
});

test('hasAttachedStickers: a photo flag or a video attribute', () => {
  assert.equal(hasAttachedStickers({ photo: { hasStickers: true } }), true);
  assert.equal(hasAttachedStickers({ photo: { hasStickers: false } }), false);
  assert.equal(
    hasAttachedStickers({
      document: { attributes: [{ className: 'DocumentAttributeHasStickers' }] },
    }),
    true
  );
  assert.equal(hasAttachedStickers({ document: { attributes: [] } }), false);
  assert.equal(hasAttachedStickers(null), false);
});
