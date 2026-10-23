// Real browser e2e for Telegram's reachability (R-Y96): nothing under the
// chat list, whatever Telegram says; the header's badge stays Online while
// Telegram only asks to wait, turns Offline once it is out of reach for
// long (and leads to the Telegram connection), and Online again when it is
// back. Fake chats in a memory store, Telegram's status faked in the
// page, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:offline

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

// E2E_BROWSER=webkit runs it in Safari's engine.
const { engine, browserType } = await browserOf('offline');

const store = createMemoryStore();
await store.put({
  id: 'msg:telegram:-100777:1',
  source: 'telegram',
  chat: '-100777',
  chatName: 'Fake Channel',
  chatType: 'channel',
  sender: '-100777',
  senderName: 'Fake Channel',
  body: 'a fake post',
  timestamp: new Date().toISOString(),
  raw: { id: 1 },
});

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-offline-'));
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

// What the server would say about Telegram, changed as the test goes.
let telegram = {
  connected: true,
  kind: 'user',
  account: { username: 'owner' },
  error: 'Telegram asked to wait',
  code: 'flood-wait',
  offline: false,
  needsLogin: false,
};
await page.route('**/api/telegram/status', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(telegram),
  })
);

const badge = () => page.locator('.mode-badge');
const badgeSays = (text) =>
  page.waitForFunction(
    (want) => document.querySelector('.mode-badge')?.textContent === want,
    text,
    { timeout: 20_000 }
  );

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.waitForSelector('[data-chat="telegram:-100777"]');
  await badgeSays('Online');
  const footer = await page.$$eval('.chat-account-line', (n) => n.length);
  assert(footer === 0, 'no line under the chat list');
  assert(
    !(await page.content()).includes('asked to wait'),
    'a wait is shown nowhere'
  );
  console.log('[e2e-offline] asked to wait: Online, nothing shown');

  telegram = { ...telegram, error: 'connect ECONNREFUSED', offline: true };
  await badgeSays('Offline');
  assert(
    /reachable/.test((await badge().getAttribute('title')) ?? ''),
    'it says why'
  );
  await badge().click();
  await page.waitForSelector('main[data-view="connections"]', {
    timeout: 10_000,
  });
  console.log('[e2e-offline] out of reach: Offline, leads to the connection');

  telegram = { ...telegram, error: null, code: null, offline: false };
  await badgeSays('Online');
  console.log('[e2e-offline] back: Online');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-offline] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-offline] FAIL (${engine}): ${error.message}`);
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
