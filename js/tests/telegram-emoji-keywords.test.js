// Emoji found by Telegram's words in the page's language (R-Y117): its
// list (messages.getEmojiKeywords) read into `{ word: [emoji…] }`, asked
// once a day per language (two asking at once ask once), nothing without
// a user account; the route takes a language code; the panel's search
// puts the words' emoji first, then English names, tones and FE0F aside.
// Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  createEmojiKeywords,
  keywordMap,
} from '../src/sources/telegram-emoji-keywords.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { findByKeywords, findEmoji } from '../src/web/chat-emoji.js';

class GetEmojiKeywords {
  constructor(fields) {
    Object.assign(this, fields);
    this.className = 'GetEmojiKeywords';
  }
}
const Api = { messages: { GetEmojiKeywords } };
const helpers = { returnBigInt: (v) => BigInt(v) };

const ANSWER = {
  className: 'EmojiKeywordsDifference',
  langCode: 'ru',
  keywords: [
    { className: 'EmojiKeyword', keyword: 'Кот', emoticons: ['🐱', '😺'] },
    { className: 'EmojiKeyword', keyword: 'котик', emoticons: ['🐈'] },
    { className: 'EmojiKeyword', keyword: 'кот', emoticons: ['🐈', '🐱'] },
    { className: 'EmojiKeywordDeleted', keyword: 'пёс', emoticons: ['🐶'] },
    { className: 'EmojiKeyword', keyword: '  ', emoticons: ['🐶'] },
    { className: 'EmojiKeyword', keyword: 'палец', emoticons: ['👍🏻'] },
    { className: 'EmojiKeyword', keyword: 'сердце', emoticons: ['❤'] },
  ],
};

test("Telegram's list read into words and their emoji", () => {
  assert.deepEqual(
    { ...keywordMap(ANSWER) },
    {
      кот: ['🐱', '😺', '🐈'],
      котик: ['🐈'],
      палец: ['👍🏻'],
      сердце: ['❤'],
    }
  );
  assert.deepEqual({ ...keywordMap(null) }, {});
});

test('asked once a day per language, once when two ask', async () => {
  const asked = [];
  let time = 0;
  const client = {
    invoke: async (request) => {
      asked.push(request.langCode);
      return ANSWER;
    },
  };
  const { emojiKeywords } = createEmojiKeywords(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => client },
    { now: () => time }
  );
  const [one, two] = await Promise.all([
    emojiKeywords({ lang: 'ru' }),
    emojiKeywords({ lang: 'ru' }),
  ]);
  assert.equal(one, two);
  assert.equal(one.ok, true);
  assert.deepEqual(one.keywords.котик, ['🐈']);
  await emojiKeywords({ lang: 'ru' });
  assert.deepEqual(asked, ['ru'], 'kept');
  await emojiKeywords({ lang: 'zh' });
  time = 25 * 60 * 60_000;
  await emojiKeywords({ lang: 'ru' });
  assert.deepEqual(asked, ['ru', 'zh', 'ru'], 'asked again after a day');
  const none = createEmojiKeywords(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => null }
  );
  assert.deepEqual(await none.emojiKeywords({ lang: 'ru' }), {
    ok: false,
    supported: false,
  });
});

const post = async (account, body) => {
  const path = '/api/telegram/emoji-keywords';
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
    end(words) {
      this.body = words;
    },
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res.status;
};

test('the route takes a language code', async () => {
  const calls = [];
  const account = {
    emojiKeywords: async (args) => {
      calls.push(args);
      return { ok: true, lang: args.lang, keywords: {} };
    },
  };
  assert.equal(await post(account, { lang: 'ru' }), 200);
  for (const bad of [{}, { lang: 'russian' }, { lang: 'RU' }, { lang: 7 }]) {
    assert.equal(await post(account, bad), 400, JSON.stringify(bad));
  }
  assert.deepEqual(calls, [{ lang: 'ru' }]);
});

test("the panel's search: the words' emoji first, then English names", () => {
  const words = keywordMap(ANSWER);
  assert.deepEqual(
    findByKeywords('КОТ', words).map((i) => i.emoji),
    ['🐱', '😺', '🐈'],
    'the word itself first, then the words it begins'
  );
  assert.deepEqual(
    findByKeywords('палец', words).map((i) => i.emoji),
    ['👍'],
    'a tone aside'
  );
  assert.deepEqual(
    findByKeywords('сердце', words).map((i) => i.emoji),
    ['❤️'],
    'FE0F aside'
  );
  assert.deepEqual(findByKeywords('собака', words), []);
  assert.deepEqual(findByKeywords('кот', null), []);
  const cat = findEmoji('cat', 120, { cat: ['🦁'] }).map((i) => i.emoji);
  assert.equal(cat[0], '🦁', 'the words first');
  assert.ok(cat.includes('🐱'), 'then the names');
  assert.equal(new Set(cat).size, cat.length, 'each once');
  assert.deepEqual(
    findEmoji('кот', 120, words).map((i) => i.emoji),
    ['🐱', '😺', '🐈']
  );
});
