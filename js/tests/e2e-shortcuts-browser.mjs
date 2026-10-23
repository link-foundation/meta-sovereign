// Real browser e2e for the keyboard shortcuts (R-Y183), as Telegram Desktop
// has them: Alt+Up / Alt+Down the previous and next chat (also while typing
// in the composer), Alt+Shift+Up / Down the unread ones, Ctrl+Tab, Ctrl+1..9
// the folders, Ctrl+0 Saved Messages, Ctrl+Shift+F the list's search, Ctrl+F
// the search in the chat, Esc empties the search; a plain key never fires
// one; the "Keyboard shortcuts" dialog lists them. Fake chats in a memory
// store; nothing reaches a network or a running app. Not part of `npm test`;
// run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:shortcuts

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const at = Date.now();
const CHATS = [
  ['111', 'Fake Alice', 'user', 60_000],
  ['222', 'Fake Bob', 'user', 120_000],
  ['333', 'Fake Carol', 'user', 180_000],
  ['444', 'Fake Dave', 'user', 240_000],
];
for (const [chat, name, chatType, ago] of CHATS) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType,
    sender: chat,
    senderName: name,
    body: `hello from ${name}`,
    timestamp: new Date(at - ago).toISOString(),
    raw: { id: 1 },
  });
}
// Carol and Dave have something unread.
for (const chat of ['333', '444']) {
  await store.put({
    id: `read:telegram:${chat}`,
    tokens: ['read', 'telegram', chat],
    kind: 'read',
    source: 'telegram',
    chat,
    inboxMaxId: 0,
    unreadMark: 1,
  });
}
// Telegram's folders and the account (id 222 is "me": Bob is Saved Messages).
const folders = [
  { id: 0, all: true },
  { id: 2, title: 'Pals', include: ['333'], exclude: [], pinned: [] },
];

const app = await openChatApp('shortcuts', { store });
const { page, base, until } = app;
await page.route('**/api/telegram/status', (route) =>
  fulfil(route, {
    connected: true,
    kind: 'user',
    account: { username: 'owner', id: '222' },
    offline: false,
    needsLogin: false,
  })
);
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/folders', (route) =>
  fulfil(route, { ok: true, folders })
);

const current = () =>
  page.locator('.chat-item.active').evaluate((e) => e.dataset.chat);
const isCurrent = (chat) => async () =>
  (await page.locator('.chat-item.active').count()) > 0 &&
  (await current()) === `telegram:${chat}`;
const press = async (keys, chat) => {
  await page.keyboard.press(keys);
  await app.until(isCurrent(chat), `${keys} opens ${chat}`, 5000);
};

await app.finish(async () => {
  await page.goto(`${base}/`);
  await until(
    async () => (await page.locator('.chat-item').count()) === 4,
    'the chat list'
  );
  // Chats are listed newest first: Alice, Bob, Carol, Dave.
  await page.locator('[data-chat="telegram:111"]').click();
  await until(isCurrent('111'), 'Alice open');

  await press('Alt+ArrowDown', '222');
  await press('Alt+ArrowDown', '333');
  await press('Alt+ArrowUp', '222');
  await press('Control+Tab', '333');
  await press('Control+Shift+Tab', '222');
  // Wraps round.
  await press('Alt+ArrowUp', '111');
  await press('Alt+ArrowUp', '444');
  // Unread chats only.
  await press('Alt+Shift+ArrowDown', '333');
  await press('Alt+Shift+ArrowDown', '444');
  await press('Alt+Shift+ArrowUp', '333');

  // Also while typing in the composer (Desktop's chords work there).
  await page.locator('textarea').first().click();
  await page.keyboard.type('draft');
  await press('Alt+ArrowUp', '222');
  assert(
    (await page.locator('textarea').first().inputValue()) === '',
    'each chat has its own composer'
  );

  // A plain key never fires a shortcut.
  await page.locator('textarea').first().click();
  await page.keyboard.type('12');
  assert(await isCurrent('222')(), 'plain digits do not switch');
  await page.locator('textarea').first().fill('');

  // Saved Messages (the account's own chat) and the folders.
  await press('Control+0', '222');
  await press('Alt+ArrowDown', '333');
  await page.keyboard.press('Control+2');
  await until(
    async () => (await page.locator('.chat-item').count()) === 1,
    'the Pals folder'
  );
  await page.keyboard.press('Control+1');
  await until(
    async () => (await page.locator('.chat-item').count()) === 4,
    'All chats again'
  );

  // The list's search: Ctrl+Shift+F focuses it, Esc empties it.
  await page.keyboard.press('Control+Shift+F');
  await until(
    async () =>
      (await page.evaluate(() => document.activeElement?.className)) ===
      'chat-search',
    'the list search focused'
  );
  await page.keyboard.type('Dave');
  await until(
    async () => (await page.locator('.chat-item').count()) === 1,
    'filtered by the search'
  );
  await page.keyboard.press('Escape');
  await until(
    async () => (await page.locator('.chat-item').count()) === 4,
    'Esc empties the search'
  );

  // Ctrl+F searches in the chat; Esc closes it.
  await page.keyboard.press('Control+f');
  await until(
    async () => (await page.locator('.chat-find-input').count()) === 1,
    'the chat search bar'
  );
  await page.keyboard.press('Escape');
  await until(
    async () => (await page.locator('.chat-find-input').count()) === 0,
    'Esc closes the chat search'
  );

  // The help dialog lists the shortcuts; Esc closes it.
  await page.locator('[data-action="shortcuts-help"]').click();
  await until(
    async () => (await page.locator('[data-dialog="shortcuts"]').count()) === 1,
    'the shortcuts dialog'
  );
  assert(
    (await page.locator('[data-dialog="shortcuts"] kbd').count()) > 10,
    'the keys are listed'
  );
  await page.keyboard.press('Escape');
  await until(
    async () => (await page.locator('[data-dialog="shortcuts"]').count()) === 0,
    'Esc closes the dialog'
  );
  // Ctrl+/ opens it too, and with a dialog open the chat keys stay quiet.
  await page.keyboard.press('Control+/');
  await until(
    async () => (await page.locator('[data-dialog="shortcuts"]').count()) === 1,
    'Ctrl+/ opens the list'
  );
  const before = await current();
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(300);
  assert((await current()) === before, 'no chat switch under a dialog');
});
