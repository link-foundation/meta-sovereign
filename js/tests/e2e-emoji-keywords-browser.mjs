// Real browser e2e for emoji found by Telegram's words (R-Y117): with
// the page in Russian, the emoji panel's search asks the server for
// Telegram's Russian words once, puts their emoji first and the English
// names after; a pick types it.
// Telegram's answers faked in the page, a fake chat in a memory store, a
// server on a free port, a headless browser; nothing reaches a network
// or a running app, nothing is sent. Not part of `npm test`; run it
// with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:emoji-keywords

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('emoji-keywords');

const CHAT = '555';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHAT}:1`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Dave',
  body: 'look at this',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-emoji-keywords-'));
const handle = await startServer({
  localUi: true,
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

const fulfil = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'ru');
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
await page.route('**/api/telegram/emoji-keywords', (route) => {
  asked.push(route.request().postDataJSON());
  return fulfil(route, {
    ok: true,
    lang: 'ru',
    keywords: { кот: ['🐈', '🐱'], котик: ['😻'], сердце: ['❤'] },
  });
});

const until = async (check, what, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out: ${what}`);
};

const panel = page.locator('.emoji-panel');
const found = () =>
  panel
    .locator('[data-category="found"] .emoji-cell')
    .evaluateAll((cells) => cells.map((c) => c.dataset.emoji));

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.locator('[data-action="emoji"]').click();
  await panel.waitFor({ timeout: 5000 });
  const tab = panel.locator('[data-tab="emoji"]');
  if (await tab.count()) {
    await tab.click();
  }
  assert(asked.length === 0, 'not asked before a search');
  const box = panel.locator('input.emoji-search');

  // Telegram's Russian words: the word itself first, then the words it
  // begins.
  await box.fill('кот');
  await until(async () => (await found())[0] === '🐈', 'the words found');
  assert(
    (await found()).join() === '🐈,🐱,😻',
    `found: ${(await found()).join()}`
  );
  assert(asked.length === 1 && asked[0].lang === 'ru', JSON.stringify(asked));

  // Asked once; FE0F aside; English names still found after.
  await box.fill('сердце');
  await until(async () => (await found())[0] === '❤️', 'a heart');
  await box.fill('cat');
  await until(async () => (await found()).includes('🐱'), 'English names');
  assert(asked.length === 1, `asked once: ${asked.length}`);

  // A pick types it.
  await box.fill('котик');
  await until(async () => (await found())[0] === '😻', 'котик');
  await panel.locator('[data-category="found"] .emoji-cell').first().click();
  const text = await page.locator('.chat-composer textarea').inputValue();
  assert(text === '😻', `typed: ${text}`);

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-emoji-keywords] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-emoji-keywords] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-emoji-keywords-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
