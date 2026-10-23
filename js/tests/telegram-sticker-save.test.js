// A sticker's or GIF's menu (R-Y115): a sticker made a favourite or not,
// taken off the recent ones, a GIF saved or deleted, each as Telegram
// asks it, and the lists asked again after; only what the panel showed
// may be changed, and only so; the menu offers what fits where it was
// opened. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createStickers } from '../src/sources/telegram-stickers.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { stickerMenuItems } from '../src/web/chat-stickers.js';

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
    GetSavedGifs: named('GetSavedGifs'),
    FaveSticker: named('FaveSticker'),
    SaveRecentSticker: named('SaveRecentSticker'),
    SaveGif: named('SaveGif'),
    InstallStickerSet: named('InstallStickerSet'),
    UninstallStickerSet: named('UninstallStickerSet'),
  },
  InputDocument: named('InputDocument'),
  InputStickerSetID: named('InputStickerSetID'),
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

const make = (log) => {
  const client = {
    invoke: async (request) => {
      log.push(request);
      switch (request.className) {
        case 'GetAllStickers':
          return { sets: [{ id: 7n, accessHash: 70n, title: 'Cats' }] };
        case 'GetRecentStickers':
          return { stickers: [doc(2)] };
        case 'GetFavedStickers':
          return { stickers: [doc(1)] };
        case 'GetSavedGifs':
          return { gifs: [doc(3, 'video/mp4')] };
        default:
          return true;
      }
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

const count = (log, name) => log.filter((r) => r.className === name).length;

test('each action asked as Telegram asks it, the lists asked again', async () => {
  const log = [];
  const stickers = make(log);
  await stickers.stickerPanel();
  await stickers.savedGifs();
  const cases = [
    ['2', 'fave', 'FaveSticker', { unfave: false }],
    ['1', 'unfave', 'FaveSticker', { unfave: true }],
    ['2', 'unrecent', 'SaveRecentSticker', { unsave: true, attached: false }],
    ['3', 'unsaveGif', 'SaveGif', { unsave: true }],
    ['3', 'saveGif', 'SaveGif', { unsave: false }],
  ];
  for (const [id, action, className, fields] of cases) {
    assert.deepEqual(await stickers.stickerSave({ id, action }), { ok: true });
    const asked = log.at(-1);
    assert.equal(asked.className, className, action);
    for (const [key, value] of Object.entries(fields)) {
      assert.equal(asked[key], value, `${action} ${key}`);
    }
    assert.equal(asked.id.className, 'InputDocument');
    assert.equal(asked.id.id, BigInt(id));
    assert.equal(asked.id.accessHash, BigInt(id) * 10n);
  }
  await stickers.stickerPanel();
  await stickers.savedGifs();
  assert.equal(count(log, 'GetFavedStickers'), 2, 'the panel asked again');
  assert.equal(count(log, 'GetSavedGifs'), 2, 'the GIFs asked again');
});

test('only what the panel showed, only so', async () => {
  const log = [];
  const stickers = make(log);
  await stickers.stickerPanel();
  for (const [id, action] of [
    ['99', 'fave'],
    ['1', 'delete'],
    ['1', 'toString'],
    ['1', undefined],
  ]) {
    assert.equal(
      (await stickers.stickerSave({ id, action })).code,
      'unknown-sticker',
      `${id} ${action}`
    );
  }
  assert.equal(count(log, 'FaveSticker'), 0);
});

test('a set the panel showed added or removed, the panel asked again', async () => {
  const log = [];
  const stickers = make(log);
  assert.equal(
    (await stickers.stickerSetInstall({ id: '7' })).code,
    'unknown-set',
    'not yet shown'
  );
  await stickers.stickerPanel();
  assert.deepEqual(await stickers.stickerSetInstall({ id: '7' }), {
    ok: true,
    id: '7',
    installed: true,
  });
  const asked = log.at(-1);
  assert.equal(asked.className, 'InstallStickerSet');
  assert.equal(asked.archived, false);
  assert.equal(asked.stickerset.id, 7n);
  assert.equal(asked.stickerset.accessHash, 70n);
  await stickers.stickerSetInstall({ id: '7', install: false });
  assert.equal(log.at(-1).className, 'UninstallStickerSet');
  await stickers.stickerPanel();
  assert.equal(count(log, 'GetAllStickers'), 2, 'the panel asked again');
});

const post = async (account, body, route = 'sticker-save') => {
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
  return res.status;
};

test('the route takes an id and a known action', async () => {
  const calls = [];
  const account = {
    stickerSave: async (args) => {
      calls.push(args);
      return { ok: true };
    },
  };
  assert.equal(await post(account, { id: '12', action: 'fave' }), 200);
  for (const bad of [
    {},
    { id: '12' },
    { id: '12', action: 'install' },
    { id: 'x1', action: 'fave' },
    { id: '12', action: ['fave'] },
  ]) {
    assert.equal(await post(account, bad), 400, JSON.stringify(bad));
  }
  assert.deepEqual(calls, [{ id: '12', action: 'fave' }]);
  account.stickerSetInstall = async (args) => {
    calls.push(args);
    return { ok: true };
  };
  const route = 'sticker-set-install';
  assert.equal(await post(account, { id: '7', install: true }, route), 200);
  for (const bad of [
    { id: '7' },
    { id: 'x', install: true },
    { id: '7', install: 'yes' },
  ]) {
    assert.equal(await post(account, bad, route), 400, JSON.stringify(bad));
  }
  assert.deepEqual(calls.at(-1), { id: '7', install: true });
  assert.equal(calls.length, 2);
});

test('the menu offers what fits where it opened', () => {
  const sticker = { id: '5', kind: 'sticker' };
  const gif = { id: '6', kind: 'gif' };
  assert.deepEqual(stickerMenuItems(sticker, 'set', { schedule: true }), [
    'sendSilent',
    'schedule',
    'faveSticker',
  ]);
  // In Saved Messages it is a reminder (R-Y197).
  assert.deepEqual(
    stickerMenuItems(gif, 'foundGif', { schedule: true, reminder: true }),
    ['sendSilent', 'scheduleReminder', 'saveGif']
  );
  assert.deepEqual(stickerMenuItems(sticker, 'faved'), [
    'sendSilent',
    'unfaveSticker',
  ]);
  assert.deepEqual(stickerMenuItems(sticker, 'recent'), [
    'sendSilent',
    'faveSticker',
    'removeRecent',
  ]);
  assert.deepEqual(stickerMenuItems(gif, 'saved'), ['sendSilent', 'deleteGif']);
  assert.deepEqual(stickerMenuItems(gif, 'foundGif'), [
    'sendSilent',
    'saveGif',
  ]);
});
