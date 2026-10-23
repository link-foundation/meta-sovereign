// Custom emoji in messages (R-Y120): the documents asked of Telegram in
// batches and kept by id, each picture downloaded once into the app
// folder, an unknown id refused, the route's validation, and the text
// tree carrying the document ids. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { createCustomEmoji } from '../src/sources/telegram-custom-emoji.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { textTree } from '../src/web/message-text.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: { GetCustomEmojiDocuments: named('GetCustomEmojiDocuments') },
  InputDocumentFileLocation: named('InputDocumentFileLocation'),
};
const helpers = { returnBigInt: (v) => BigInt(v) };
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(8)]);

const doc = (id, mimeType, extra = {}) => ({
  className: 'Document',
  id: BigInt(id),
  accessHash: BigInt(id * 10),
  fileReference: Buffer.from([id]),
  dcId: 2,
  mimeType,
  size: 1000,
  thumbs: [{ className: 'PhotoSize', type: 'm', size: 300 }],
  ...extra,
});
const KNOWN = {
  1: doc(1, 'image/webp'),
  2: doc(2, 'application/x-tgsticker'),
  3: doc(3, 'video/webm'),
};

const fakeClient = (log, { expireOnce = false } = {}) => {
  let expire = expireOnce;
  return {
    invoke: async (request) => {
      assert.equal(request.className, 'GetCustomEmojiDocuments');
      const ids = request.documentId.map(String);
      log.push(['ask', ids]);
      return ids.filter((id) => KNOWN[id]).map((id) => KNOWN[id]);
    },
    downloadFile: async (location) => {
      if (expire) {
        expire = false;
        throw Object.assign(new Error('FILE_REFERENCE_EXPIRED'), {
          errorMessage: 'FILE_REFERENCE_EXPIRED',
        });
      }
      log.push(['download', location.id, location.thumbSize]);
      return WEBP;
    },
  };
};

const make = (client, mediaDir) =>
  createCustomEmoji(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => client, mediaDir },
    { delay: 60 }
  );

test('ids asked close together are one request, each document kept (R-Y120)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-custom-emoji-'));
  try {
    const log = [];
    const emoji = make(fakeClient(log), dir);
    const [a, b, c] = await Promise.all([
      emoji.customEmojiPicture({ id: '1' }),
      emoji.customEmojiPicture({ id: '2', full: true }),
      emoji.customEmojiPicture({ id: '3' }),
    ]);
    // One request with all three, in whatever order the disk checks ended.
    assert.deepEqual(
      log
        .filter((e) => e[0] === 'ask')
        .map(([kind, ids]) => [kind, [...ids].sort()]),
      [['ask', ['1', '2', '3']]],
      'one request'
    );
    assert.equal(a.mimeType, 'image/webp');
    assert.equal(b.mimeType, 'application/x-tgsticker');
    assert.equal(c.mimeType, 'image/webp', 'a video emoji: its thumbnail');
    assert.deepEqual(
      log
        .filter((e) => e[0] === 'download')
        .map((e) => [e[1], e[2]])
        .sort((x, y) => Number(x[0] - y[0])),
      [
        [1n, ''],
        [2n, ''],
        [3n, 'm'],
      ]
    );
    // Again: from disk, nothing asked or downloaded.
    const before = log.length;
    await emoji.customEmojiPicture({ id: '1' });
    await emoji.customEmojiPicture({ id: '2', full: true });
    assert.equal(log.length, before, 'kept');
    // Another picture of a known document: no new ask.
    assert.equal(
      (await emoji.customEmojiPicture({ id: '3', full: true })).mimeType,
      'video/webm'
    );
    assert.equal(log.filter((e) => e[0] === 'ask').length, 1, 'document kept');
    // A still emoji has no animation.
    assert.equal(await emoji.customEmojiPicture({ id: '1', full: true }), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('more than 200 ids are asked in more than one request (R-Y120)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-custom-emoji-'));
  try {
    const log = [];
    const emoji = make(fakeClient(log), dir);
    await Promise.all(
      Array.from({ length: 250 }, (_, i) =>
        emoji.customEmojiPicture({ id: String(1000 + i) })
      )
    );
    const asks = log.filter((e) => e[0] === 'ask').map((e) => e[1].length);
    assert.deepEqual(asks, [200, 50]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unknown id is refused, asked once; bad ids never asked (R-Y120)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-custom-emoji-'));
  try {
    const log = [];
    const emoji = make(fakeClient(log), dir);
    assert.equal(await emoji.customEmojiPicture({ id: '999' }), null);
    assert.equal(await emoji.customEmojiPicture({ id: '999' }), null);
    assert.equal(log.filter((e) => e[0] === 'ask').length, 1);
    assert.equal(await emoji.customEmojiPicture({ id: '../x' }), null);
    assert.equal(await emoji.customEmojiPicture({ id: '' }), null);
    assert.equal(log.filter((e) => e[0] === 'ask').length, 1);
    const none = createCustomEmoji(
      {},
      { userClient: async () => null, mediaDir: dir }
    );
    assert.equal(await none.customEmojiPicture({ id: '1' }), null, 'a bot');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an expired file reference asks the document again once (R-Y120)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-custom-emoji-'));
  try {
    const log = [];
    const emoji = make(fakeClient(log, { expireOnce: true }), dir);
    const got = await emoji.customEmojiPicture({ id: '1' });
    assert.equal(got.mimeType, 'image/webp');
    assert.equal(log.filter((e) => e[0] === 'ask').length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const get = async (route, account) => {
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = route;
  req.headers = { host: '127.0.0.1:8787', 'sec-fetch-site': 'same-origin' };
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
  await handleTelegramRoutes(req, res, route.split('?')[0], {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res;
};

test('the custom emoji route (R-Y120)', async () => {
  const seen = [];
  const account = {
    customEmojiPicture: async (args) => {
      seen.push(args);
      return args.id === '1' ? { buffer: WEBP, mimeType: 'image/webp' } : null;
    },
  };
  let res = await get('/api/telegram/custom-emoji?id=1', account);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/webp');
  assert.match(res.headers['cache-control'], /immutable/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  await get('/api/telegram/custom-emoji?id=1&full=1', account);
  assert.deepEqual(seen.at(-1), { id: '1', full: true });
  res = await get('/api/telegram/custom-emoji?id=2', account);
  assert.equal(res.status, 404, 'an unknown id');
  const asked = seen.length;
  for (const bad of [
    '',
    '?id=',
    '?id=x',
    '?id=1/../2',
    '?id=123456789012345678901',
  ]) {
    res = await get(`/api/telegram/custom-emoji${bad}`, account);
    assert.equal(res.status, 400, bad);
  }
  assert.equal(seen.length, asked, 'a bad id is never asked');
  res = await get('/api/telegram/custom-emoji?id=1', {});
  assert.equal(res.status, 501);
});

test('the text tree keeps a custom emoji with its document id (R-Y120)', () => {
  const tree = textTree('a 😀 b', [
    {
      className: 'MessageEntityCustomEmoji',
      offset: 2,
      length: 2,
      documentId: '5368324170671202286',
    },
    { className: 'MessageEntityCustomEmoji', offset: 5, length: 1 },
  ]);
  assert.equal(tree[1].kind, 'emoji');
  assert.equal(tree[1].text, '😀');
  assert.equal(tree[1].documentId, '5368324170671202286');
  const bad = tree.find((n) => n.offset === 5 && n.kind === 'emoji');
  assert.equal(bad?.documentId ?? null, null, 'no id: the text only');
});
