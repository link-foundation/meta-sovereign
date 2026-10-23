// Files, video and audio inside rich messages and Instant View pages
// (R-Y224; learned, never copied): the file reader's `rich` document, the
// route's validation, range and download headers, the Instant View whole
// file, the shaped name/type/size, and the renderer's players and download
// links through a context-provided URL builder. Fakes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createMemoryStore } from '../src/storage/universal.js';
import { createFileReader } from '../src/sources/telegram-media.js';
import { createInstantView } from '../src/sources/telegram-instant-view.js';
import { shapeRich } from '../src/sources/telegram-instant-view-shape.js';
import { Blocks } from '../src/web/chat-instant-view-render.js';
import { fileKey } from '../src/web/rich-message-model.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { dispositionOf } from '../src/server/routes-telegram-files.js';
import { named } from './helpers/telegram-route.js';

const doc = (id, mimeType, name, size = 11) => ({
  className: 'Document',
  id,
  accessHash: '8',
  dcId: 2,
  mimeType,
  size,
  attributes: [{ className: 'DocumentAttributeFilename', fileName: name }],
});
const empty = { className: 'TextEmpty' };
const cap = { text: empty, credit: empty };
const richWith = () => ({
  className: 'RichMessage',
  blocks: [
    { className: 'PageBlockDocument', documentId: '77', caption: cap },
    { className: 'PageBlockVideo', videoId: '78', caption: cap },
    { className: 'PageBlockAudio', audioId: '79', caption: cap },
  ],
  photos: [],
  documents: [
    doc('77', 'application/pdf', 'plan.pdf', 2048),
    doc('78', 'video/mp4', 'clip.mp4'),
    doc('79', 'audio/mpeg', 'song.mp3'),
  ],
});

test('the shaped blocks carry name, type and size', () => {
  const [file, video, audio] = shapeRich(richWith()).blocks;
  assert.deepEqual(
    [file.k, file.name, file.mime, file.size],
    ['file', 'plan.pdf', 'application/pdf', 2048]
  );
  assert.deepEqual(
    [video.k, video.name, video.mime],
    ['video', 'clip.mp4', 'video/mp4']
  );
  assert.deepEqual([audio.k, audio.mime], ['audio', 'audio/mpeg']);
});

const ctxOf = (extra = {}) => ({
  t: (key) => key,
  locale: 'en',
  media: (kind, id) => `/m?kind=${kind}&id=${id}`,
  file: (id, download) => `/f?id=${id}${download ? '&download=1' : ''}`,
  scrollTo() {},
  ...extra,
});
const draw = (ctx) =>
  renderToStaticMarkup(
    React.createElement(Blocks, { blocks: shapeRich(richWith()).blocks, ctx })
  );

test('the renderer gives a file a download, a video and audio a player', () => {
  const html = draw(ctxOf());
  assert.match(
    html,
    /<a[^>]*href="\/f\?id=77&amp;download=1"[^>]*download="plan\.pdf"/
  );
  assert.match(
    html,
    /<video[^>]*controls=""[^>]*preload="none"[^>]*src="\/f\?id=78"/
  );
  assert.match(html, /<video[^>]*poster="\/m\?kind=document&amp;id=78"/);
  assert.ok(!/<video[^>]*autoPlay|<video[^>]*autoplay/i.test(html));
  assert.match(html, /<audio[^>]*controls=""[^>]*src="\/f\?id=79"/);
  assert.ok(!/<audio[^>]*poster/.test(html));
  assert.match(html, /href="\/f\?id=78&amp;download=1"/);
});

test('without a file route there is no player or download link', () => {
  const html = draw(ctxOf({ file: undefined }));
  assert.ok(!/<video|<audio|download/.test(html.replace(/chat\.iv\.\w+/g, '')));
  const none = draw(ctxOf({ file: () => null }));
  assert.ok(!/<video|<audio|<a /.test(none));
});

test('the address keys of a whole file differ from a picture', () => {
  assert.equal(fileKey('7', false), 'file:7');
  assert.equal(fileKey('7', true), 'download:7');
});

test('the disposition saves a file under a safe name, shows players inline', () => {
  assert.deepEqual(
    dispositionOf({ mimeType: 'video/mp4', name: 'a.mp4' }, false),
    {}
  );
  assert.equal(
    Object.keys(dispositionOf({ mimeType: 'video/mp4', name: 'a.mp4' }, true))
      .length,
    1
  );
  // An inline page or script never shows in the app's own origin.
  const html = dispositionOf({ mimeType: 'text/html', name: 'x.html' }, false);
  assert.match(html['content-disposition'], /^attachment;/);
  const tricky = dispositionOf(
    { mimeType: 'application/pdf', name: 'a"/..\\b\r\nX: y é.pdf' },
    true
  )['content-disposition'];
  assert.ok(!/[\r\n]/.test(tricky));
  assert.match(tricky, /filename="a_{2}\.\._b__X: y _\.pdf"/);
  assert.match(tricky, /filename\*=UTF-8''/);
  assert.match(
    dispositionOf({ mimeType: '', name: '' }, true)['content-disposition'],
    /filename="file"/
  );
});

// ---- the file reader ----

const helpers = { returnBigInt: (v) => BigInt(v) };
const Api = {
  InputDocumentFileLocation: named('InputDocumentFileLocation'),
  messages: { GetWebPage: named('GetWebPage') },
};

test('the file reader serves a rich message document by id', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-rich-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createMemoryStore();
  await store.put({
    id: 'msg:telegram:-1007:5',
    source: 'telegram',
    chat: '-1007',
    body: 'x',
    timestamp: new Date().toISOString(),
    raw: { id: 5, richMessage: richWith() },
  });
  const downloads = [];
  const reader = createFileReader({
    store,
    dir,
    queue: { run: (_k, _p, task) => task() },
    importer: async () => ({ Api, helpers }),
    client: async () => ({
      downloadFile: async (location) => {
        downloads.push(location);
        return Buffer.from('fake bytes');
      },
    }),
  });
  const got = await reader.read({ chat: '-1007', id: 5, rich: 'document:77' });
  assert.equal(got.buffer.toString(), 'fake bytes');
  assert.equal(got.mimeType, 'application/pdf');
  assert.equal(got.name, 'plan.pdf');
  assert.equal(String(downloads[0].id), '77');
  // The second read comes from disk, with its name.
  const again = await reader.read({
    chat: '-1007',
    id: 5,
    rich: 'document:77',
  });
  assert.equal(again.name, 'plan.pdf');
  assert.equal(downloads.length, 1);
  // Another document is another file.
  const video = await reader.read({
    chat: '-1007',
    id: 5,
    rich: 'document:78',
  });
  assert.equal(video.mimeType, 'video/mp4');
  assert.equal(downloads.length, 2);
  // Unknown, malformed or path-like ids read nothing.
  for (const rich of [
    'document:99',
    'photo:55',
    'document:../1',
    'document:',
  ]) {
    assert.equal(await reader.read({ chat: '-1007', id: 5, rich }), null, rich);
  }
  assert.equal(downloads.length, 2);
});

// ---- the routes ----

const get = async (url, account, headers = {}) => {
  const out = { head: {}, body: Buffer.alloc(0) };
  const req = {
    method: 'GET',
    url,
    headers: { host: '127.0.0.1:8787', ...headers },
  };
  const res = {
    setHeader() {},
    writeHead(status, head = {}) {
      out.status = status;
      out.head = head;
    },
    end(body) {
      out.body = Buffer.from(body ?? '');
    },
  };
  await handleTelegramRoutes(req, res, url.split('?')[0], {
    telegramAccount: account,
    allowOrigins: [],
  });
  return out;
};

test('the file route validates rich, ranges bytes and offers a download', async () => {
  const asked = [];
  const account = {
    file: async (request) => {
      asked.push(request);
      return {
        buffer: Buffer.from('0123456789'),
        mimeType: 'video/mp4',
        name: 'c.mp4',
      };
    },
  };
  for (const rich of [
    'photo:5',
    'document:x',
    'document:',
    'document:../1',
    'x',
  ]) {
    const bad = await get(
      `/api/telegram/file?chat=-5&id=2&rich=${encodeURIComponent(rich)}`,
      account
    );
    assert.equal(bad.status, 400, rich);
  }
  assert.equal(asked.length, 0);
  const play = await get(
    '/api/telegram/file?chat=-5&id=2&rich=document:78',
    account
  );
  assert.equal(play.status, 200);
  assert.equal(play.head['content-type'], 'video/mp4');
  assert.equal(play.head['accept-ranges'], 'bytes');
  assert.equal(play.head['content-disposition'], undefined);
  assert.deepEqual(asked[0], { chat: '-5', id: 2, rich: 'document:78' });
  const part = await get(
    '/api/telegram/file?chat=-5&id=2&rich=document:78',
    account,
    {
      range: 'bytes=2-4',
    }
  );
  assert.equal(part.status, 206);
  assert.equal(part.body.toString(), '234');
  assert.equal(part.head['content-range'], 'bytes 2-4/10');
  const save = await get(
    '/api/telegram/file?chat=-5&id=2&rich=document:78&download=1',
    account
  );
  assert.match(
    save.head['content-disposition'],
    /^attachment; filename="c\.mp4"/
  );
  // A plain message file asks for no rich document.
  await get('/api/telegram/file?chat=-5&id=2', account);
  assert.deepEqual(asked.at(-1), { chat: '-5', id: 2 });
});

// ---- Instant View ----

const iv = (kind, fields) => ({ className: kind, ...fields });
const page = {
  className: 'Page',
  url: 'https://a.test/p',
  blocks: [
    iv('PageBlockVideo', { videoId: 78n, caption: cap }),
    iv('PageBlockPhoto', { photoId: 5n, caption: cap }),
  ],
  photos: [{ className: 'Photo', id: 5n, sizes: [] }],
  documents: [{ ...doc(78n, 'video/mp4', 'clip.mp4', 11), accessHash: 1n }],
};

const makeIv = (downloads) =>
  createInstantView(
    { importer: async () => ({ Api, helpers }) },
    {
      userClient: async () => ({
        invoke: async () => ({
          webpage: {
            className: 'WebPage',
            siteName: 'S',
            title: 'T',
            cachedPage: page,
          },
        }),
        downloadFile: async (location) => {
          downloads.push(location);
          return Buffer.from('whole video');
        },
      }),
    }
  );

test('Instant View hands a document whole, once, and only a used one', async () => {
  const downloads = [];
  const actions = makeIv(downloads);
  assert.equal(
    await actions.instantViewFile({ kind: 'document', id: '78', full: true }),
    null
  );
  const answer = await actions.instantView({ url: 'https://a.test/p' });
  assert.equal(answer.page.blocks[0].name, 'clip.mp4');
  const [one, two] = await Promise.all([
    actions.instantViewFile({ kind: 'document', id: '78', full: true }),
    actions.instantViewFile({ kind: 'document', id: '78', full: true }),
  ]);
  assert.equal(one.buffer.toString(), 'whole video');
  assert.equal(two.name, 'clip.mp4');
  assert.equal(one.mimeType, 'video/mp4');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].thumbSize, '');
  await actions.instantViewFile({ kind: 'document', id: '78', full: true });
  assert.equal(downloads.length, 1);
  // A photo is never a whole file; an unused document is nothing.
  assert.equal(
    await actions.instantViewFile({ kind: 'photo', id: '5', full: true }),
    null
  );
  assert.equal(
    await actions.instantViewFile({ kind: 'document', id: '9', full: true }),
    null
  );
});

test('the instant-view-media route: whole file by range, download, strict 400s', async () => {
  const asked = [];
  const account = {
    instantViewFile: async (request) => {
      asked.push(request);
      return {
        buffer: Buffer.from('0123456789'),
        mimeType: 'audio/mpeg',
        name: 's.mp3',
      };
    },
  };
  const base = '/api/telegram/instant-view-media';
  assert.equal(
    (await get(`${base}?kind=photo&id=5&full=1`, account)).status,
    400
  );
  assert.equal(
    (await get(`${base}?kind=document&id=x&full=1`, account)).status,
    400
  );
  assert.equal(asked.length, 0);
  const part = await get(`${base}?kind=document&id=5&full=1`, account, {
    range: 'bytes=0-3',
  });
  assert.equal(part.status, 206);
  assert.equal(part.body.toString(), '0123');
  assert.deepEqual(asked[0], { kind: 'document', id: '5', full: true });
  const save = await get(
    `${base}?kind=document&id=5&full=1&download=1`,
    account
  );
  assert.match(save.head['content-disposition'], /filename="s\.mp3"/);
  const big = await get(`${base}?kind=document&id=5&full=1`, {
    instantViewFile: async () => ({ error: 'too-large', size: 99 }),
  });
  assert.equal(big.status, 413);
  // A picture request is unchanged.
  await get(`${base}?kind=document&id=5`, account);
  assert.equal(asked.at(-1).full, false);
});
