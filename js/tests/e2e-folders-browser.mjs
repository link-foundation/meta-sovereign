// Real browser e2e for chat folders (R-Y103): with Telegram's folders the
// tabs above the chat list are "All chats" and the folders, in
// Telegram's order, each with its unread chats; a folder lists the chats
// its rules take (by kind, by name, not the muted ones), its own pinned
// chat first; the chosen folder is remembered; without folders the
// list's own tabs stay. Fake chats in a memory store, Telegram's folders
// faked in the page, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`;
// run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:folders

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('folders');

const store = createMemoryStore();
const at = Date.now();
const CHATS = [
  ['111', 'Fake Alice', 'user', 60_000],
  ['222', 'Fake Bob', 'user', 120_000],
  ['-333', 'Fake Team', 'group', 180_000],
  ['-444', 'Fake Noisy Group', 'group', 240_000],
  ['-100555', 'Fake News', 'channel', 300_000],
];
for (const [chat, name, chatType, ago] of CHATS) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType,
    sender: chatType === 'channel' ? chat : '9',
    senderName: name,
    body: `hello from ${name}`,
    timestamp: new Date(at - ago).toISOString(),
    raw: { id: 1 },
  });
}
// Alice is a contact; Bob is not.
await store.put({
  id: 'person:telegram:111',
  source: 'telegram',
  user: '111',
  name: 'Fake Alice',
  contact: true,
});
// Unread: Alice and the team; the noisy group is muted.
for (const [chat, extra] of [
  ['111', { unreadMark: 1 }],
  ['-333', { unreadMark: 1 }],
  ['-444', { unreadMark: 1, muteUntil: 2_147_483_647 }],
]) {
  await store.put({
    id: `read:telegram:${chat}`,
    tokens: ['read', 'telegram', chat],
    kind: 'read',
    source: 'telegram',
    chat,
    inboxMaxId: 1,
    ...extra,
  });
}

// Telegram's folders: "Work" (groups, not muted; the channel by name and
// pinned) before "All chats", then "Friends" (contacts).
let folders = [
  {
    id: 2,
    title: 'Work',
    groups: true,
    excludeMuted: true,
    include: [],
    exclude: [],
    pinned: ['-100555'],
  },
  { id: 0, all: true },
  {
    id: 3,
    title: 'Friends',
    contacts: true,
    include: [],
    exclude: [],
    pinned: [],
  },
];

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-folders-'));
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
let asked = 0;
await page.route('**/api/telegram/folders', (route) => {
  asked += 1;
  fulfil(route, { ok: true, folders });
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
const tabs = () =>
  page
    .locator('.chat-filters .chat-filter')
    .evaluateAll((list) =>
      list.map((b) => [
        b.dataset.filter,
        b.querySelector('span')?.textContent ?? '',
        b.querySelector('.chat-filter-unread')?.textContent ?? '',
      ])
    );
const listed = () =>
  page
    .locator('.chat-list [data-chat]')
    .evaluateAll((list) => list.map((row) => row.dataset.chat));

let failed = false;
try {
  await page.goto(`${base}/`);
  await until(
    async () => (await tabs()).some(([key]) => key === 'folder:2'),
    'the folder tabs'
  );
  const shown = await tabs();
  assert(
    JSON.stringify(shown) ===
      JSON.stringify([
        ['folder:2', 'Work', '1'],
        ['all', 'All chats', ''],
        ['folder:3', 'Friends', '1'],
      ]),
    `tabs: ${JSON.stringify(shown)}`
  );
  assert(
    (await listed()).length === CHATS.length,
    `all chats: ${await listed()}`
  );

  await page.locator('[data-filter="folder:2"]').click();
  await until(
    async () => (await listed()).length === 2,
    'the work folder',
    5000
  );
  const work = await listed();
  assert(
    JSON.stringify(work) ===
      JSON.stringify(['telegram:-100555', 'telegram:-333']),
    `work: ${JSON.stringify(work)}`
  );

  await page.locator('[data-filter="folder:3"]').click();
  await until(
    async () => (await listed()).join() === 'telegram:111',
    'the friends folder',
    5000
  );

  // Remembered on the next visit.
  await page.reload();
  await until(
    async () => (await listed()).join() === 'telegram:111',
    'remembered',
    10_000
  );
  assert(
    (await page
      .locator('[data-filter="folder:3"]')
      .getAttribute('aria-selected')) === 'true',
    'the friends tab chosen'
  );

  // The folders gone: the list's own tabs, and every chat.
  folders = [];
  await page.reload();
  await until(
    async () => (await tabs()).some(([key]) => key === 'group'),
    'the own tabs back'
  );
  await until(
    async () => (await listed()).length === CHATS.length,
    'every chat'
  );
  assert(asked >= 3, `asked: ${asked}`);

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-folders] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-folders] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-folders-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
