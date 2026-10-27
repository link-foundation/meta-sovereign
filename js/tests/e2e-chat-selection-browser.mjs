// Real browser e2e for Telegram Desktop's selection and menu (R-Y68).
// Fake messages in a memory store, a server on a free port, headless
// Chromium; nothing reaches Telegram or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:selection

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

// E2E_BROWSER=webkit runs it in Safari's engine.
const { engine, browserType } = await browserOf('chat-selection');
const CHAT = '-1001234';
const idOf = (n) => `msg:telegram:${CHAT}:${n}`;

const store = createMemoryStore();
const now = Date.now();
const names = ['Alice', 'Bob', 'Carol'];
for (let i = 1; i <= 14; i++) {
  const mine = i % 4 === 0;
  await store.put({
    id: idOf(i),
    source: 'telegram',
    chat: CHAT,
    chatName: 'Fake Group',
    chatType: 'supergroup',
    sender: mine ? 'me' : `u${i % 3}`,
    senderName: mine ? 'me' : names[i % 3],
    body: `fake message number ${i}`,
    timestamp: new Date(now - (20 - i) * 60_000).toISOString(),
    raw: { id: i },
  });
}
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-selection-'));
const handle = await startServer({
  localUi: true,
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
const context = await browser.newContext({
  viewport: { width: 1100, height: 800 },
});
// WebKit knows no clipboard permissions (it allows writes on a click).
if (engine === 'chromium') {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: base,
  });
}
const page = await context.newPage();
// This exercises a connected chat's menus. Disconnected cached chats
// intentionally show a connection guide (covered by the offline tests).
await page.route('**/api/telegram/status', (route) =>
  route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ connected: true, kind: 'user', offline: false }),
  })
);
if (engine !== 'chromium') {
  await page.addInitScript(() => {
    const clipboard = globalThis.navigator.clipboard;
    const write = clipboard?.writeText?.bind(clipboard);
    if (clipboard) {
      clipboard.writeText = (text) => {
        globalThis.__copied = text;
        return write ? write(text).catch(() => {}) : Promise.resolve();
      };
    }
  });
}
const errors = [];
await page.route('**/api/telegram/history', (route) =>
  route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ written: 0, cached: true, complete: true }),
  })
);
page.on('pageerror', (e) => errors.push(String(e)));

// The message's text, scrolled into view.
const bodyBox = async (n) => {
  const body = page.locator(`[data-row="${idOf(n)}"] .bubble-body`);
  await body.scrollIntoViewIfNeeded();
  return body.boundingBox();
};
const at = async (n, dx = 0) => {
  const b = await bodyBox(n);
  return [b.x + 10 + dx, b.y + b.height / 2];
};
const top = () =>
  page
    .locator('.selection-top')
    .innerText()
    .then((s) => s.replace(/\s+/g, ' ').trim())
    .catch(() => null);
const menu = () =>
  page.$$eval('[role=menu] [data-action]', (n) =>
    n.map((e) => e.dataset.action)
  );
const rightClick = async (n) => {
  await page.mouse.click(...(await at(n, 40)), { button: 'right' });
  await page.waitForSelector('[role=menu] [data-action]', { timeout: 3000 });
};
const pause = () => page.waitForTimeout(200);

let failed = false;
try {
  await page.goto(`${base}/#chat=telegram:${CHAT}`);
  await page.waitForSelector('[data-row]', { timeout: 15000 });
  await page.waitForTimeout(500);

  // One message's menu, in Desktop's order.
  await rightClick(2);
  assert(
    JSON.stringify(await menu()) ===
      JSON.stringify([
        'reply',
        'copy',
        'copyLink',
        'translate',
        'forward',
        'delete',
        'report',
        'select',
      ]),
    `single menu: ${await menu()}`
  );
  await page.keyboard.press('Escape');
  await pause();
  // Safari selects the word under a right-click; Telegram does not.
  assert(
    (await page.evaluate(() => String(globalThis.getSelection()))) === '',
    'no word left selected by the right-click'
  );

  // Beside the bubble the row is the message's too.
  const row2 = await page.locator(`[data-row="${idOf(2)}"]`).boundingBox();
  const bubble2 = await bodyBox(2);
  await page.mouse.click(
    (bubble2.x + bubble2.width + row2.x + row2.width) / 2,
    bubble2.y + bubble2.height / 2,
    { button: 'right' }
  );
  await page.waitForSelector('[role=menu] [data-action]', { timeout: 3000 });
  assert(
    (await menu())[0] === 'reply',
    `menu beside the bubble: ${await menu()}`
  );
  await page.keyboard.press('Escape');
  await pause();

  // A drag from message to message selects them all.
  const [x3, y3] = await at(3, 60);
  const [, y6] = await at(6);
  await page.mouse.move(x3, y3);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) {
    await page.mouse.move(x3, y3 + ((y6 - y3) * k) / 10);
  }
  await page.mouse.up();
  await pause();
  assert((await top()) === 'FORWARD 4 DELETE 4 CANCEL', `drag: ${await top()}`);

  // A selected message's menu; Esc closes only the menu.
  await rightClick(4);
  assert(
    JSON.stringify(await menu()) ===
      JSON.stringify([
        'reply',
        'copySelectedItems',
        'forwardSelected',
        'deleteSelected',
        'clearSelection',
      ]),
    `selected menu: ${await menu()}`
  );
  await page.keyboard.press('Escape');
  await pause();
  assert((await top()) === 'FORWARD 4 DELETE 4 CANCEL', 'Esc kept selection');

  // Another message's menu: Select up to this message.
  await rightClick(9);
  assert(
    JSON.stringify(await menu()) ===
      JSON.stringify(['reply', 'select', 'selectBulk']),
    `other menu: ${await menu()}`
  );
  await page.click('[role=menu] [data-action="selectBulk"]');
  await pause();
  assert((await top()) === 'FORWARD 7 DELETE 7 CANCEL', `bulk: ${await top()}`);

  // A click takes one away.
  await page.mouse.click(...(await at(5, 40)));
  await pause();
  assert(
    (await top()) === 'FORWARD 6 DELETE 6 CANCEL',
    `click: ${await top()}`
  );

  // Copy Selected as Text, as Desktop copies.
  await rightClick(7);
  await page.click('[role=menu] [data-action="copySelectedItems"]');
  await pause();
  // WebKit lets no script read the clipboard: what was written is kept.
  const copied = await page.evaluate(
    (real) =>
      real ? globalThis.navigator.clipboard.readText() : globalThis.__copied,
    engine === 'chromium'
  );
  const lines = copied.split('\n');
  assert(lines.length === 6, `copied lines: ${lines.length}`);
  assert(
    /^\[.+\] Alice: fake message number 3$/.test(lines[0]),
    `copied: ${lines[0]}`
  );
  assert(/\] You: fake message number 4$/.test(lines[1]), `own: ${lines[1]}`);

  // Delete n asks; Esc closes the question and keeps the selection.
  await page.click('.selection-top [data-action="delete"]');
  await pause();
  assert(
    /Delete 6 messages\?/.test(await page.locator('[role=dialog]').innerText()),
    'delete question'
  );
  await page.keyboard.press('Escape');
  await pause();
  assert((await page.locator('[role=dialog]').count()) === 0, 'dialog closed');
  assert((await top()) === 'FORWARD 6 DELETE 6 CANCEL', 'kept after dialog');

  // Esc ends selecting.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert((await page.locator('.selection-top').count()) === 0, 'Esc clears');

  // Text selection within a message; past it, messages.
  const [tx, ty] = await at(6, -5);
  await page.mouse.move(tx, ty);
  await page.mouse.down();
  await page.mouse.move(tx + 80, ty, { steps: 5 });
  assert(
    (await page.evaluate(() => globalThis.getSelection().toString().length)) >
      0,
    'text selects inside one message'
  );
  assert((await page.locator('.selection-top').count()) === 0, 'no rows yet');
  const [, ty7] = await at(7);
  await page.mouse.move(tx + 60, ty7, { steps: 8 });
  await page.mouse.up();
  await pause();
  assert(
    (await top()) === 'FORWARD 2 DELETE 2 REPORT 2 CANCEL',
    `text→rows: ${await top()}`
  );
  assert(
    (await page.evaluate(() => globalThis.getSelection().toString().length)) ===
      0,
    'text selection dropped'
  );
  await page.keyboard.press('Escape');
  await pause();
  // The entire line belongs to its message, even outside the centered column.
  await page.setViewportSize({ width: 2200, height: 1000 });
  const outside = async (n) => {
    const rect = await bodyBox(n);
    const scroll = await page.locator('.chat-scroll').boundingBox();
    return [scroll.x + scroll.width - 12, rect.y + rect.height / 2];
  };
  await page.mouse.click(...(await outside(3)));
  await pause();
  assert(
    (await top())?.startsWith('FORWARD 1 DELETE 1'),
    'blank full-line click starts selection'
  );
  await page.mouse.click(...(await outside(4)));
  await pause();
  assert(
    (await top())?.startsWith('FORWARD 2 DELETE 2'),
    'blank full-line click adds outgoing messages'
  );
  await page.mouse.click(...(await outside(3)));
  await pause();
  assert(
    (await top())?.startsWith('FORWARD 1 DELETE 1'),
    'blank full-line click toggles selection'
  );
  await page.keyboard.press('Escape');
  await pause();
  await page.mouse.click(...(await outside(4)), { button: 'right' });
  await page.waitForSelector('[role=menu] [data-action]', { timeout: 3000 });
  assert(
    (await menu()).includes('select'),
    'message menu opens outside the centered column'
  );
  await page.click('[role=menu] [data-action="select"]');
  await pause();
  assert(
    (await top())?.startsWith('FORWARD 1 DELETE 1'),
    'menu Select selects the full row'
  );
  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log('[e2e-chat-selection] OK');
} catch (error) {
  failed = true;
  console.error('[e2e-chat-selection] FAIL:', error.stack ?? error.message);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-chat-selection-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
