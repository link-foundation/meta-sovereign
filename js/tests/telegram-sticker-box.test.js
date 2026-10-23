// A sticker set's box (R-Y124): the set a chat's sticker belongs to,
// asked by id and access hash or by short name, its stickers and whether
// the user has it; the set joins the lists so install and send accept
// it. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createStickers } from '../src/sources/telegram-stickers.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { stickerSetOf } from '../src/web/chat-sticker-box.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: {
    GetStickerSet: named('GetStickerSet'),
    InstallStickerSet: named('InstallStickerSet'),
    UninstallStickerSet: named('UninstallStickerSet'),
    SendMedia: named('SendMedia'),
  },
  InputDocument: named('InputDocument'),
  InputMediaDocument: named('InputMediaDocument'),
  InputStickerSetID: named('InputStickerSetID'),
  InputStickerSetShortName: named('InputStickerSetShortName'),
};
const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: (b) => b.readBigInt64LE(0),
};
const doc = (id) => ({
  className: 'Document',
  id: BigInt(id),
  accessHash: BigInt(id * 10),
  fileReference: Buffer.from([id]),
  dcId: 2,
  mimeType: 'image/webp',
  size: 1000,
  attributes: [{ className: 'DocumentAttributeSticker', alt: '🐱' }],
});

const make = (log, installedDate) => {
  const client = {
    invoke: async (request) => {
      log.push(request);
      if (request.className === 'GetStickerSet') {
        return {
          set: {
            id: -7n,
            accessHash: 70n,
            title: 'Cats',
            shortName: 'cats',
            count: 2,
            ...(installedDate ? { installedDate } : {}),
          },
          documents: [doc(1), doc(2)],
        };
      }
      return true;
    },
  };
  return createStickers(
    {
      importer: async () => ({ Api, helpers }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    { userClient: async () => client, apply: async () => {}, mediaDir: null },
    { now: () => 0 }
  );
};

test('a set by id and hash: its stickers, joined to the lists', async () => {
  const log = [];
  const stickers = make(log, 0);
  const got = await stickers.stickerSetBox({ id: '-7', accessHash: '70' });
  assert.equal(got.ok, true);
  assert.deepEqual(got.set, {
    id: '-7',
    title: 'Cats',
    count: 2,
    format: 'webp',
    emoji: false,
    shortName: 'cats',
    installed: false,
  });
  assert.deepEqual(
    got.items.map((i) => i.id),
    ['1', '2']
  );
  const asked = log[0];
  assert.equal(asked.hash, 0);
  assert.equal(asked.stickerset.className, 'InputStickerSetID');
  assert.equal(asked.stickerset.id, -7n);
  assert.equal(asked.stickerset.accessHash, 70n);
  // Install and send accept what the box showed.
  assert.equal((await stickers.stickerSetInstall({ id: '-7' })).ok, true);
  assert.equal(log.at(-1).className, 'InstallStickerSet');
  const sent = await stickers.sendDocument({ chat: '5', id: '2' });
  assert.equal(sent.ok, true);
  assert.equal(log.at(-1).className, 'SendMedia');
});

test('a set by short name; one the user has is installed', async () => {
  const log = [];
  const stickers = make(log, 1700000000);
  const got = await stickers.stickerSetBox({ shortName: 'cats' });
  assert.equal(got.set.installed, true);
  assert.equal(log[0].stickerset.className, 'InputStickerSetShortName');
  assert.equal(log[0].stickerset.shortName, 'cats');
  assert.equal(
    (await stickers.stickerSetBox({ id: 'x', accessHash: '1' })).code,
    'unknown-set'
  );
  assert.equal(log.length, 1, 'bad input asks nothing');
});

const post = async (account, body) => {
  const path = '/api/telegram/sticker-set-box';
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

test('the route takes digits or a short name', async () => {
  const calls = [];
  const account = {
    stickerSetBox: async (args) => {
      calls.push(args);
      return { ok: true };
    },
  };
  assert.equal(await post(account, { id: '-7', accessHash: '70' }), 200);
  assert.equal(await post(account, { shortName: 'cats_1' }), 200);
  for (const bad of [
    {},
    { id: '7' },
    { id: 'x', accessHash: '1' },
    { id: '7', accessHash: '1.5' },
    { id: ['7'], accessHash: '1' },
    { shortName: 'a b' },
    { shortName: 'a/../b' },
  ]) {
    assert.equal(await post(account, bad), 400, JSON.stringify(bad));
  }
  assert.deepEqual(calls, [
    { id: '-7', accessHash: '70' },
    { shortName: 'cats_1' },
  ]);
});

test('the page reads the set from the sticker attribute', () => {
  const media = (stickerset) => ({
    document: {
      attributes: [{ className: 'DocumentAttributeSticker', stickerset }],
    },
  });
  assert.deepEqual(
    stickerSetOf(
      media({ className: 'InputStickerSetID', id: '5', accessHash: '-9' })
    ),
    { id: '5', accessHash: '-9' }
  );
  assert.deepEqual(
    stickerSetOf(
      media({ className: 'InputStickerSetShortName', shortName: 'cats' })
    ),
    { shortName: 'cats' }
  );
  assert.equal(
    stickerSetOf(media({ className: 'InputStickerSetEmpty' })),
    null
  );
  assert.equal(
    stickerSetOf(
      media({ className: 'InputStickerSetID', id: 'x', accessHash: '1' })
    ),
    null
  );
  assert.equal(stickerSetOf({}), null);
});
