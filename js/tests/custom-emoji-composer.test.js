// Custom emoji in the composer (R-Y214): the markdown token ↔ the custom
// emoji entity, the emoji panel's Premium flag and emoji groups (server),
// its route, and the panel's pure helpers. Fake clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  apiEntities,
  parseFormatted,
  rawEntities,
  sliceFormatted,
  toMarkdown,
} from '../src/sources/telegram-format.js';
import {
  createEmojiGroups,
  groupOf,
} from '../src/sources/telegram-emoji-groups.js';
import { panelItem } from '../src/sources/telegram-stickers.js';
import {
  customToken,
  readRecentCustom,
  withRecentCustom,
} from '../src/web/chat-emoji-custom.js';
import { itemsOfEmoticons } from '../src/web/chat-emoji.js';
import { named, postRoute } from './helpers/telegram-route.js';

const ID = '5368324170671202286';
const token = (alt, id = ID) => `![${alt}](tg://emoji?id=${id})`;

test('a custom emoji token becomes the entity over its fallback (R-Y214)', () => {
  const { text, entities } = parseFormatted(`hi ${token('😀')}!`);
  assert.equal(text, 'hi 😀!');
  assert.deepEqual(entities, [
    { type: 'customEmoji', offset: 3, length: 2, documentId: ID },
  ]);
});

test('UTF-16 offsets count astral and multi-codepoint fallbacks', () => {
  const family = '👨‍👩‍👧';
  const { text, entities } = parseFormatted(
    `😀😀${token(family, '7')}x${token('❤️', '8')}`
  );
  assert.equal(text, `😀😀${family}x❤️`);
  assert.deepEqual(
    entities.map((e) => [e.offset, e.length, e.documentId]),
    [
      [4, family.length, '7'],
      [4 + family.length + 1, 2, '8'],
    ]
  );
});

test('custom emoji mix with bold and links and come back as typed', () => {
  for (const typed of [
    token('😀'),
    `**bold ${token('😀')} more**`,
    `${token('😀')}${token('🔥', '9')}`,
    `[link ${token('🔥', '9')}](https://example.com) and ${token('😀')}`,
    `__a__ ${token('😀')} ~~b~~`,
  ]) {
    const { text, entities } = parseFormatted(typed);
    assert.equal(toMarkdown(text, entities), typed, typed);
  }
  const { entities } = parseFormatted(`**a ${token('😀')}**`);
  assert.deepEqual(
    entities.map((e) => [e.type, e.offset, e.length]),
    [
      ['bold', 0, 4],
      ['customEmoji', 2, 2],
    ]
  );
});

test('a stored message keeps its custom emoji when edited', () => {
  const text = 'a 😀 b';
  const typed = toMarkdown(text, [
    {
      className: 'MessageEntityCustomEmoji',
      offset: 2,
      length: 2,
      documentId: ID,
    },
    { className: 'MessageEntityBold', offset: 0, length: 1 },
  ]);
  assert.equal(typed, `**a** ${token('😀')} b`);
  // A BigInt-ish id (GramJS's) and an id that is not a number.
  assert.equal(
    toMarkdown(text, [
      {
        className: 'MessageEntityCustomEmoji',
        offset: 2,
        length: 2,
        documentId: { value: 5n },
      },
    ]),
    `a ${token('😀', '5')} b`
  );
  assert.equal(
    toMarkdown(text, [
      {
        className: 'MessageEntityCustomEmoji',
        offset: 2,
        length: 2,
        documentId: 'x',
      },
    ]),
    text
  );
});

test('tokens that are not custom emoji stay text', () => {
  for (const typed of [
    '![x](https://img.example/a.png)',
    '![](tg://emoji?id=5)',
    '![a b](tg://emoji?id=5)',
    '![😀](tg://emoji?id=abc)',
    '![😀](tg://emoji?id=)',
  ]) {
    assert.equal(
      parseFormatted(typed).entities.some((e) => e.type === 'customEmoji'),
      false,
      typed
    );
  }
});

test('the API entity carries the document id as a BigInt, the stored one as text', () => {
  const Api = { MessageEntityCustomEmoji: named('MessageEntityCustomEmoji') };
  const { entities } = parseFormatted(token('😀'));
  const [api] = apiEntities(Api, entities);
  assert.equal(api.className, 'MessageEntityCustomEmoji');
  assert.equal(typeof api.documentId, 'bigint');
  assert.equal(api.documentId, BigInt(ID));
  assert.deepEqual(rawEntities(entities), [
    {
      className: 'MessageEntityCustomEmoji',
      offset: 0,
      length: 2,
      documentId: ID,
    },
  ]);
});

test('a long message split keeps each part its own custom emoji', () => {
  const formatted = parseFormatted(`ab ${token('😀')} cd`);
  const [first, second] = sliceFormatted(formatted, [
    [0, 3],
    [3, formatted.text.length],
  ]);
  assert.deepEqual(first.entities, []);
  assert.deepEqual(
    second.entities.map((e) => [e.offset, e.length]),
    [[0, 2]]
  );
});

test('the page types the token, with a safe fallback', () => {
  assert.equal(customToken(ID, '😀'), token('😀'));
  assert.equal(customToken(ID, 'two words'), token('⭐'));
  assert.equal(customToken(ID, ''), token('⭐'));
  assert.equal(customToken(ID, '[x]'), token('⭐'));
  const typed = parseFormatted(customToken(ID, '👍🏽'));
  assert.equal(typed.text, '👍🏽');
});

test('recent custom emoji: newest first, no repeats, 32 at most, per device', () => {
  let recent = [];
  for (let n = 1; n <= 40; n += 1) {
    recent = withRecentCustom(recent, { id: String(n), alt: '😀' });
  }
  assert.equal(recent.length, 32);
  assert.equal(recent[0].id, '40');
  recent = withRecentCustom(recent, { id: '10', alt: '🔥', own: true });
  assert.deepEqual(recent[0], { id: '10', alt: '🔥' });
  assert.equal(recent.filter((r) => r.id === '10').length, 1);
  const storage = {
    getItem: () => JSON.stringify([{ id: '5', alt: '😀' }, { id: 'x' }, null]),
  };
  assert.deepEqual(readRecentCustom(storage), [{ id: '5', alt: '😀' }]);
  assert.deepEqual(readRecentCustom({ getItem: () => 'not json' }), []);
  assert.deepEqual(readRecentCustom({ getItem: () => null }), []);
});

test('a custom emoji document lists its fallback emoji', () => {
  const doc = {
    id: 5n,
    mimeType: 'application/x-tgsticker',
    attributes: [{ className: 'DocumentAttributeCustomEmoji', alt: '🔥' }],
  };
  assert.equal(panelItem(doc).emoji, '🔥');
});

test('Telegram’s emoji groups filter the standard grid by their emoticons', () => {
  const items = itemsOfEmoticons(['😀', '❤', '❤️', 'not an emoji', '😀']);
  assert.deepEqual(
    items.map((i) => i.emoji),
    ['😀', '❤️']
  );
  assert.deepEqual(itemsOfEmoticons(undefined), []);
});

const API = {
  InputUserSelf: named('InputUserSelf'),
  users: { GetUsers: named('users.GetUsers') },
  messages: {
    GetEmojiGroups: named('messages.GetEmojiGroups'),
    GetEmojiStatusGroups: named('messages.GetEmojiStatusGroups'),
  },
};

const makeEnv = (answers) => {
  const log = [];
  const env = {
    queue: { run: async (_k, _p, fn) => fn() },
    importer: async () => ({ Api: API, helpers: { returnBigInt: BigInt } }),
  };
  const userClient = async () => ({
    invoke: async (request) => {
      log.push(request.className);
      const answer = answers[request.className];
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  });
  return { env, userClient, log };
};

const GROUPS = {
  className: 'messages.EmojiGroups',
  groups: [
    {
      className: 'EmojiGroup',
      title: 'Love',
      iconEmojiId: 55n,
      emoticons: ['❤️', '😍'],
    },
    { className: 'EmojiGroupPremium', title: 'Premium', iconEmojiId: 56n },
    {
      className: 'EmojiGroup',
      title: 'Empty',
      iconEmojiId: 57n,
      emoticons: [],
    },
  ],
};

test('the panel info: Premium and the emoji groups, kept ten minutes', async () => {
  const { env, userClient, log } = makeEnv({
    'users.GetUsers': [{ premium: true }],
    'messages.GetEmojiGroups': GROUPS,
    'messages.GetEmojiStatusGroups': { groups: [] },
  });
  let time = 0;
  const { emojiPanelInfo } = createEmojiGroups(
    env,
    { userClient },
    { now: () => time }
  );
  const answer = await emojiPanelInfo({});
  assert.deepEqual(answer, {
    ok: true,
    premium: true,
    groups: [{ title: 'Love', iconEmojiId: '55', emoticons: ['❤️', '😍'] }],
  });
  await emojiPanelInfo();
  assert.deepEqual(log, ['users.GetUsers', 'messages.GetEmojiGroups']);
  await emojiPanelInfo({ status: true });
  assert.equal(log.at(-1), 'messages.GetEmojiStatusGroups');
  time = 11 * 60_000;
  await emojiPanelInfo({});
  assert.equal(log.length, 6, 'asked again after ten minutes');
});

test('the panel info survives a failing groups call, and a missing account', async () => {
  const { env, userClient } = makeEnv({
    'users.GetUsers': [{ premium: false }],
    'messages.GetEmojiGroups': new Error('boom'),
  });
  const { emojiPanelInfo } = createEmojiGroups(env, { userClient });
  assert.deepEqual(await emojiPanelInfo({}), {
    ok: true,
    premium: false,
    groups: [],
  });
  const none = createEmojiGroups(env, { userClient: async () => null });
  assert.notEqual((await none.emojiPanelInfo({})).ok, true);
  assert.equal(groupOf({ title: 'x', emoticons: [] }), null);
});

test('the route checks its body before asking the account', async () => {
  const calls = [];
  const account = {
    emojiPanelInfo: async (arg) => {
      calls.push(arg);
      return { ok: true };
    },
  };
  assert.equal(await postRoute('emoji-panel-info', {}, account), 200);
  assert.equal(
    await postRoute('emoji-panel-info', { status: true }, account),
    200
  );
  assert.equal(
    await postRoute('emoji-panel-info', { status: 'yes' }, account),
    400
  );
  assert.deepEqual(calls, [{ status: false }, { status: true }]);
});
