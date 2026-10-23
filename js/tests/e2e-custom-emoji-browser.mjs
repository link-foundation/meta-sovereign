// Real browser e2e for custom emoji in messages (R-Y120), as Telegram's
// apps draw them: the message's picture replaces the fallback emoji
// inline at the text's size, the fallback stays in the page so copying
// the message still gives the emoji, a video emoji plays as a muted
// loop, and a message of custom emoji alone shows them big. Telegram's
// answers faked in the page, a fake chat in a memory store, a server on
// a free port, a headless browser; nothing reaches a network or a
// running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:custom-emoji

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('custom-emoji');

const CHAT = '555';
const store = createMemoryStore();
const put = (n, body, entities, minutes) =>
  store.put({
    id: `msg:telegram:${CHAT}:${n}`,
    source: 'telegram',
    chat: CHAT,
    chatName: 'Fake Dave',
    chatType: 'user',
    sender: CHAT,
    senderName: 'Fake Dave',
    body,
    timestamp: new Date(Date.now() - minutes * 60_000).toISOString(),
    raw: { id: n, entities },
  });
const custom = (offset, length, documentId) => ({
  className: 'MessageEntityCustomEmoji',
  offset,
  length,
  documentId,
});
await put(1, 'look 😀 here', [custom(5, 2, '5001')], 5);
await put(2, '🔥', [custom(0, 2, '5002')], 4);
await put(3, 'moving 🎬', [custom(7, 2, '5003')], 3);

// A 1×1 PNG for every picture.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-custom-emoji-'));
const handle = await startServer({
  port: 0,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
  automations: {
    scheduler: false,
    setTyping: async () => ({ supported: false }),
    send: async () => ({ via: 'fake' }),
  },
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const fulfil = (route, body) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
await page.route('**/api/telegram/status', (route) =>
  fulfil(route, {
    connected: true,
    kind: 'user',
    account: { username: 'owner' },
    offline: false,
    needsLogin: false,
  })
);
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
const asked = [];
await page.route('**/api/telegram/custom-emoji?*', (route) => {
  const url = new URL(route.request().url());
  const id = url.searchParams.get('id');
  const full = url.searchParams.get('full') === '1';
  asked.push(`${id}${full ? '-full' : ''}`);
  if (full) {
    return id === '5003'
      ? route.fulfill({
          status: 200,
          contentType: 'video/webm',
          body: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
        })
      : route.fulfill({ status: 404, body: '' });
  }
  return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });

  // The picture replaces the fallback, inline at the text's size.
  const first = page.locator('[data-custom-emoji="5001"]');
  await first.waitFor({ timeout: 10000 });
  await first.locator('img.msg-custom-emoji-img').waitFor({ timeout: 10000 });
  await page.waitForSelector('[data-custom-emoji="5001"].drawn', {
    timeout: 10000,
  });
  const sizes = await first.evaluate((node) => ({
    box: node.getBoundingClientRect().width,
    font: parseFloat(globalThis.getComputedStyle(node).fontSize),
  }));
  assert(
    Math.abs(sizes.box - sizes.font * 1.25) < 1,
    `inline at 1.25em: ${JSON.stringify(sizes)}`
  );
  const shown = await first
    .locator('.msg-custom-emoji-text')
    .evaluate((n) => n.getBoundingClientRect().width);
  assert(shown <= 1, `the fallback is hidden: ${shown}`);

  // The text still copies as the emoji.
  const copied = await page.evaluate(() => {
    const body = document
      .querySelector('[data-custom-emoji="5001"]')
      .closest('.bubble-body');
    const range = document.createRange();
    range.selectNodeContents(body);
    const selection = globalThis.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return String(selection);
  });
  assert(copied.includes('look 😀 here'), `copied: ${JSON.stringify(copied)}`);

  // Alone, a custom emoji is big.
  const alone = page.locator('[data-custom-emoji="5002"]');
  await alone.waitFor({ timeout: 10000 });
  assert(
    (await alone.getAttribute('class')).includes('big'),
    'an emoji alone is big'
  );
  const bigBox = await alone.evaluate((n) => n.getBoundingClientRect().width);
  assert(bigBox > sizes.box * 2, `big: ${bigBox} vs ${sizes.box}`);
  assert(
    !(await first.getAttribute('class')).includes('big'),
    'an emoji in text is not big'
  );

  // A video emoji plays as a muted loop.
  const video = page.locator('[data-custom-emoji="5003"] video');
  await video.waitFor({ timeout: 10000 });
  assert(
    (await video.evaluate((v) => v.muted && v.loop)) === true,
    'muted and looping'
  );
  assert(asked.includes('5001'), `asked: ${asked}`);

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-custom-emoji] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-custom-emoji] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-custom-emoji-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
