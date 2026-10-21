// Real browser e2e for the browser's copy of the reply index (R-Y70) and
// a chat screen that stays smooth with thousands of chats (R-Y71). Fake
// messages in a memory store, a server on a free port, headless
// Chromium; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:replies

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';

const skip = (msg) => {
  console.log(`[e2e-reply-cache] SKIP: ${msg}`);
  process.exit(0);
};
if (!process.env.RUN_BROWSER_E2E) {
  skip('RUN_BROWSER_E2E not set');
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  skip('playwright not installed');
}

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(`assertion failed: ${msg}`);
  }
};

const CHATS = 2000;
const WORDS =
  'hello how are you fine thanks see tomorrow evening sure great look send papers'.split(
    ' '
  );
const say = (i, n) =>
  Array.from(
    { length: n },
    (_, k) => WORDS[(i * 7 + k * 3) % WORDS.length]
  ).join(' ');

const store = createMemoryStore();
const now = Date.now();
for (let c = 1; c <= CHATS; c++) {
  for (let i = 1; i <= 6; i++) {
    const mine = i % 3 === 0;
    await store.put({
      id: `msg:telegram:-100${c}:${i}`,
      source: 'telegram',
      chat: `-100${c}`,
      chatName: `Fake chat ${c}`,
      chatType: 'supergroup',
      // Each chat its own people, as in life (the owner is in every one).
      sender: mine ? 'me' : `u${c}_${i % 2}`,
      senderName: mine ? 'me' : `Fake user ${i % 5}`,
      // Chat 1 waits for an answer we gave twice before.
      body:
        c <= 3 && i >= 5
          ? mine
            ? 'See you tomorrow!'
            : 'Bye'
          : say(i + c, 3 + (i % 5)),
      timestamp: new Date(now - (c * 100 + (6 - i)) * 60_000).toISOString(),
      raw: { id: i },
    });
  }
}
await store.put({
  id: 'msg:telegram:-1001:7',
  source: 'telegram',
  chat: '-1001',
  chatName: 'Fake chat 1',
  chatType: 'supergroup',
  sender: 'u1_1',
  senderName: 'Fake user 1',
  body: 'Bye',
  timestamp: new Date(now - 60_000).toISOString(),
  raw: { id: 7 },
});

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-replies-'));
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
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const asked = [];
page.on('request', (r) => {
  const url = new URL(r.url());
  if (url.pathname.startsWith('/api/suggest')) {
    asked.push(url.pathname);
  }
});
await page.addInitScript(() => {
  globalThis.__long = [];
  new globalThis.PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      globalThis.__long.push(entry.duration);
    }
  }).observe({ type: 'longtask', buffered: true });
});
const chips = () =>
  page.$$eval('.suggestions .chip', (nodes) => nodes.map((n) => n.textContent));
const box = () => page.locator('textarea').last();

try {
  await page.goto(`${base}/#chat=telegram:-1001`);
  await page.waitForSelector('[data-row]', { timeout: 60_000 });
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.suggestions .chip').length > 0,
    null,
    { timeout: 15_000 }
  );

  // R-Y71: a page of the chat list, growing as it is scrolled.
  const rows = await page.$$eval('.chat-item', (n) => n.length);
  assert(rows > 0 && rows < 200, `a page of chat rows, not ${rows}`);
  await page.$eval('.chat-list', (list) => {
    list.scrollTop = list.scrollHeight;
  });
  await page.waitForFunction(
    (before) =>
      globalThis.document.querySelectorAll('.chat-item').length > before,
    rows,
    { timeout: 10_000 }
  );

  // R-Y69/R-Y70: nothing typed — the typical reply, from the copy.
  assert(
    JSON.stringify(await chips()) === JSON.stringify(['See you tomorrow!']),
    `typical reply offered: ${JSON.stringify(await chips())}`
  );

  // Typing asks the server nothing; the copy answers every key.
  await box().click();
  await page.evaluate(() => globalThis.__long.splice(0));
  asked.length = 0;
  for (const ch of 'See yo') {
    await page.keyboard.type(ch);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() =>
            globalThis.requestAnimationFrame(resolve)
          )
        )
    );
  }
  assert(
    !asked.includes('/api/suggest'),
    `no suggestion asked while typing: ${asked}`
  );
  assert((await chips()).length > 0, 'suggestions while typing');
  const long = await page.evaluate(() => globalThis.__long.splice(0));
  assert(
    long.every((ms) => ms < 100),
    `no long task while typing: ${long.map(Math.round)}`
  );
  // A pause: the server is asked once for what the copy left out.
  await page.waitForTimeout(700);
  assert(
    asked.filter((p) => p === '/api/suggest').length === 1,
    `one refinement after the pause: ${asked}`
  );

  // A reload suggests from the kept copy before the server answers.
  await box().fill('');
  await page.waitForTimeout(2500);
  await page.route('**/api/suggest/**', (route) =>
    globalThis.setTimeout(() => route.continue().catch(() => {}), 5000)
  );
  await page.route('**/api/suggest?*', (route) =>
    globalThis.setTimeout(() => route.continue().catch(() => {}), 5000)
  );
  await page.reload();
  await page.waitForSelector('textarea', { timeout: 60_000 });
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.suggestions .chip').length > 0,
    null,
    { timeout: 4000 }
  );
  assert(
    (await chips()).includes('See you tomorrow!'),
    'the kept copy answers at once'
  );
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
  console.log('[e2e-reply-cache] ok');
} finally {
  await browser.close();
  await handle.close?.();
  await rm(dir, { recursive: true, force: true });
}
