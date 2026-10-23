// Real browser e2e for albums, forwards and the oldest-first chat list
// (R-Y88..R-Y90). Fake chats in a memory store, a server on a free port,
// a headless browser; nothing reaches Telegram or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:albums

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

// E2E_BROWSER=webkit runs it in Safari's engine.
const { engine, browserType } = await browserOf('albums');

const CHANNEL = '-100777';
const SOURCE = '-100555';
const idOf = (n) => `msg:telegram:${CHANNEL}:${n}`;
const DAY = 86_400_000;
const now = Date.now();
const startOfToday = new Date(now).setHours(0, 0, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

const photo = (w, h) => ({
  className: 'MessageMediaPhoto',
  photo: {
    className: 'Photo',
    id: '1',
    sizes: [{ className: 'PhotoSize', type: 'm', w, h, size: 1 }],
  },
});

const store = createMemoryStore();
const post = (n, fields = {}, raw = {}) =>
  store.put({
    id: idOf(n),
    source: 'telegram',
    chat: CHANNEL,
    chatName: 'Fake Rent Channel',
    chatType: 'channel',
    sender: CHANNEL,
    senderName: 'Fake Rent Channel',
    body: '📎',
    timestamp: iso(Math.max(now - 60_000, startOfToday + 1000)),
    raw: { id: n, ...raw },
    ...fields,
  });

// The channel: a post, an album of ten (the first captioned), a photo
// with no caption, a forward from a channel the list knows.
await post(1, { body: 'a plain post', timestamp: iso(startOfToday + 1000) });
for (let n = 2; n <= 11; n++) {
  await post(n, n === 2 ? { body: 'Flat with two bedrooms' } : {}, {
    groupedId: '9001',
    media: photo(n % 2 ? 1280 : 960, n % 2 ? 960 : 1280),
  });
}
await post(12, {}, { media: photo(1280, 853) });
await post(
  13,
  { body: 'a forwarded post' },
  { fwdFrom: { fromId: { className: 'PeerChannel', channelId: '555' } } }
);

// The list: 25 old chats, 2 of yesterday, 12 of today.
const chat = (key, name, at) =>
  store.put({
    id: `msg:telegram:${key}:1`,
    source: 'telegram',
    chat: key,
    chatName: name,
    chatType: 'channel',
    sender: key,
    senderName: name,
    body: `fake head of ${name}`,
    timestamp: iso(at),
    raw: { id: 1 },
  });
await chat(SOURCE, 'Source Channel', now - 1000 * DAY);
for (let i = 1; i <= 24; i++) {
  await chat(`-1009${i}`, `Old chat ${i}`, now - (30 + i * 20) * DAY);
}
await chat('-100801', 'Yesterday chat 1', startOfToday - 6 * 3_600_000);
await chat('-100802', 'Yesterday chat 2', startOfToday - 3 * 3_600_000);
for (let i = 1; i <= 11; i++) {
  await chat(`-1008${10 + i}`, `Today chat ${i}`, startOfToday + i * 1000);
}

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-albums-'));
const handle = await startServer({
  port: 0,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
  timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// The server is busy (restarting) on the first load of the chat list.
let refused = 0;
await page.route('**/api/chat/heads', (route) => {
  if (refused === 0) {
    refused += 1;
    return route.fulfill({ status: 503, body: '{}' });
  }
  return route.continue();
});

let failed = false;
try {
  await page.goto(`${base}/#chat=telegram:${CHANNEL}`);
  await page.waitForSelector(`[data-row="${idOf(1)}"]`, { timeout: 15000 });

  // An album is one bubble with a tile for each photo, each with a size.
  const albums = await page.$$('[data-items]');
  assert(albums.length === 1, `one album bubble, got ${albums.length}`);
  const tiles = await page.$$eval('[data-album-item]', (nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    })
  );
  assert(tiles.length === 10, `ten tiles, got ${tiles.length}`);
  assert(
    tiles.every(([w, h]) => w > 40 && h > 40),
    `every tile has a size: ${JSON.stringify(tiles)}`
  );
  const captions = await page.$$eval('[data-items] .bubble-body', (nodes) =>
    nodes.map((n) => n.textContent)
  );
  assert(
    captions.length === 1 && captions[0].includes('Flat with two bedrooms'),
    `one caption: ${JSON.stringify(captions)}`
  );
  console.log(`[e2e-albums] album: 1 bubble, tiles ${JSON.stringify(tiles)}`);

  // A photo with no caption keeps its size; no row is only a time.
  const single = await page
    .locator(`[data-row="${idOf(12)}"] .bubble-photo`)
    .boundingBox();
  assert(
    single && single.width > 150 && single.height > 80,
    `a captionless photo has a size: ${JSON.stringify(single)}`
  );
  const rows = await page.$$eval('[data-row] .bubble', (nodes) =>
    nodes.map((n) => Math.round(n.getBoundingClientRect().width))
  );
  assert(
    rows.length === 4 && rows.every((w) => w > 60),
    `four rows, none empty: ${JSON.stringify(rows)}`
  );

  // A forward names its channel.
  await page.waitForFunction(
    () => document.body.innerText.includes('Source Channel'),
    null,
    { timeout: 15000 }
  );
  const text = await page.locator(`[data-row="${idOf(13)}"]`).innerText();
  assert(text.includes('Source Channel'), `forward names it: ${text}`);
  assert(!/PeerChannel/.test(await page.content()), 'never "PeerChannel"');
  console.log('[e2e-albums] forward: names "Source Channel"');

  // Oldest first: every chat, once the busy server answers, the old
  // ones on top.
  assert(refused === 1, 'the first load of the list was refused');
  await page.selectOption('.chat-sort', 'oldest');
  await page.waitForFunction(
    () => document.querySelectorAll('.chat-group [data-chat]').length >= 39,
    null,
    { timeout: 20000 }
  );
  const groups = await page.$$eval('.chat-group', (nodes) =>
    nodes.map((n) => [
      n.querySelector('h3')?.textContent,
      n.querySelectorAll('[data-chat]').length,
    ])
  );
  console.log(`[e2e-albums] oldest first: ${JSON.stringify(groups)}`);
  assert(groups[0][1] === 25, `the old chats first: ${JSON.stringify(groups)}`);
  assert(groups.at(-1)[1] === 12, `today's last: ${JSON.stringify(groups)}`);
  const first = await page
    .locator('.chat-group [data-chat]')
    .first()
    .getAttribute('data-chat');
  assert(first === `telegram:${SOURCE}`, `the oldest is first: ${first}`);

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-albums] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-albums] FAIL (${engine}): ${error.message}`);
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
