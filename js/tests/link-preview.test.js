// The link preview of the message box (R-Y145): getWebPagePreview and its
// answers (ready, pending, empty), the cache, the picture route, the send
// carrying noWebpage / invertMedia / a media size, the route validation and
// the page's link detection. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  createLinkPreview,
  previewFields,
} from '../src/sources/telegram-link-preview.js';
import { sendText } from '../src/sources/telegram-send.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { named, postRoute } from './helpers/telegram-route.js';
import { choiceOf, linkOf } from '../src/web/chat-link-preview.js';

const Api = {
  messages: {
    GetWebPagePreview: named('GetWebPagePreview'),
    SendMessage: named('SendMessage'),
    SendMedia: named('SendMedia'),
  },
  InputMediaWebPage: named('InputMediaWebPage'),
  InputPhotoFileLocation: named('InputPhotoFileLocation'),
  MessageEntityUrl: named('MessageEntityUrl'),
};

const PAGE = {
  className: 'WebPage',
  id: 9n,
  url: 'https://example.com/a',
  displayUrl: 'example.com/a',
  siteName: 'Example',
  title: 'A title',
  description: 'About it',
  hasLargeMedia: true,
  photo: {
    className: 'Photo',
    id: 55n,
    accessHash: 7n,
    dcId: 2,
    fileReference: new Uint8Array([1]),
    sizes: [{ className: 'PhotoSize', type: 'm', size: 100 }],
  },
};
const media = (webpage) => ({
  media: { className: 'MessageMediaWebPage', webpage },
});

const make = (answers) => {
  const log = [];
  const downloads = [];
  const next = [...answers];
  const actions = createLinkPreview(
    {
      importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
      queue: { run: async (_k, _p, fn) => fn() },
    },
    {
      userClient: async () => ({
        invoke: async (request) => {
          log.push(request);
          const one = next.length > 1 ? next.shift() : next[0];
          if (one instanceof Error) {
            throw one;
          }
          return one;
        },
        downloadFile: async (location) => {
          downloads.push(location);
          return Buffer.from([0xff, 0xd8, 1, 2]);
        },
      }),
    }
  );
  return { ...actions, log, downloads };
};

test('getWebPagePreview: the text and entities asked, the page shaped', async () => {
  const { linkPreview, log } = make([media(PAGE)]);
  const got = await linkPreview({
    text: 'see **https://example.com/a**',
    url: 'https://example.com/a',
  });
  assert.equal(log[0].className, 'GetWebPagePreview');
  assert.equal(log[0].message, 'see https://example.com/a');
  assert.deepEqual(got, {
    ok: true,
    state: 'ready',
    preview: {
      url: 'https://example.com/a',
      displayUrl: 'example.com/a',
      siteName: 'Example',
      title: 'A title',
      description: 'About it',
      photo: '55',
      large: true,
    },
  });
});

test('pending is not kept; empty and ready are', async () => {
  const pending = { className: 'WebPagePending', id: 1n };
  const { linkPreview, log } = make([
    media(pending),
    media(pending),
    media({ className: 'WebPageEmpty', id: 1n }),
  ]);
  const ask = () => linkPreview({ text: 'a.io', url: 'a.io' });
  assert.equal((await ask()).state, 'pending');
  assert.equal((await ask()).state, 'pending');
  assert.equal((await ask()).state, 'empty');
  assert.equal((await ask()).state, 'empty');
  assert.equal(log.length, 3, 'the fourth came from the cache');
});

test('no media, and a refusal, give no preview', async () => {
  const none = make([{ media: { className: 'MessageMediaEmpty' } }]);
  assert.equal(
    (await none.linkPreview({ text: 'a.io', url: 'a.io' })).state,
    'empty'
  );
  const failing = make([
    Object.assign(new Error('x'), { errorMessage: 'FLOOD_WAIT_3' }),
  ]);
  const got = await failing.linkPreview({ text: 'a.io', url: 'a.io' });
  assert.deepEqual([got.ok, got.code], [false, 'flood']);
});

test('the request is validated before Telegram is asked', async () => {
  const { linkPreview, log } = make([media(PAGE)]);
  for (const body of [
    {},
    { text: 'hello', url: 'a.io' },
    { text: 'a.io', url: 'a b' },
    { text: 'x'.repeat(9000), url: 'a.io' },
  ]) {
    assert.equal((await linkPreview(body)).code, 'bad-request');
  }
  assert.equal(log.length, 0);
});

test('the picture: downloaded through the client, only a listed id', async () => {
  const { linkPreview, linkPreviewPhoto, downloads } = make([media(PAGE)]);
  assert.equal(await linkPreviewPhoto({ id: '55' }), null, 'not handed out');
  await linkPreview({ text: 'example.com/a', url: 'example.com/a' });
  assert.equal(await linkPreviewPhoto({ id: 'x' }), null);
  const got = await linkPreviewPhoto({ id: '55' });
  assert.equal(got.mimeType, 'image/jpeg');
  assert.equal(got.buffer.length, 4);
  assert.equal(downloads[0].className, 'InputPhotoFileLocation');
  assert.equal(downloads[0].thumbSize, 'm');
  await linkPreviewPhoto({ id: '55' });
  assert.equal(downloads.length, 1, 'kept');
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

test('a send without a preview carries noWebpage', async () => {
  const { client, log } = sender();
  await sendText({
    client,
    Api,
    peer: 'p',
    text: 'https://example.com',
    preview: { noWebpage: true, invertMedia: true },
  });
  assert.equal(log[0].className, 'SendMessage');
  assert.equal(log[0].noWebpage, true);
  assert.equal(log[0].invertMedia, true);
});

test('a plain send has neither', async () => {
  const { client, log } = sender();
  await sendText({ client, Api, peer: 'p', text: 'https://example.com' });
  assert.equal('noWebpage' in log[0], false);
  assert.equal('invertMedia' in log[0], false);
});

test('a media size sends the page as InputMediaWebPage', async () => {
  const { client, log } = sender();
  await sendText({
    client,
    Api,
    peer: 'p',
    text: 'look example.com',
    preview: {
      previewUrl: 'example.com',
      previewSize: 'large',
      invertMedia: true,
    },
  });
  assert.equal(log[0].className, 'SendMedia');
  assert.equal(log[0].media.className, 'InputMediaWebPage');
  assert.equal(log[0].media.url, 'http://example.com');
  assert.equal(log[0].media.forceLargeMedia, true);
  assert.equal('forceSmallMedia' in log[0].media, false);
  assert.equal(log[0].media.optional, true);
  assert.equal(log[0].message, 'look example.com');
  assert.equal(log[0].invertMedia, true);
  await sendText({
    client,
    Api,
    peer: 'p',
    text: 'https://a.io',
    preview: { previewUrl: 'https://a.io', previewSize: 'small' },
  });
  assert.equal(log[1].media.forceSmallMedia, true);
  assert.equal(log[1].media.url, 'https://a.io');
});

test('previewFields: strict', () => {
  assert.deepEqual(previewFields({}), {});
  assert.deepEqual(previewFields({ noWebpage: true, invertMedia: false }), {
    noWebpage: true,
  });
  assert.deepEqual(
    previewFields({
      previewUrl: 'a.io',
      previewSize: 'small',
      invertMedia: true,
    }),
    { invertMedia: true, previewUrl: 'a.io', previewSize: 'small' }
  );
  // The size does not matter when the preview is off.
  assert.deepEqual(
    previewFields({
      noWebpage: true,
      previewUrl: 'a.io',
      previewSize: 'large',
    }),
    { noWebpage: true }
  );
  for (const bad of [
    { noWebpage: 'yes' },
    { invertMedia: 1 },
    { previewUrl: 'a.io' },
    { previewSize: 'large' },
    { previewUrl: 'a.io', previewSize: 'huge' },
    { previewUrl: 'a b', previewSize: 'large' },
    { previewUrl: 5, previewSize: 'large' },
  ]) {
    assert.equal(previewFields(bad), null, JSON.stringify(bad));
  }
});

test('the route validates the body', async () => {
  const account = { linkPreview: async () => ({ ok: true, state: 'empty' }) };
  assert.equal(
    await postRoute('link-preview', { text: 'a.io', url: 'a.io' }, account),
    200
  );
  for (const body of [
    {},
    { text: 'a.io' },
    { url: 'a.io' },
    { text: 5, url: 'a.io' },
    { text: 'a.io', url: 'a b' },
  ]) {
    assert.equal(await postRoute('link-preview', body, account), 400);
  }
  assert.equal(
    await postRoute('link-preview', { text: 'a.io', url: 'a.io' }, {}),
    400
  );
});

const getPhoto = async (query, account) => {
  const url = `/api/telegram/link-preview-photo${query}`;
  const req = Object.assign(Readable.from([]), {
    method: 'GET',
    url,
    headers: { host: '127.0.0.1:8787' },
  });
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end() {},
  };
  await handleTelegramRoutes(req, res, url.split('?')[0], {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res.status;
};

test('the picture route: a digits id, 404 without a picture', async () => {
  const account = {
    linkPreviewPhoto: async ({ id }) =>
      id === '5' ? { buffer: Buffer.from([1]), mimeType: 'image/jpeg' } : null,
  };
  assert.equal(await getPhoto('?id=5', account), 200);
  assert.equal(await getPhoto('?id=6', account), 404);
  assert.equal(await getPhoto('?id=x', account), 400);
  assert.equal(await getPhoto('', account), 400);
  assert.equal(await getPhoto('?id=5', {}), 501);
});

test('linkOf: the first http(s) or bare-domain link', () => {
  assert.equal(
    linkOf('see https://example.com/a?b=1, ok'),
    'https://example.com/a?b=1'
  );
  assert.equal(linkOf('go to example.com.'), 'example.com');
  assert.equal(linkOf('t.me/durov/5 now'), 't.me/durov/5');
  assert.equal(linkOf('a (http://x.io/p)'), 'http://x.io/p');
  assert.equal(linkOf('first a.io then b.io'), 'a.io');
  for (const text of [
    '',
    'hello world',
    'mail me@example.com',
    'open notes.txt',
    'e.g. this',
    'version 1.2',
    null,
  ]) {
    assert.equal(linkOf(text), null, String(text));
  }
});

test('choiceOf: what the next send carries', () => {
  const link = 'a.io';
  assert.equal(choiceOf({ link: null, dismissed: true }), null);
  assert.equal(
    choiceOf({ link, dismissed: false, invert: false, size: null }),
    null
  );
  assert.deepEqual(choiceOf({ link, dismissed: true, size: 'large' }), {
    noWebpage: true,
  });
  assert.deepEqual(
    choiceOf({ link, dismissed: false, invert: true, size: 'small' }),
    { invertMedia: true, previewUrl: link, previewSize: 'small' }
  );
});
