// Real browser e2e for search in a chat (R-Y98): Ctrl+F (or the
// magnifier) opens the bar; what is typed is asked of Telegram; the chat
// goes to the newest match and lights it up; Enter goes to an older one —
// loading older pages to reach it — Shift+Enter back; "1 of 2" says
// where; Esc closes. Fake chats in a memory store, Telegram's answer
// faked in the page, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:chat-search

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('chat-search');

const CHAT = '777';
const COUNT = 160;
const store = createMemoryStore();
const start = Date.now() - COUNT * 60_000;
for (let id = 1; id <= COUNT; id += 1) {
  const needle = id === 3 || id === 150;
  await store.put({
    id: `msg:telegram:${CHAT}:${id}`,
    source: 'telegram',
    chat: CHAT,
    chatName: 'Fake Carol',
    chatType: 'user',
    sender: CHAT,
    senderName: 'Fake Carol',
    body: needle ? `the needle, number ${id}` : `plain message ${id}`,
    timestamp: new Date(start + id * 60_000).toISOString(),
    raw: { id },
  });
}

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-chat-search-'));
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.route('**/api/telegram/status', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
      offline: false,
      needsLogin: false,
    }),
  })
);
// Telegram's history is the store's here: nothing more to read.
await page.route('**/api/telegram/history', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ written: 0, cached: 0, complete: true }),
  })
);
const asked = [];
await page.route('**/api/telegram/search', (route) => {
  const body = JSON.parse(route.request().postData() ?? '{}');
  asked.push(body);
  const hit = /needle/i.test(body.q ?? '');
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(
      hit
        ? { ok: true, ids: [150, 3], count: 2, more: false }
        : { ok: true, ids: [], count: 0, more: false }
    ),
  });
});

const msg = (id) => `[data-message="msg:telegram:${CHAT}:${id}"]`;
const countSays = (text) =>
  page.waitForFunction(
    (want) =>
      document.querySelector('.chat-find-count')?.textContent?.trim() === want,
    text,
    { timeout: 10_000 }
  );
const found = (id) =>
  page.waitForSelector(`${msg(id)}.is-found, ${msg(id)} .is-found`, {
    timeout: 15_000,
  });

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.click(`[data-chat="telegram:${CHAT}"]`);
  await page.waitForSelector(msg(COUNT));
  assert(
    (await page.$$(msg(3))).length === 0,
    'the oldest match is not loaded yet'
  );

  await page.keyboard.press('Control+f');
  await page.waitForSelector('.chat-find-input');
  assert(
    await page.$eval(
      '.chat-find-input',
      (input) => document.activeElement === input
    ),
    'the bar takes the typing'
  );
  await page.fill('.chat-find-input', 'nothing like it');
  await countSays('No messages found');
  console.log('[e2e-chat-search] no match: said so');

  await page.fill('.chat-find-input', 'needle');
  await countSays('1 of 2');
  await found(150);
  assert(asked.at(-1).chat === CHAT, `asked: ${JSON.stringify(asked.at(-1))}`);
  console.log('[e2e-chat-search] the newest match, lit up: 1 of 2');

  await page.keyboard.press('Enter');
  await countSays('2 of 2');
  await page.waitForSelector(msg(3), { timeout: 15_000 });
  await found(3);
  console.log('[e2e-chat-search] Enter: an older match, loaded on the way');

  await page.keyboard.press('Shift+Enter');
  await countSays('1 of 2');
  await page.click('[data-action="find-older"]');
  await countSays('2 of 2');
  await page.click('[data-action="find-newer"]');
  await countSays('1 of 2');
  console.log('[e2e-chat-search] Shift+Enter and the arrows move back and on');

  await page.focus('.chat-find-input');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.chat-find', { state: 'detached' });
  // The magnifier opens it again.
  await page.click('[data-action="chat-find"]');
  await page.waitForSelector('.chat-find-input');
  console.log('[e2e-chat-search] Esc closes; the magnifier opens it');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-chat-search] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-chat-search] FAIL (${engine}): ${error.message}`);
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
