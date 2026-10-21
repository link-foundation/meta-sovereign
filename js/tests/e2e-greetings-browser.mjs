/**
 * Real-browser Greetings run (issue #35).
 *
 * Boots the JS server with a seeded in-memory store and fake VK and
 * Telegram adapters, opens the SPA in headless Chromium and walks the
 * whole screen: the built-in VK stickers (direct vk.com links), a live
 * listing whose Telegram thumbnails come through the server proxy, a
 * saved selection, a plan preview and a queued send.
 *
 * Nothing reaches a messenger: the adapters record what they would
 * have sent. The vk.com sticker pictures are real links, so they load
 * only when the machine can reach vk.com; the run reports that instead
 * of failing on it.
 *
 * Playwright is an optional dependency, so this is not part of
 * `npm test`. Run it explicitly:
 *
 *   RUN_BROWSER_E2E=1 npm run test:e2e:greetings
 *
 * Set `GREETINGS_SCREENSHOT=<file.png>` to save a full-page screenshot.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';

import { buildMessageLink } from '../src/sources/link.js';
import { createMemoryStore } from '../src/storage/index.js';
import { startServer } from '../src/server/index.js';
import { vkGreetingStickers } from '../src/greetings/index.js';

const skip = (message) => {
  console.log(`[e2e-greetings-browser] SKIP: ${message}`);
  process.exit(0);
};

if (!process.env.RUN_BROWSER_E2E) {
  skip('RUN_BROWSER_E2E not set');
}

let playwright = null;
try {
  playwright = await import('playwright');
} catch {
  skip('playwright is not installed (npm i playwright)');
}

const assert = (cond, message) => {
  if (!cond) {
    throw new Error(`assertion failed: ${message}`);
  }
};

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};

/**
 * A 64×64 PNG disc in the given colour — the stand-in for a Telegram
 * thumbnail, generated here so no artwork lives in the repository.
 */
const discPng = ([r, g, b]) => {
  const size = 64;
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const inside = (x - 31.5) ** 2 + (y - 31.5) ** 2 <= 30 ** 2;
      row.set(inside ? [r, g, b, 255] : [0, 0, 0, 0], 1 + x * 4);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const TELEGRAM_STICKERS = [
  ['tg-wave-1', 'thumb-1', '👋', [255, 196, 0]],
  ['tg-wave-2', 'thumb-2', '🖐', [80, 170, 255]],
].map(([id, thumbnailFileId, emoji, colour]) => ({
  sticker: {
    network: 'telegram',
    id,
    pack: 'UtyaDuck',
    packTitle: 'Utya Duck (fixture)',
    emoji,
    format: 'webp',
    thumbnailFileId,
    addUrl: 'https://t.me/addstickers/UtyaDuck',
  },
  png: discPng(colour),
}));

/** Adapters that record instead of talking to a messenger. */
const fakeSources = (calls) => (name) => ({
  name,
  live: {
    async post(content) {
      calls.push({ name, content });
      return { ok: true };
    },
    async listGreetingStickers() {
      return {
        stickers:
          name === 'telegram'
            ? TELEGRAM_STICKERS.map((entry) => entry.sticker)
            : [{ ...vkGreetingStickers[0], emoji: '👋' }],
        failures: [],
      };
    },
    async fetchFile(id) {
      const entry = TELEGRAM_STICKERS.find(
        (item) => item.sticker.thumbnailFileId === id
      );
      if (!entry) {
        throw new Error(`telegram getFile: unknown ${id}`);
      }
      return { bytes: entry.png, path: `thumbnails/${id}.png` };
    },
  },
});

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

const seed = async (store) => {
  const rows = [
    ['vk', '1', '100', '100', 'Ok', hoursAgo(500)],
    ['vk', '2', '200', '200', 'Спасибо', hoursAgo(900)],
    ['telegram', 't1', '77', '77', 'Привет!', hoursAgo(1)],
    ['whatsapp', 'w1', '1555', '1555', 'Hello', hoursAgo(30)],
  ];
  for (const [source, externalId, chat, sender, body, timestamp] of rows) {
    await store.put(
      buildMessageLink({ source, externalId, chat, sender, body, timestamp })
    );
  }
};

const imageLoaded = (page, selector) =>
  page.$eval(selector, (img) => img.complete && img.naturalWidth > 0);

const run = async () => {
  const store = createMemoryStore();
  await seed(store);
  const calls = [];
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-greetings-'));
  const handle = await startServer({
    port: 0,
    storeDir: dir,
    store,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    log: null,
    greetings: { resolveSource: fakeSources(calls), sleep: async () => {} },
  });
  const base = `http://127.0.0.1:${handle.port}`;
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // The send flow calls window.confirm() to show the plan; accept it.
    page.on('dialog', (dialog) => dialog.accept());
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'metaSovereignTutorial',
        JSON.stringify({ off: true, at: 0 })
      );
      // Auto-accept the greetings send confirmation dialog.
      window.confirm = () => true;
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.click('button[data-view="greetings"]');

    const firstVk = `[data-sticker="vk:${vkGreetingStickers[0].id}"] img`;
    await page.waitForSelector(firstVk, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    console.log(
      `[e2e-greetings-browser] vk.com preview loaded: ${await imageLoaded(page, firstVk)}`
    );

    // Live listing: Telegram thumbnails come through the server proxy.
    await page.click('button[data-action="greetings-list-live"]');
    const tg = '[data-sticker="telegram:tg-wave-1"] img';
    await page.waitForSelector(tg, { timeout: 10000 });
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.naturalWidth > 0,
      tg,
      { timeout: 10000 }
    );
    assert(
      (await page.getAttribute(tg, 'src')).includes('/api/greetings/file?id='),
      'telegram thumbnail is not proxied'
    );

    // Pick a Telegram sticker, answer in Russian, save.
    await page.click('[data-sticker="telegram:tg-wave-1"] input');
    await page.selectOption('select[data-field="language"]', 'ru');
    await page.click('button[data-action="greetings-save"]');
    await page.waitForSelector(
      'button[data-action="greetings-save"][disabled]'
    );
    const saved = await (await fetch(`${base}/api/greetings/selection`)).json();
    assert(saved.language === 'ru', 'language was not saved');
    assert(
      saved.stickers.some((s) => s.id === 'tg-wave-1'),
      'telegram sticker was not saved'
    );

    // Preview who would be greeted, then send.
    await page.click('button[data-action="greetings-preview"]');
    await page.waitForSelector('[data-chat="vk:200"]', { timeout: 10000 });
    assert(calls.length === 0, 'preview must not send');
    await page.waitForSelector(
      '[data-chat="whatsapp:1555"][data-skipped="outside-messaging-window"]'
    );
    await page.fill('input[data-field="delay"]', '0');
    await page.click('button[data-action="greetings-send"]');
    await page.waitForFunction(
      () => {
        const text =
          document.querySelector('[data-chat="vk:100"]')?.textContent ?? '';
        // 'greetings.sent' is 'Sent' in English and 'Отправлено' in Russian.
        return (
          text.toLowerCase().includes('отправлено') ||
          text.toLowerCase().includes('sent')
        );
      },
      undefined,
      { timeout: 10000 }
    );
    // Never-written chats go first, oldest first; WhatsApp's closed
    // window is skipped and Telegram gets the sticker picked above.
    assert(
      calls.map((c) => `${c.name}:${c.content.chat}`).join(',') ===
        'vk:200,vk:100,telegram:77',
      `unexpected sends ${JSON.stringify(calls)}`
    );
    assert(
      calls[2].content.sticker?.id === 'tg-wave-1',
      'telegram did not send the picked sticker'
    );
    assert(
      await store.get('greeting:vk:100'),
      'the sent greeting was not recorded'
    );
    assert(errors.length === 0, `page errors: ${errors.join('; ')}`);

    if (process.env.GREETINGS_SCREENSHOT) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: process.env.GREETINGS_SCREENSHOT,
        fullPage: true,
      });
      console.log(
        `[e2e-greetings-browser] screenshot: ${process.env.GREETINGS_SCREENSHOT}`
      );
    }
  } finally {
    await browser.close();
    await handle.close();
    await rm(dir, { recursive: true, force: true });
  }
};

await run();
console.log('[e2e-greetings-browser] OK');
