// Real browser e2e for viewing stories (R-Y140), as Telegram Desktop
// shows them: a strip above the chat list with a ring round the people
// who have unread ones; a click opens the viewer at the first unread
// story; the right half goes on, the left half back, a story shows a few
// seconds and goes on by itself, past the last story of a person the next
// person's, past the last one it closes; Space pauses, Escape closes; each
// story shown is told to Telegram as seen and its ring goes. Telegram's
// answers and the pictures (tiny generated PNGs) faked in the page, fake
// chats in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`; run
// it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:stories

import { deflateSync } from 'node:zlib';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const store = createMemoryStore();
for (const [chat, name] of [
  [ANN, 'Ann Lee'],
  [BOB, 'Bob Ray'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'private',
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

// A solid-colour PNG, `size` pixels square, made here.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});
const crc = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(body));
  return Buffer.concat([head, body, tail]);
};
const png = (size, [r, g, b]) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const photo = { kind: 'photo' };
const NOW = Math.floor(Date.now() / 1000);
const STORIES = {
  [ANN]: [
    {
      id: 11,
      date: NOW - 7300,
      caption: 'caption 11',
      entities: [],
      media: photo,
    },
    {
      id: 12,
      date: NOW - 600,
      caption: 'bold caption 12',
      entities: [{ className: 'MessageEntityBold', offset: 0, length: 4 }],
      media: photo,
    },
  ],
  [BOB]: [
    {
      id: 21,
      date: NOW - 30,
      caption: 'caption 21',
      entities: [],
      media: photo,
    },
  ],
};
const PEERS = [
  {
    peer: ANN,
    name: 'Ann Lee',
    self: false,
    count: 2,
    lastId: 12,
    maxReadId: 10,
  },
  {
    peer: BOB,
    name: 'Bob Ray',
    self: false,
    count: 1,
    lastId: 21,
    maxReadId: 0,
  },
].map((p) => ({ ...p, unread: true }));

const { base, page, until, finish } = await openChatApp('stories', { store });
// A photo shows 0.6 s here, not 5 s.
await page.addInitScript(() => {
  globalThis.__STORY_PHOTO_MS__ = 600;
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
const reads = [];
await page.route('**/api/telegram/stories', (route) =>
  fulfil(route, {
    ok: true,
    // The hidden list (R-Y148) is empty here.
    peers: route.request().postDataJSON()?.hidden ? [] : PEERS,
    state: 'S',
    more: false,
  })
);
await page.route('**/api/telegram/stories-peer', (route) => {
  const { chat } = route.request().postDataJSON();
  const peer = PEERS.find((p) => p.peer === chat);
  return fulfil(route, { ok: true, peer, stories: STORIES[chat] ?? [] });
});
await page.route('**/api/telegram/stories-read', (route) => {
  const { chat, maxId } = route.request().postDataJSON();
  reads.push(`${chat}:${maxId}`);
  return fulfil(route, { ok: true });
});
await page.route(/\/api\/telegram\/story\?/, (route) =>
  route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: png(8, [20, 120, 220]),
  })
);

const viewer = page.locator('[data-story-viewer]');
const at = async () =>
  [
    await viewer.getAttribute('data-story-viewer'),
    await viewer.getAttribute('data-story'),
  ].join(':');
const waitAt = (want) =>
  until(
    async () => (await viewer.count()) === 1 && (await at()) === want,
    want
  );
const ring = (chat) =>
  page.locator(`[data-story-peer="${chat}"]`).getAttribute('data-unread');

await finish(async () => {
  await page.goto(`${base}/`);

  // The strip: the user's own "+" (R-Y156), two people, a ring on each, their names.
  const peers = page.locator('[data-story-peer]:not([data-story-add])');
  await until(async () => (await peers.count()) === 2, 'two peers');
  const names = await page.locator('.story-peer-name').allTextContents();
  assert(names.join() === 'My story,Ann Lee,Bob Ray', `names: ${names}`);
  assert((await ring(ANN)) === 'true' && (await ring(BOB)) === 'true', 'rings');

  // It folds into a compact row, and opens again.
  const strip = page.locator('[data-stories]');
  await page.locator('[data-action="stories-toggle"]').click();
  assert((await strip.getAttribute('data-stories')) === 'compact', 'compact');
  assert((await page.locator('.story-peer-name').count()) === 0, 'no names');
  await page.locator('[data-action="stories-toggle"]').click();
  assert((await strip.getAttribute('data-stories')) === 'open', 'open again');

  // Ann's: opens at her first unread story (11), with caption and age.
  await page.locator(`[data-story-peer="${ANN}"]`).click();
  await waitAt(`${ANN}:11`);
  const caption = await page.locator('.story-caption').textContent();
  assert(caption === 'caption 11', `caption: ${caption}`);
  const date = await page.locator('.story-head-date').textContent();
  assert(date === '2 h ago', `date: ${date}`);
  await until(() => reads.includes(`${ANN}:11`), 'told 11 seen');
  // The photo is up before its clock starts.
  await until(
    async () => (await page.locator('img.story-media').count()) === 1,
    'the picture'
  );

  // The right half goes on; the story's caption is formatted.
  await viewer.locator('[data-action="story-next"]').click();
  await waitAt(`${ANN}:12`);
  const bold = await page
    .locator('.story-caption strong, .story-caption b')
    .count();
  assert(bold === 1, `bold caption parts: ${bold}`);
  await until(() => reads.includes(`${ANN}:12`), 'told 12 seen');

  // Left half: back to 11; then on again without a click: the clock.
  await viewer.locator('[data-action="story-prev"]').click();
  await waitAt(`${ANN}:11`);
  await waitAt(`${ANN}:12`);
  // Past her last story, by itself: Bob's first (his first unread).
  await waitAt(`${BOB}:21`);
  await until(() => reads.includes(`${BOB}:21`), 'told 21 seen');

  // Left: Ann's last story. Space pauses: it stays; Space goes on.
  await viewer.locator('[data-action="story-prev"]').click();
  await waitAt(`${ANN}:12`);
  await page.keyboard.press('Space');
  assert((await viewer.getAttribute('data-paused')) === 'true', 'paused');
  await page.waitForTimeout(1500);
  assert((await at()) === `${ANN}:12`, 'a paused story stays');
  await page.keyboard.press('Space');
  await waitAt(`${BOB}:21`);

  // Escape closes; the rings are gone; each story told once.
  await page.keyboard.press('Escape');
  await until(async () => (await viewer.count()) === 0, 'closed');
  await until(
    async () => (await ring(ANN)) === 'false' && (await ring(BOB)) === 'false',
    'rings gone'
  );
  assert(
    reads.join() === `${ANN}:11,${ANN}:12,${BOB}:21`,
    `read calls: ${reads}`
  );

  // Past the last story of the last person the viewer closes by itself.
  await page.locator(`[data-story-peer="${BOB}"]`).click();
  await waitAt(`${BOB}:21`);
  await until(async () => (await viewer.count()) === 0, 'closes at the end');

  // × closes too.
  await page.locator(`[data-story-peer="${ANN}"]`).click();
  await waitAt(`${ANN}:11`);
  await viewer.locator('[data-action="story-close"]').click();
  await until(async () => (await viewer.count()) === 0, '× closes');
  assert(reads.length === 3, `nothing more told: ${reads}`);
});
