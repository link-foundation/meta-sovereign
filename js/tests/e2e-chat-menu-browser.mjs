// Real browser e2e for the chat list's menu (R-Y97): a right-click on a
// chat offers Pin, Mute, Mark as read/unread and Archive as Telegram's
// apps do; Mute opens the times; each asks /api/telegram/dialog; a chat
// marked unread shows the empty badge and loses the mark when opened;
// Delete chat asks first, then the chat leaves the list (R-Y100).
// Fake chats in a memory store, Telegram's answers faked in the page, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:chat-menu

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('chat-menu');

const store = createMemoryStore();
const at = Date.now();
for (const [chat, name, ago] of [
  ['111', 'Fake Alice', 60_000],
  ['222', 'Fake Bob', 120_000],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'user',
    sender: chat,
    senderName: name,
    body: `hello from ${name}`,
    timestamp: new Date(at - ago).toISOString(),
    raw: { id: 1 },
  });
}
// Bob is marked unread (on another device).
await store.put({
  id: 'read:telegram:222',
  tokens: ['read', 'telegram', '222'],
  kind: 'read',
  source: 'telegram',
  chat: '222',
  inboxMaxId: 1,
  unreadMark: 1,
});

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-chat-menu-'));
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
const asked = [];
await page.route('**/api/telegram/dialog', (route) => {
  asked.push(JSON.parse(route.request().postData() ?? '{}'));
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true }),
  });
});
// Clear, delete, leave (R-Y100): the server marks the chat's messages
// deleted, as the real one does.
const removed = [];
await page.route('**/api/telegram/remove-chat', async (route) => {
  const body = JSON.parse(route.request().postData() ?? '{}');
  removed.push(body);
  const link = await store.get(`msg:telegram:${body.chat}:1`);
  if (link) {
    await store.put({ ...link, deleted: true });
  }
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, chat: body.chat, deleted: 1 }),
  });
});
const until = async (check, what, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out: ${what}`);
};

const menuItems = () =>
  page.$$eval('.msg-context-menu [role="menuitem"]', (items) =>
    items.map((i) => i.dataset.action)
  );

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.waitForSelector('[data-chat="telegram:111"]');

  // Bob's row: the empty badge of a chat marked unread.
  await page.waitForSelector(
    '[data-chat="telegram:222"] [data-unread="marked"]'
  );
  console.log('[e2e-chat-menu] marked unread: the empty badge');

  // Alice's menu, as Telegram's.
  await page.click('[data-chat="telegram:111"]', { button: 'right' });
  await page.waitForSelector('.msg-context-menu');
  const items = await menuItems();
  assert(
    JSON.stringify(items) ===
      JSON.stringify([
        'pinChat',
        'mute',
        'markUnread',
        'archive',
        'clearHistory',
        'deleteChat',
      ]),
    `menu items: ${items}`
  );
  await page.click('.msg-context-menu [data-action="pinChat"]');
  await until(() => asked.length === 1, 'pin asked');
  assert(
    asked[0].chat === '111' && asked[0].action === 'pin',
    `pin: ${JSON.stringify(asked[0])}`
  );
  assert(
    (await page.$$('.msg-context-menu')).length === 0,
    'the menu closes after a choice'
  );
  console.log('[e2e-chat-menu] Pin asks Telegram');

  // Mute opens the times; 8 hours.
  await page.click('[data-chat="telegram:111"]', { button: 'right' });
  await page.click('.msg-context-menu [data-action="mute"]');
  await page.waitForSelector('.msg-context-menu [data-action="mute8h"]');
  const times = await menuItems();
  assert(
    JSON.stringify(times) ===
      JSON.stringify(['mute1h', 'mute8h', 'mute2d', 'muteForever']),
    `mute times: ${times}`
  );
  await page.click('.msg-context-menu [data-action="mute8h"]');
  await until(() => asked.length === 2, 'mute asked');
  assert(
    asked[1].action === 'mute' && asked[1].for === 8 * 3600,
    `mute: ${JSON.stringify(asked[1])}`
  );
  console.log('[e2e-chat-menu] Mute → For 8 hours');

  // Esc closes the menu without asking.
  await page.click('[data-chat="telegram:111"]', { button: 'right' });
  await page.waitForSelector('.msg-context-menu');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.msg-context-menu', { state: 'detached' });
  assert(asked.length === 2, 'Esc asks nothing');

  // Archive.
  await page.click('[data-chat="telegram:111"]', { button: 'right' });
  await page.click('.msg-context-menu [data-action="archive"]');
  await until(() => asked.length === 3, 'archive asked');
  assert(asked[2].action === 'archive', 'archive');
  console.log('[e2e-chat-menu] Archive asks Telegram');

  // Bob is marked: his menu offers Mark as read; opening him unmarks.
  await page.click('[data-chat="telegram:222"]', { button: 'right' });
  await page.waitForSelector('.msg-context-menu');
  assert(
    (await menuItems()).includes('markRead'),
    'a marked chat offers Mark as read'
  );
  await page.keyboard.press('Escape');
  await page.click('[data-chat="telegram:222"]');
  await until(
    () => asked.some((a) => a.chat === '222' && a.action === 'unmark'),
    'opening a marked chat takes the mark off'
  );
  console.log('[e2e-chat-menu] opening a marked chat unmarks it');

  // Delete chat: asked first, in red; "Also delete for" the person.
  await page.click('[data-chat="telegram:111"]', { button: 'right' });
  await page.click('.msg-context-menu [data-action="deleteChat"]');
  await page.waitForSelector('.remove-chat-dialog');
  const question = await page.textContent('.remove-chat-dialog');
  assert(
    question.includes('Fake Alice'),
    `the question names the chat: ${question}`
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector('.remove-chat-dialog', { state: 'detached' });
  assert(removed.length === 0, 'Esc deletes nothing');
  await page.click('[data-chat="telegram:111"]', { button: 'right' });
  await page.click('.msg-context-menu [data-action="deleteChat"]');
  await page.check('.remove-chat-dialog [data-option="revoke"]');
  await page.click('[data-action="confirm-remove"]');
  await until(() => removed.length === 1, 'delete asked');
  assert(
    removed[0].chat === '111' &&
      removed[0].action === 'delete' &&
      removed[0].revoke === true,
    `delete: ${JSON.stringify(removed[0])}`
  );
  await page.waitForSelector('[data-chat="telegram:111"]', {
    state: 'detached',
  });
  console.log(
    '[e2e-chat-menu] Delete chat: asked, for both, gone from the list'
  );

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-chat-menu] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-chat-menu] FAIL (${engine}): ${error.message}`);
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
