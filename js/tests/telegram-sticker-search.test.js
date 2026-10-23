// Stickers and GIFs searched (R-Y112): an emoji asks Telegram's
// stickers for it, words its stickers by keyword and its sets by name
// (a set found then asked as any set is); a request Telegram refuses is
// nothing found, a wait goes on up; GIFs found by its @gif bot, found
// once, a page at a time; what is found may be sent and is asked again
// when its file reference expired; the routes refuse what is not words.
// Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createStickers } from '../src/sources/telegram-stickers.js';
import { isEmojiQuery } from '../src/sources/telegram-sticker-search.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: {
    GetStickers: named('GetStickers'),
    SearchStickers: named('SearchStickers'),
    SearchStickerSets: named('SearchStickerSets'),
    GetStickerSet: named('GetStickerSet'),
    GetInlineBotResults: named('GetInlineBotResults'),
    SendMedia: named('SendMedia'),
  },
  contacts: { ResolveUsername: named('ResolveUsername') },
  InputUser: named('InputUser'),
  InputPeerSelf: named('InputPeerSelf'),
  InputStickerSetID: named('InputStickerSetID'),
  InputMediaDocument: named('InputMediaDocument'),
  InputDocument: named('InputDocument'),
};
const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: (b) => b.readBigInt64LE(0),
};

const doc = (id, mimeType = 'image/webp') => ({
  className: 'Document',
  id: BigInt(id),
  accessHash: BigInt(id * 10),
  fileReference: Buffer.from([id]),
  dcId: 2,
  mimeType,
  size: 1000,
  attributes: [{ className: 'DocumentAttributeSticker', alt: '🐱' }],
});

const telegramError = (code, message) =>
  Object.assign(new Error(message), { code, errorMessage: message });

const fakeClient = (log, answers = {}) => ({
  invoke: async (request) => {
    log.push(request);
    const answer = answers[request.className];
    if (answer instanceof Error) {
      throw answer;
    }
    if (typeof answer === 'function') {
      return answer(request);
    }
    if (answer !== undefined) {
      return answer;
    }
    throw new Error(`unexpected ${request.className}`);
  },
});

const make = (client, now = () => 0) =>
  createStickers(
    {
      importer: async () => ({ Api, helpers }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    { userClient: async () => client, apply: async () => {}, mediaDir: null },
    { now }
  );

const classes = (log) => log.map((r) => r.className);

test('an emoji is told from words', () => {
  assert.equal(isEmojiQuery('🐱'), true);
  assert.equal(isEmojiQuery('👍🏽'), true);
  assert.equal(isEmojiQuery('🇺🇦'), true);
  assert.equal(isEmojiQuery('cat'), false);
  assert.equal(isEmojiQuery('cat 🐱'), false);
  assert.equal(isEmojiQuery('кот'), false);
});

test("an emoji finds Telegram's stickers for it", async () => {
  const log = [];
  const stickers = make(
    fakeClient(log, { GetStickers: { stickers: [doc(1), doc(2)] } })
  );
  const found = await stickers.stickerSearch({ q: '🐱' });
  assert.deepEqual(
    found.stickers.map((s) => s.id),
    ['1', '2']
  );
  assert.deepEqual(found.sets, []);
  assert.equal(log[0].emoticon, '🐱');
  await stickers.stickerSearch({ q: '🐱' });
  assert.equal(log.length, 1, 'kept');
});

test('words find stickers and sets, a set then asked as any', async () => {
  const log = [];
  const cats = { id: 7n, accessHash: 70n, title: 'Cats', count: 2 };
  const stickers = make(
    fakeClient(log, {
      SearchStickers: { stickers: [doc(3)] },
      SearchStickerSets: {
        sets: [
          { className: 'StickerSetCovered', set: cats, cover: doc(4) },
          {
            className: 'StickerSetNoCovered',
            set: { id: 8n, accessHash: 80n, title: 'Emoji', emojis: true },
          },
        ],
      },
      GetStickerSet: (request) => {
        assert.equal(request.stickerset.accessHash, 70n);
        return { set: cats, documents: [doc(5), doc(6)] };
      },
    })
  );
  const found = await stickers.stickerSearch({ q: 'cat', lang: 'ru' });
  assert.deepEqual(
    found.stickers.map((s) => s.id),
    ['3']
  );
  assert.deepEqual(
    found.sets.map((s) => [s.id, s.title, s.installed]),
    [['7', 'Cats', false]],
    'emoji sets are not the panel’s'
  );
  const search = log.find((r) => r.className === 'SearchStickers');
  assert.equal(search.q, 'cat');
  assert.deepEqual(search.langCode, ['ru']);
  const set = await stickers.stickerSet({ id: '7' });
  assert.deepEqual(
    set.stickers.map((s) => s.id),
    ['5', '6']
  );
});

test('a request Telegram refuses finds nothing; a wait goes on up', async () => {
  const log = [];
  const refused = make(
    fakeClient(log, {
      SearchStickers: telegramError(400, 'METHOD_INVALID'),
      SearchStickerSets: { sets: [] },
    })
  );
  assert.deepEqual(await refused.stickerSearch({ q: 'dog' }), {
    ok: true,
    stickers: [],
    sets: [],
  });
  const waiting = make(
    fakeClient([], { SearchStickers: telegramError(420, 'FLOOD_WAIT_5') })
  );
  await assert.rejects(waiting.stickerSearch({ q: 'dog' }));
  assert.deepEqual(await refused.stickerSearch({ q: '  ' }), {
    ok: true,
    stickers: [],
    sets: [],
  });
});

const gif = (id) =>
  Object.assign(doc(id, 'video/mp4'), {
    attributes: [{ className: 'DocumentAttributeVideo', w: 320, h: 200 }],
  });

test("GIFs found by Telegram's @gif bot, a page at a time, and sent", async () => {
  const log = [];
  let expire = true;
  const stickers = make(
    fakeClient(log, {
      ResolveUsername: {
        users: [{ id: 140n, accessHash: 1400n, bot: true }],
      },
      GetInlineBotResults: (request) =>
        request.offset === ''
          ? {
              nextOffset: '20',
              results: [
                { className: 'BotInlineMediaResult', document: gif(11) },
                { className: 'BotInlineResult', content: { url: 'x' } },
              ],
            }
          : {
              results: [
                { className: 'BotInlineMediaResult', document: gif(12) },
              ],
            },
      SendMedia: () => {
        if (expire) {
          expire = false;
          throw telegramError(400, 'FILE_REFERENCE_EXPIRED');
        }
        return null;
      },
    })
  );
  const first = await stickers.gifSearch({ q: 'cats' });
  assert.deepEqual(
    first.gifs.map((g) => [g.id, g.kind]),
    [['11', 'gif']]
  );
  assert.equal(first.next, '20');
  const ask = log.find((r) => r.className === 'GetInlineBotResults');
  assert.equal(ask.bot.userId, 140n);
  assert.equal(ask.peer.className, 'InputPeerSelf');
  assert.equal(ask.query, 'cats');
  const second = await stickers.gifSearch({ q: 'cats', offset: '20' });
  assert.deepEqual(
    second.gifs.map((g) => g.id),
    ['12']
  );
  assert.equal(second.next, null);
  assert.equal(
    classes(log).filter((c) => c === 'ResolveUsername').length,
    1,
    'the bot found once'
  );
  const sent = await stickers.sendDocument({ chat: '42', id: '11' });
  assert.equal(sent.ok, true);
  assert.equal(
    classes(log).filter((c) => c === 'GetInlineBotResults').length,
    3,
    'asked again when its reference expired'
  );
  assert.equal(
    (await stickers.sendDocument({ chat: '42', id: '99' })).code,
    'unknown-sticker'
  );
});

const post = async (account, route, body) => {
  const path = `/api/telegram/${route}`;
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
  return { status: res.status, payload: JSON.parse(res.body) };
};

test('the routes take words, refuse the rest', async () => {
  const calls = [];
  const account = {
    stickerSearch: async (args) => {
      calls.push(['stickers', args]);
      return { ok: true, stickers: [], sets: [] };
    },
    gifSearch: async (args) => {
      calls.push(['gifs', args]);
      return { ok: true, gifs: [], next: null };
    },
  };
  assert.equal(
    (await post(account, 'sticker-search', { q: ' cat ', lang: 'ru' })).status,
    200
  );
  assert.equal(
    (await post(account, 'gif-search', { q: 'cat', offset: '20' })).status,
    200
  );
  assert.deepEqual(calls, [
    ['stickers', { q: 'cat', lang: 'ru' }],
    ['gifs', { q: 'cat', offset: '20' }],
  ]);
  for (const [route, bad] of [
    ['sticker-search', {}],
    ['sticker-search', { q: '   ' }],
    ['sticker-search', { q: 'x'.repeat(65) }],
    ['sticker-search', { q: 'cat', lang: 'english' }],
    ['gif-search', { q: 7 }],
    ['gif-search', { q: 'cat', offset: 20 }],
  ]) {
    assert.equal(
      (await post(account, route, bad)).status,
      400,
      JSON.stringify(bad)
    );
  }
  assert.equal(calls.length, 2);
});
