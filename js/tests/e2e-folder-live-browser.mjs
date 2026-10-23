// Real browser e2e for folders that follow other devices and can be
// dragged (R-Y172), as Telegram Desktop does: a folder made, renamed or
// reordered on another device (the server keeps a `folders-live:telegram`
// link when Telegram says updateDialogFilter, updateDialogFilters or
// updateDialogFilterOrder) shows in the tabs and in Settings → Folders with
// no reload; the folder tabs and the Settings list are reordered by
// dragging (Escape puts a lifted one back) and saved as one order. Telegram's
// answers faked in the page, fake chats in a memory store, a server on a
// free port, a headless browser; nothing reaches a network or a running
// app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:folder-live

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const at = Date.now();
for (const [chat, name, chatType, ago] of [
  ['111', 'Fake Alice', 'user', 60_000],
  ['-333', 'Fake Team', 'group', 180_000],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType,
    sender: '9',
    senderName: name,
    body: `hello from ${name}`,
    timestamp: new Date(at - ago).toISOString(),
    raw: { id: 1 },
  });
}

const { base, page, until, finish } = await openChatApp('folder-live', {
  store,
});

const blank = {
  emoticon: null,
  contacts: false,
  nonContacts: false,
  groups: true,
  broadcasts: false,
  bots: false,
  excludeMuted: false,
  excludeRead: false,
  excludeArchived: false,
  include: [],
  exclude: [],
  pinned: [],
};
let folders = [{ id: 2, title: 'Work', ...blank }];
const orders = [];
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/folders', (route) =>
  fulfil(route, { ok: true, folders: [{ id: 0, all: true }, ...folders] })
);
await page.route('**/api/telegram/folders-suggested', (route) =>
  fulfil(route, { ok: true, suggested: [] })
);
await page.route('**/api/telegram/folders-reorder', (route) => {
  const body = route.request().postDataJSON();
  orders.push(body.order);
  const named = body.order.filter((id) => id !== 0);
  folders = named.map((id) => folders.find((f) => f.id === id));
  return fulfil(route, { ok: true });
});

let rev = 0;
// What the server does when Telegram says the folders changed elsewhere.
const elsewhere = async (change) => {
  rev += 1;
  await store.put({
    id: 'folders-live:telegram',
    tokens: ['folders-live', 'telegram'],
    kind: 'folders-live',
    source: 'telegram',
    rev,
    change,
    folder: 0,
    at: new Date().toISOString(),
  });
};

const tabs = () =>
  page
    .locator('.chat-filters .chat-filter')
    .evaluateAll((list) =>
      list.map((b) => [b.dataset.filter, b.querySelector('span')?.textContent])
    );
const tabKeys = async () => (await tabs()).map(([key]) => key).join();
const rowIds = () =>
  page
    .locator('.folder-list [data-folder-id]')
    .evaluateAll((list) => list.map((r) => r.dataset.folderId).join());

// The pointer dragged from the middle of one box to the middle of another.
const drag = async (from, to, { cancel = false } = {}) => {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      a.x + a.width / 2 + ((b.x + b.width / 2 - a.x - a.width / 2) * i) / steps,
      a.y +
        a.height / 2 +
        ((b.y + b.height / 2 - a.y - a.height / 2) * i) / steps
    );
  }
  if (cancel) {
    await page.keyboard.press('Escape');
  }
  await page.mouse.up();
};

const liveSteps = async () => {
  await page.goto(`${base}/`);
  await until(async () => (await tabKeys()) === 'all,folder:2', 'first tabs');
  await page.evaluate(() => {
    globalThis.__same = true;
  });

  await page.waitForTimeout(800); // the event stream is open
  // Another device adds a folder: the tab appears, no reload.
  folders = [...folders, { id: 3, title: 'News', ...blank }];
  await elsewhere('filter');
  await until(
    async () => (await tabKeys()) === 'all,folder:2,folder:3',
    'the folder from another device as a tab'
  );
  assert(
    await page.evaluate(() => globalThis.__same === true),
    'the page was not reloaded'
  );

  // Settings → Folders follows too: a rename and a new order.
  await page.locator('button[data-view="settings"]').click();
  await until(async () => (await rowIds()) === '2,3', 'the list');
  folders = [
    { id: 3, title: 'Daily', ...blank },
    { id: 2, title: 'Work', ...blank },
  ];
  await elsewhere('order');
  await until(async () => (await rowIds()) === '3,2', 'the new order listed');
  assert(
    (await page.locator('[data-folder-id="3"]').textContent()).includes(
      'Daily'
    ),
    'the rename listed'
  );
  folders = folders.filter((f) => f.id !== 2);
  await elsewhere('filters');
  await until(async () => (await rowIds()) === '3', 'a deleted folder gone');
  folders = [
    { id: 3, title: 'Daily', ...blank },
    { id: 2, title: 'Work', ...blank },
  ];
  await elsewhere('filters');
  await until(async () => (await rowIds()) === '3,2', 'it is back');

  // The tabs on the chat screen followed meanwhile.
  await page.locator('button[data-view="chat"]').click();
  await until(
    async () => (await tabKeys()) === 'all,folder:3,folder:2',
    'the tabs in the new order'
  );
};

const dragSteps = async () => {
  // Drag the first folder tab over the second: one new order is saved.
  const tab = (id) => page.locator(`[data-filter="folder:${id}"]`);
  await drag(tab(3), tab(2), { cancel: true });
  await page.waitForTimeout(300);
  assert(orders.length === 0, 'Escape puts a lifted tab back');
  assert((await tabKeys()) === 'all,folder:3,folder:2', 'nothing moved');
  await drag(tab(3), tab(2));
  await until(async () => orders.length === 1, 'the order saved');
  assert(
    JSON.stringify(orders[0]) === JSON.stringify([0, 2, 3]),
    `the order: ${JSON.stringify(orders[0])}`
  );
  await until(
    async () => (await tabKeys()) === 'all,folder:2,folder:3',
    'the tabs follow the drag'
  );
  assert(
    (await page.locator('.chat-filter.active').getAttribute('data-filter')) ===
      'all',
    'the drop chose no tab'
  );

  // Settings → Folders: dragging a row down (the buttons still work).
  await page.locator('button[data-view="settings"]').click();
  await until(async () => (await rowIds()) === '2,3', 'the list');
  const name = (id) =>
    page.locator(`[data-folder-id="${id}"] .folder-row-name`);
  // The list is below the fold: both rows must be on screen to drag.
  await name(2).evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await drag(name(2), name(3));
  await until(async () => orders.length === 2, 'the list order saved');
  assert(
    JSON.stringify(orders[1]) === JSON.stringify([0, 3, 2]),
    `the list order: ${JSON.stringify(orders[1])}`
  );
  await until(async () => (await rowIds()) === '3,2', 'the list follows');
  await page.locator('[data-folder-id="2"] [data-action="folder-up"]').click();
  await until(async () => orders.length === 3, 'Move up still works');
  assert(
    JSON.stringify(orders[2]) === JSON.stringify([0, 2, 3]),
    `move up: ${JSON.stringify(orders[2])}`
  );
};

await finish(async () => {
  await liveSteps();
  await dragSteps();
});
