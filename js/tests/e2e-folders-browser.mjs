// Real browser e2e for chat folders (R-Y103): with Telegram's folders the
// named folders keep Telegram's order; All and Unread sit first and second
// from the chosen edge (end by default). Selected tabs stay visible. A folder lists the chats
// its rules take (by kind, by name, not the muted ones), its own pinned
// chat first; the chosen folder is remembered; without folders the
// list's own tabs stay. Fake chats in a memory store, Telegram's folders
// faked in the page, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`;
// run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:folders

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

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
// pinned) before the remote default folder, then "Friends" (contacts).
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
  {
    id: 4,
    title: 'Unread',
    excludeRead: true,
    contacts: true,
    nonContacts: true,
    groups: true,
    broadcasts: true,
    bots: true,
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

const { base, page, until, finish } = await openChatApp('folders', { store });

let asked = 0;
await page.route('**/api/telegram/folders', (route) => {
  asked += 1;
  fulfil(route, { ok: true, folders });
});

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

const allVisible = () =>
  page.locator('.chat-filters').evaluate((strip) => {
    const all = strip.querySelector('[data-filter="all"]');
    const bounds = strip.getBoundingClientRect();
    const tab = all?.getBoundingClientRect();
    return tab && tab.left >= bounds.left - 1 && tab.right <= bounds.right + 1;
  });

const placementSteps = async () => {
  // A real overflow: the default All is far beyond the initial viewport.
  await page.locator('[data-filter="all"]').click();
  folders = [
    ...folders,
    ...Array.from({ length: 12 }, (_, i) => ({
      id: i + 10,
      title: `Folder ${i + 10}`,
      groups: true,
    })),
  ];
  await page.reload();
  await until(async () => (await tabs()).length === 16, 'many folders loaded');
  assert(
    (await tabs())
      .slice(-2)
      .map((tab) => tab[0])
      .join() === 'folder:4,all',
    'Unread is second from the end after All'
  );
  await until(allVisible, 'All revealed on startup');
  assert(
    await page.locator('.chat-filters').evaluate((node) => node.scrollLeft > 0),
    'overflow strip scrolled to All'
  );

  // Content before All can grow after load (badges, fonts, accessibility zoom).
  const named = page.locator('.chat-filters [data-folder-tab]');
  await named.evaluateAll((tabs) =>
    tabs.forEach((tab) => {
      tab.style.paddingInline = '2rem';
    })
  );
  await until(allVisible, 'All revealed after preceding tabs grow');
  await named.evaluateAll((tabs) =>
    tabs.forEach((tab) => {
      tab.style.paddingInline = '';
    })
  );

  // A narrower column keeps the selected All visible without moving the page.
  const before = await page.evaluate(() => globalThis.scrollY);
  const divider = page.locator('[data-panel-divider="chats"]');
  await divider.focus();
  await divider.press('Home');
  await until(allVisible, 'All revealed after resizing');
  assert(
    (await page.evaluate(() => globalThis.scrollY)) === before,
    'revealing a tab leaves vertical page scroll unchanged'
  );

  // Settings affects only this browser, persists across reloads and is reversible.
  await page.locator('button[data-view="settings"]').click();
  const first = page.locator('[data-action="folder-special-position"]');
  assert(
    (await first.inputValue()) === 'end',
    'special categories start at the end'
  );
  await first.selectOption('start');
  await page.locator('button[data-view="chat"]').click();
  await until(
    async () => (await tabs()).length === 16 && (await tabs())[0][0] === 'all',
    'All first by preference'
  );
  assert(
    (await tabs())[1][0] === 'folder:4',
    'Unread follows All at the start'
  );
  await until(allVisible, 'All first visible');
  await page.reload();
  await until(
    async () => (await tabs()).length === 16 && (await tabs())[0][0] === 'all',
    'first placement remembered'
  );
  assert(
    (await tabs())[1][0] === 'folder:4',
    'Unread remains second after reload'
  );
  await until(allVisible, 'All first visible after reload');
  await page.locator('button[data-view="settings"]').click();
  assert(
    (await first.inputValue()) === 'start',
    'settings remembers start placement'
  );
  await first.selectOption('end');
  await page.locator('button[data-view="chat"]').click();
  await until(
    async () =>
      (await tabs()).length === 16 && (await tabs()).at(-1)[0] === 'all',
    'All back at the end'
  );
  assert(
    (await tabs()).at(-2)[0] === 'folder:4',
    'Unread returns beside All at the end'
  );
  await until(allVisible, 'All last visible after changing preference');

  // A remembered named folder is revealed too, rather than resetting to All.
  await page.locator('[data-filter="folder:2"]').click();
  await page.reload();
  await until(
    async () =>
      (await page
        .locator('[data-filter="folder:2"]')
        .getAttribute('aria-selected')) === 'true',
    'remembered named folder selected'
  );
  assert(
    await page.locator('[data-filter="folder:2"]').evaluate((tab) => {
      const bounds = tab.parentElement.getBoundingClientRect();
      const rect = tab.getBoundingClientRect();
      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
    }),
    'remembered folder visible'
  );
};

await finish(async () => {
  await page.goto(`${base}/`);
  await until(
    async () => (await tabs()).some(([key]) => key === 'folder:2'),
    'the folder tabs'
  );
  const shown = await tabs();
  assert(
    (await page
      .locator('[data-filter="folder:4"]')
      .getAttribute('data-folder-tab')) === null,
    'special Unread tab is fixed beside All'
  );
  assert(
    JSON.stringify(shown) ===
      JSON.stringify([
        ['folder:2', 'Work', '1'],
        ['folder:3', 'Friends', '1'],
        ['folder:4', 'Unread', '2'],
        ['all', 'All', ''],
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

  const kind = (name) => page.locator(`[data-kind-filter="${name}"]`);
  await kind('group').click();
  await until(
    async () => (await listed()).join() === 'telegram:-333',
    'groups within Work'
  );
  assert(
    (await page
      .locator('[data-filter="folder:2"]')
      .getAttribute('aria-selected')) === 'true',
    'type filter keeps folder selected'
  );
  await kind('channel').click();
  await until(
    async () => (await listed()).join() === 'telegram:-100555',
    'channels within Work'
  );
  await page.locator('[data-filter="all"]').click();
  await until(
    async () => (await listed()).join() === 'telegram:-100555',
    'channel type also applies to All chats'
  );
  await kind('private').click();
  await until(
    async () => (await listed()).length === 2,
    'private chats within All chats'
  );
  await page.locator('[data-filter="folder:2"]').click();
  await until(
    async () => (await listed()).length === 0,
    'private type excludes groups and channels inside folder'
  );
  await kind('all').click();

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

  await placementSteps();

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
});
