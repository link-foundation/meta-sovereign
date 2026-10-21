// Stickers and saved GIFs (R-Y105): the user's sets, recent and
// favourite stickers and saved GIFs read as plain data; a set asked
// once; the panel's pictures downloaded once into the app folder; a
// sticker sent as it is, asked again once when its file reference
// expired. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  createStickers,
  formatOf,
  panelItem,
  panelSet,
  sniff,
} from '../src/sources/telegram-stickers.js';
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
    GetAllStickers: named('GetAllStickers'),
    GetRecentStickers: named('GetRecentStickers'),
    GetFavedStickers: named('GetFavedStickers'),
    GetStickerSet: named('GetStickerSet'),
    GetSavedGifs: named('GetSavedGifs'),
    SendMedia: named('SendMedia'),
  },
  InputStickerSetID: named('InputStickerSetID'),
  InputStickerSetThumb: named('InputStickerSetThumb'),
  InputDocumentFileLocation: named('InputDocumentFileLocation'),
  InputMediaDocument: named('InputMediaDocument'),
  InputDocument: named('InputDocument'),
  InputReplyToMessage: named('InputReplyToMessage'),
};
const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: (b) => b.readBigInt64LE(0),
};

const doc = (id, mimeType, extra = {}) => ({
  className: 'Document',
  id: BigInt(id),
  accessHash: BigInt(id * 10),
  fileReference: Buffer.from([id]),
  dcId: 2,
  mimeType,
  size: 1000,
  thumbs: [{ className: 'PhotoSize', type: 'm', size: 300 }],
  attributes: [
    { className: 'DocumentAttributeSticker', alt: '😀' },
    { className: 'DocumentAttributeImageSize', w: 512, h: 512 },
  ],
  ...extra,
});

const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(8)]);

test('stickers and sets as the page takes them (R-Y105)', () => {
  assert.equal(formatOf({ mimeType: 'application/x-tgsticker' }), 'tgs');
  assert.equal(formatOf({ mimeType: 'video/webm' }), 'webm');
  assert.equal(formatOf({ mimeType: 'video/mp4' }), 'mp4');
  assert.equal(formatOf({ mimeType: 'image/webp' }), 'webp');
  assert.deepEqual(panelItem(doc(5, 'image/webp')), {
    id: '5',
    kind: 'sticker',
    format: 'webp',
    emoji: '😀',
    w: 512,
    h: 512,
  });
  assert.deepEqual(
    panelSet({ id: 9n, title: 'Cats', count: 30, videos: true }),
    { id: '9', title: 'Cats', count: 30, format: 'webm', emoji: false }
  );
  assert.equal(sniff(WEBP), 'image/webp');
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0, 0])), 'image/jpeg');
  assert.equal(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'image/png');
});

const fakeClient = (log, { expireOnce = false } = {}) => {
  let expire = expireOnce;
  return {
    invoke: async (request) => {
      log.push(request.className);
      switch (request.className) {
        case 'GetAllStickers':
          return {
            sets: [
              { id: 7n, accessHash: 70n, title: 'Cats', count: 2 },
              { id: 8n, accessHash: 80n, title: 'Emoji', emojis: true },
            ],
          };
        case 'GetRecentStickers':
          return { stickers: [doc(1, 'image/webp')] };
        case 'GetFavedStickers':
          return { stickers: [doc(2, 'video/webm')] };
        case 'GetStickerSet':
          assert.equal(request.stickerset.id, 7n);
          assert.equal(request.stickerset.accessHash, 70n);
          return {
            set: { id: 7n, accessHash: 70n, title: 'Cats', count: 2 },
            documents: [
              doc(3, 'application/x-tgsticker'),
              doc(4, 'image/webp'),
            ],
          };
        case 'GetSavedGifs':
          return {
            gifs: [
              doc(6, 'video/mp4', {
                attributes: [
                  { className: 'DocumentAttributeVideo', w: 320, h: 240 },
                ],
              }),
            ],
          };
        case 'SendMedia':
          if (expire) {
            expire = false;
            throw Object.assign(new Error('FILE_REFERENCE_EXPIRED'), {
              errorMessage: 'FILE_REFERENCE_EXPIRED',
            });
          }
          log.push(request);
          return { className: 'Updates', updates: [] };
        default:
          throw new Error(`unexpected ${request.className}`);
      }
    },
    downloadFile: async (location) => {
      log.push(['download', location.className, location.thumbSize ?? null]);
      return WEBP;
    },
  };
};

const make = (client, extra = {}) =>
  createStickers(
    {
      importer: async () => ({ Api, helpers }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
      ...extra.env,
    },
    {
      userClient: async () => client,
      apply: extra.apply ?? (async () => {}),
      mediaDir: extra.mediaDir ?? null,
    },
    { now: extra.now ?? (() => 0) }
  );

test('the panel, a set and the saved GIFs, each asked once (R-Y105)', async () => {
  const log = [];
  let clock = 0;
  const stickers = make(fakeClient(log), { now: () => clock });
  const panel = await stickers.stickerPanel();
  assert.equal(panel.ok, true);
  assert.deepEqual(
    panel.sets.map((s) => s.title),
    ['Cats'],
    'emoji sets are not the panel’s'
  );
  assert.deepEqual(
    panel.recent.map((s) => s.id),
    ['1']
  );
  assert.deepEqual(
    panel.faved.map((s) => [s.id, s.format]),
    [['2', 'webm']]
  );
  await stickers.stickerPanel();
  assert.equal(log.filter((c) => c === 'GetAllStickers').length, 1, 'kept');
  clock += 11 * 60_000;
  await stickers.stickerPanel();
  assert.equal(log.filter((c) => c === 'GetAllStickers').length, 2);

  const set = await stickers.stickerSet({ id: '7' });
  assert.deepEqual(
    set.stickers.map((s) => [s.id, s.format]),
    [
      ['3', 'tgs'],
      ['4', 'webp'],
    ]
  );
  await stickers.stickerSet({ id: '7' });
  assert.equal(log.filter((c) => c === 'GetStickerSet').length, 1, 'kept');
  assert.equal((await stickers.stickerSet({ id: '99' })).code, 'unknown-set');

  const gifs = await stickers.savedGifs();
  assert.deepEqual(gifs.gifs, [
    { id: '6', kind: 'gif', format: 'mp4', emoji: null, w: 320, h: 240 },
  ]);
  const none = createStickers({}, { userClient: async () => null });
  assert.deepEqual(await none.stickerPanel(), { ok: false, supported: false });
});

test('the pictures downloaded once into the app folder (R-Y105)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-stickers-'));
  try {
    const log = [];
    const stickers = make(fakeClient(log), { mediaDir: dir });
    await stickers.stickerPanel();
    await stickers.stickerSet({ id: '7' });
    const still = await stickers.stickerPicture({ id: '1' });
    assert.equal(still.mimeType, 'image/webp');
    assert.deepEqual(log.at(-1), ['download', 'InputDocumentFileLocation', '']);
    const again = await stickers.stickerPicture({ id: '1' });
    assert.equal(again.mimeType, 'image/webp');
    assert.equal(log.filter((e) => e[0] === 'download').length, 1, 'cached');
    await stickers.stickerPicture({ id: '3' });
    assert.deepEqual(log.at(-1), [
      'download',
      'InputDocumentFileLocation',
      'm',
    ]);
    await stickers.stickerPicture({ id: '2', full: true });
    assert.deepEqual(log.at(-1), ['download', 'InputDocumentFileLocation', '']);
    assert.equal(
      await stickers.stickerPicture({ id: '4', full: true }),
      null,
      'a still sticker has no video'
    );
    const thumb = await stickers.stickerPicture({ set: '7' });
    assert.equal(thumb.mimeType, 'image/webp', "the set's first sticker");
    assert.equal(await stickers.stickerPicture({ id: '12345' }), null);
    assert.equal(await stickers.stickerPicture({ id: '../x' }), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a sticker sent as it is, its reference asked again once (R-Y105)', async () => {
  const log = [];
  const applied = [];
  const stickers = make(fakeClient(log, { expireOnce: true }), {
    apply: async (_c, result) => applied.push(result),
  });
  assert.equal(
    (await stickers.sendDocument({ chat: '42', id: '1' })).code,
    'unknown-sticker',
    'only a listed sticker'
  );
  await stickers.stickerPanel();
  const answer = await stickers.sendDocument({
    chat: '42',
    id: '1',
    replyTo: 5,
    silent: true,
    clientId: 'c1',
  });
  assert.deepEqual(answer, { ok: true, chat: '42' });
  const request = log.find((e) => e?.className === 'SendMedia');
  assert.equal(request.media.id.id, 1n);
  assert.equal(request.message, '');
  assert.equal(request.silent, true);
  assert.equal(request.replyTo.replyToMsgId, 5);
  assert.deepEqual(request.peer, { chat: '42' });
  assert.equal(applied.length, 1);
  assert.equal(
    log.filter((c) => c === 'GetAllStickers').length,
    2,
    'asked again after the expired reference'
  );
});

const call = async (route, body, account, { method = 'POST' } = {}) => {
  const req = Readable.from(method === 'POST' ? [Buffer.from(body)] : []);
  req.method = method;
  req.url = route;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
    'sec-fetch-site': 'same-origin',
  };
  const res = {
    headers: {},
    setHeader() {},
    writeHead(status, headers) {
      this.status = status;
      Object.assign(this.headers, headers ?? {});
    },
    end(text) {
      this.body = text;
    },
  };
  const p = route.split('?')[0];
  await handleTelegramRoutes(req, res, p, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res;
};

test('the sticker routes (R-Y105)', async () => {
  const seen = [];
  const account = {
    stickerPanel: async ({ fresh }) => ({ ok: true, fresh }),
    stickerSet: async ({ id }) => ({ ok: true, id }),
    savedGifs: async () => ({ ok: true, gifs: [] }),
    sendDocument: async (body) => {
      seen.push(body);
      return { ok: true };
    },
    stickerPicture: async ({ id }) =>
      id === '1' ? { buffer: WEBP, mimeType: 'image/webp' } : null,
  };
  let res = await call('/api/telegram/stickers', '{"fresh":true}', account);
  assert.deepEqual(JSON.parse(res.body), { ok: true, fresh: true });
  res = await call('/api/telegram/sticker-set', '{"id":"7"}', account);
  assert.deepEqual(JSON.parse(res.body), { ok: true, id: '7' });
  res = await call('/api/telegram/sticker-set', '{"id":"x"}', account);
  assert.equal(res.status, 400);
  res = await call('/api/telegram/gifs', '{}', account);
  assert.equal(JSON.parse(res.body).ok, true);
  res = await call(
    '/api/telegram/send-document',
    '{"chat":"-100","id":"3","replyTo":9,"silent":true,"clientId":"a"}',
    account
  );
  assert.equal(res.status, 200);
  assert.deepEqual(seen, [
    { chat: '-100', id: '3', replyTo: 9, clientId: 'a', silent: true },
  ]);
  res = await call(
    '/api/telegram/send-document',
    '{"chat":"x","id":"3"}',
    account
  );
  assert.equal(res.status, 400);
  res = await call('/api/telegram/sticker?id=1', '', account, {
    method: 'GET',
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/webp');
  res = await call('/api/telegram/sticker?id=2', '', account, {
    method: 'GET',
  });
  assert.equal(res.status, 404);
});
