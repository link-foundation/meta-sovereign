// Pictures and files in the hosted app (R-Y72): the app on GitHub Pages
// loads them from the local server as CORS requests, which say the page's
// Origin; the server lets the app's own origins have them and still
// refuses any other site. A picture that does not load is counted in the
// log. Fakes only — no network, no running app.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fromApp,
  handleTelegramRoutes,
} from '../src/server/routes-telegram.js';
import { DEFAULT_ALLOWED_ORIGINS } from '../src/server/cors.js';
import { crossOriginFor, mediaSrc } from '../src/web/media-src.js';
import { installClientLog, mediaRouteOf } from '../src/web/client-log.js';

const PAGES = 'https://link-foundation.github.io/meta-sovereign/';
const SERVER = 'https://localhost:8787';

test('a server picture is a CORS load only from another origin', () => {
  const avatar = `${SERVER}/api/telegram/avatar?peer=7&size=s`;
  assert.equal(crossOriginFor(avatar, PAGES), 'anonymous');
  // The server's own page: a plain load, as before.
  assert.equal(crossOriginFor(avatar, `${SERVER}/`), undefined);
  assert.equal(
    crossOriginFor('/api/telegram/media?chat=1&id=2', PAGES),
    undefined
  );
  // Blurred previews and other sites' pictures are not ours to ask.
  assert.equal(crossOriginFor('data:image/jpeg;base64,AA', PAGES), undefined);
  assert.equal(
    crossOriginFor('https://cdn.example/sticker.webp', PAGES),
    undefined
  );
  assert.equal(crossOriginFor(null, PAGES), undefined);
  assert.deepEqual(mediaSrc(null), { src: null, crossOrigin: undefined });
});

const req = (headers, url = '/api/telegram/media?chat=1&id=2&size=m') => ({
  method: 'GET',
  url,
  headers,
});

test('the app’s own origins may load pictures; other sites may not', () => {
  const allowed = [...DEFAULT_ALLOWED_ORIGINS];
  // The server's own page, curl, a typed address.
  assert.ok(fromApp(req({ 'sec-fetch-site': 'same-origin' }), allowed));
  assert.ok(fromApp(req({}), allowed));
  assert.ok(fromApp(req({ 'sec-fetch-site': 'none' }), allowed));
  // The hosted app: a CORS load says which page asks.
  assert.ok(
    fromApp(
      req({
        'sec-fetch-site': 'cross-site',
        origin: 'https://link-foundation.github.io',
      }),
      allowed
    )
  );
  // A plain <img> from another page says no Origin: refused.
  assert.ok(!fromApp(req({ 'sec-fetch-site': 'cross-site' }), allowed));
  // Another site, even asking with CORS: refused.
  assert.ok(
    !fromApp(
      req({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }),
      allowed
    )
  );
  // `--allow-origin=none`: only the server's own page.
  assert.ok(
    !fromApp(
      req({
        'sec-fetch-site': 'cross-site',
        origin: 'https://link-foundation.github.io',
      }),
      []
    )
  );
});

const fakeResponse = () => ({
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value;
  },
  writeHead(status, headers = {}) {
    this.status = status;
    Object.assign(this.headers, headers);
  },
  end(body) {
    this.body = body;
  },
});

test('the route gives the hosted app its pictures and logs refusals once', async () => {
  const account = {
    media: async () => ({
      buffer: Buffer.from('jpeg'),
      mimeType: 'image/jpeg',
    }),
  };
  const logged = [];
  const ctx = {
    telegramAccount: account,
    allowOrigins: [...DEFAULT_ALLOWED_ORIGINS],
    log: (entry) => logged.push(entry),
  };
  const ask = async (headers) => {
    const res = fakeResponse();
    await handleTelegramRoutes(req(headers), res, '/api/telegram/media', ctx);
    return res;
  };
  const ok = await ask({
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'cors',
    origin: 'https://link-foundation.github.io',
  });
  assert.equal(ok.status, 200);
  const plain = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' };
  assert.equal((await ask(plain)).status, 403);
  assert.equal((await ask(plain)).status, 403);
  // Which page asked and how, once; never what.
  assert.deepEqual(logged, [
    {
      level: 'warn',
      event: 'telegram_media_refused',
      route: 'media',
      site: 'cross-site',
      mode: 'no-cors',
      origin: null,
      verdict: 'none',
    },
  ]);
});

test('pictures that do not load are counted in the log, not named', async () => {
  assert.equal(
    mediaRouteOf({ src: `${SERVER}/api/telegram/avatar?peer=7` }),
    'avatar'
  );
  assert.equal(mediaRouteOf({ src: 'data:image/png;base64,AA' }), null);
  assert.equal(mediaRouteOf(null), null);

  const listeners = {};
  const sent = [];
  const timers = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => timers.push(fn);
  try {
    const stop = installClientLog({
      target: {
        addEventListener: (name, fn, capture) => {
          listeners[capture ? `${name}:capture` : name] = fn;
        },
        removeEventListener: () => {},
      },
      send: (entry) => sent.push(entry),
      view: () => 'chat',
    });
    const fail = (src, crossOrigin) =>
      listeners['error:capture']({ target: { src, crossOrigin } });
    fail(`${SERVER}/api/telegram/avatar?peer=7`, 'anonymous');
    fail(`${SERVER}/api/telegram/avatar?peer=8`, 'anonymous');
    fail(`${SERVER}/api/telegram/media?chat=1&id=2`, null);
    fail('https://cdn.example/x.png', null);
    assert.equal(timers.length, 1);
    timers[0]();
    await Promise.resolve();
    assert.deepEqual(sent, [
      {
        level: 'warn',
        event: 'media_failed',
        view: 'chat',
        avatar: 2,
        media: 1,
        cors: 2,
      },
    ]);
    listeners['error:capture']({
      target: {
        src: `${SERVER}/api/telegram/avatar?peer=9`,
        crossOrigin: 'anonymous',
        dataset: { mediaRetrying: 'true' },
      },
    });
    timers[1]();
    await Promise.resolve();
    assert.equal(sent[1].level, 'info');
    assert.equal(sent[1].event, 'media_retrying');
    assert.equal(sent[1].retrying, 1);
    fail(`${SERVER}/api/telegram/avatar?peer=9`, 'anonymous');
    timers[2]();
    await Promise.resolve();
    assert.equal(sent[2].level, 'warn', 'terminal failures still surface');
    assert.equal(sent[2].event, 'media_failed');
    stop();
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});
