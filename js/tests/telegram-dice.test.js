// Dice (R-Y130): a lone die's emoji sent as a die (messages.sendMedia
// with inputMediaDice), any other text as text; a die's animations from
// Telegram's set for its emoji, asked once and kept; the route; a die's
// throw time read from the message. Fake clients; nothing reaches a
// network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { diceOf, sendText } from '../src/sources/telegram-send.js';
import { createStickers } from '../src/sources/telegram-stickers.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { parseMedia } from '../src/web/message-parts.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: {
    SendMessage: named('SendMessage'),
    SendMedia: named('SendMedia'),
    GetStickerSet: named('GetStickerSet'),
  },
  InputMediaDice: named('InputMediaDice'),
  InputStickerSetDice: named('InputStickerSetDice'),
  InputReplyToMessage: named('InputReplyToMessage'),
};

test('diceOf: only a lone die emoji', () => {
  assert.equal(diceOf('🎲'), '🎲');
  assert.equal(diceOf(' ⚽️ '), '⚽');
  assert.equal(diceOf('🎰'), '🎰');
  for (const text of ['🎲🎲', 'roll 🎲', '😀', '', null]) {
    assert.equal(diceOf(text), null, String(text));
  }
});

const sender = () => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      return { className: 'UpdateShortSentMessage', id: 5, date: 1 };
    },
    getInputEntity: async (peer) => peer,
  };
  return { client, log };
};

test('a lone die is sent as a die, other text as text', async () => {
  const { client, log } = sender();
  await sendText({ client, Api, peer: 'p', text: '🎯', replyTo: 3 });
  assert.equal(log[0].className, 'SendMedia');
  assert.equal(log[0].media.className, 'InputMediaDice');
  assert.equal(log[0].media.emoticon, '🎯');
  assert.equal(log[0].message, '');
  assert.equal(log[0].replyTo.replyToMsgId, 3);
  await sendText({ client, Api, peer: 'p', text: '🎯 nice' });
  assert.equal(log[1].className, 'SendMessage');
  assert.equal(log[1].message, '🎯 nice');
});

test("a die's animations: its set, asked once", async () => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      return {
        set: { id: 9n, accessHash: 90n, title: 'Dice', count: 7 },
        documents: [1, 2, 3].map((id) => ({
          className: 'Document',
          id: BigInt(id),
          mimeType: 'application/x-tgsticker',
          attributes: [{ className: 'DocumentAttributeSticker', alt: '🎲' }],
        })),
      };
    },
  };
  const stickers = createStickers(
    {
      importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    { userClient: async () => client, apply: async () => {}, mediaDir: null },
    { now: () => 0 }
  );
  const got = await stickers.stickerDice({ emoticon: '🎲' });
  assert.equal(got.ok, true);
  assert.deepEqual(
    got.items.map((item) => [item.id, item.format]),
    [
      ['1', 'tgs'],
      ['2', 'tgs'],
      ['3', 'tgs'],
    ]
  );
  assert.equal(log[0].stickerset.className, 'InputStickerSetDice');
  assert.equal(log[0].stickerset.emoticon, '🎲');
  await stickers.stickerDice({ emoticon: '🎲' });
  assert.equal(log.length, 1, 'kept');
  assert.equal(
    (await stickers.stickerDice({ emoticon: '😀' })).code,
    'bad-request'
  );
  assert.equal(log.length, 1, 'nothing asked for another emoji');
});

test('the route takes a die emoji only', async () => {
  const asked = [];
  const account = {
    stickerDice: async (body) => asked.push(body) && { ok: true },
  };
  const post = async (body) => {
    const path = '/api/telegram/dice';
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, {
      method: 'POST',
      url: path,
      headers: { 'content-type': 'application/json', host: '127.0.0.1:8787' },
    });
    const res = {
      setHeader() {},
      writeHead(status) {
        this.status = status;
      },
      end() {},
    };
    await handleTelegramRoutes(req, res, path, {
      telegramAccount: account,
      allowOrigins: [],
    });
    return res.status;
  };
  assert.equal(await post({ emoticon: '🏀' }), 200);
  assert.equal(await post({ emoticon: 'x' }), 400);
  assert.equal(await post({}), 400);
  assert.deepEqual(asked, [{ emoticon: '🏀' }]);
});

test("a die's value and when it was thrown", () => {
  assert.deepEqual(
    parseMedia({
      date: 1700000000,
      media: { className: 'MessageMediaDice', emoticon: '🎯', value: 4 },
    }),
    { kind: 'dice', emoticon: '🎯', value: 4, sent: 1700000000 }
  );
});
