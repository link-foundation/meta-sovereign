// Real browser e2e for Telegram Desktop's selection and menu (R-Y68).
// Fake messages in a memory store, a server on a free port, headless
// Chromium; nothing reaches Telegram or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:selection

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';
import { assertFilledContrast, pixelsAt } from './helpers/e2e-colors.mjs';

// E2E_BROWSER=webkit runs it in Safari's engine.
const { engine, browserType } = await browserOf('chat-selection');
const CHAT = '-1001234';
const idOf = (n) => `msg:telegram:${CHAT}:${n}`;

const store = createMemoryStore();
const now = Date.now();
const names = ['Alice', 'Bob', 'Carol'];
for (let i = 1; i <= 14; i++) {
  const mine = i % 4 === 0 || i >= 12;
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
if (process.env.CI_TUTORIAL_DEBUG === '1') {
  const { probeInput } =
    await import('../../experiments/issue50-webkit-input.mjs');
  await probeInput(browser);
}
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
const inputs = [];
if (process.env.CI_TUTORIAL_DEBUG === '1') {
  page.on('console', (message) => {
    if (message.text().startsWith('[ms-debug]')) {
      console.log(message.text());
    }
  });
  await page.exposeFunction('recordSelectionInput', (input) => {
    inputs.push(input);
    if (inputs.length > 40) {
      inputs.shift();
    }
  });
}
await page.addInitScript(() => {
  globalThis.metaSovereignDebug =
    typeof globalThis.recordSelectionInput === 'function';
  globalThis.addEventListener(
    'click',
    (event) => {
      globalThis.recordSelectionInput?.({
        type: 'window-click',
        x: event.clientX,
        y: event.clientY,
      });
    },
    true
  );
  for (const type of ['mousedown', 'mouseup', 'click']) {
    document.addEventListener(
      type,
      (event) => {
        globalThis.recordSelectionInput?.({
          type,
          x: event.clientX,
          y: event.clientY,
          target: event.target?.className,
          row: event.target?.closest?.('[data-row]')?.dataset.row,
          at: globalThis.performance.now(),
        });
      },
      true
    );
  }
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.setItem('metaSovereignSkin', 't3');
});
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
  // A floating composer can cover a DOM-visible row. Scroll that target
  // into the unobscured part of the list before using pointer coordinates.
  const rect = await body.boundingBox();
  const composer = await page.locator('.chat-composer').boundingBox();
  if (rect.y + rect.height > composer.y - 8) {
    await body.evaluate((node) =>
      node.scrollIntoView({ block: 'center', behavior: 'instant' })
    );
  }
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
    // macOS WebKit can reserve a native scrollbar inside the border box.
    // Click the blank content beside the column, clear of that scrollbar.
    const right = await page.locator('.chat-scroll').evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.left + node.clientLeft + node.clientWidth;
    });
    return [right - 12, rect.y + rect.height / 2];
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
  const selectedColors = await page
    .locator('.bubble-check.is-checked')
    .first()
    .evaluate((node) => {
      const style = globalThis.getComputedStyle(node);
      return [style.backgroundColor, style.color];
    });
  assert(
    selectedColors.join() === 'rgb(255, 255, 255),rgb(0, 0, 0)',
    'selected checks are monochrome in the default dark theme'
  );
  await page.keyboard.press('Escape');
  await pause();

  // Incoming and outgoing bubbles keep the same geometry in both modes.
  for (const width of [2200, 1100, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await bodyBox(12);
    await pause();
    const bubble = page.locator(`[data-row="${idOf(12)}"] > .bubble`);
    const incoming = page.locator(`[data-row="${idOf(11)}"] > .bubble`);
    const before = await bubble.boundingBox();
    const incomingBefore = await incoming.boundingBox();
    const headerBefore = await page.locator('.chat-header').boundingBox();
    const scrollBefore = await page
      .locator('.chat-scroll')
      .evaluate((node) => ({ top: node.scrollTop, height: node.scrollHeight }));
    const scrollBox = await page.locator('.chat-scroll').boundingBox();
    await page.mouse.click(
      scrollBox.x + scrollBox.width - 12,
      before.y + before.height / 2
    );
    await pause();
    const during = await bubble.boundingBox();
    const incomingDuring = await incoming.boundingBox();
    const headerDuring = await page.locator('.chat-header').boundingBox();
    const scrollDuring = await page
      .locator('.chat-scroll')
      .evaluate((node) => ({ top: node.scrollTop, height: node.scrollHeight }));
    for (const key of ['x', 'y', 'width', 'height']) {
      assert(
        Math.abs(before[key] - during[key]) <= 1,
        `${width}: selection keeps bubble ${key}: ${JSON.stringify({ before, during, headerBefore, headerDuring, scrollBefore, scrollDuring })}`
      );
      assert(
        Math.abs(incomingBefore[key] - incomingDuring[key]) <= 1,
        `${width}: selection keeps incoming bubble ${key}`
      );
    }
    const column = await page.locator('.chat-column').boundingBox();
    const check = await page.locator('.bubble-check.is-checked').boundingBox();
    const scroll = await page.locator('.chat-scroll').boundingBox();
    assert(
      check.x > column.x + column.width,
      `${width}: check outside the message column`
    );
    assert(
      check.x + check.width <= scroll.x + scroll.width,
      `${width}: check fits the chat`
    );
    const second = await page.locator(`[data-row="${idOf(13)}"]`).boundingBox();
    await page.mouse.click(
      scrollBox.x + scrollBox.width - 12,
      second.y + second.height / 2
    );
    await pause();
    const row12 = await page.locator(`[data-row="${idOf(12)}"]`).boundingBox();
    const row13 = await page.locator(`[data-row="${idOf(13)}"]`).boundingBox();
    const y = row12.y + row12.height / 2;
    const pixels = await pixelsAt(page, [
      [scroll.x + 8, y],
      [row12.x + 4, y],
      [scroll.x + 8, row12.y + row12.height - 1],
      [scroll.x + 8, row13.y - 1],
      [scroll.x + 8, row13.y + 1],
      ...Array.from(
        { length: Math.ceil(row13.y - row12.y - row12.height) + 4 },
        (_, i) => [scroll.x + 8, Math.floor(row12.y + row12.height) - 2 + i]
      ),
    ]);
    assert(
      pixels.every((pixel) =>
        pixel.every((value, i) => Math.abs(value - pixels[0][i]) <= 1)
      ),
      `${width}: selection is uniform across the row/gutters and never doubles at seams: ${JSON.stringify(pixels)}`
    );
    if (process.env.E2E_SHOT) {
      await page.screenshot({
        path:
          width === 2200
            ? process.env.E2E_SHOT
            : process.env.E2E_SHOT.replace(/\.png$/, `-${width}.png`),
      });
    }
    await page.keyboard.press('Escape');
    await pause();
    const after = await bubble.boundingBox();
    const scrollAfter = await page
      .locator('.chat-scroll')
      .evaluate((node) => node.scrollTop);
    const headerAfter = await page.locator('.chat-header').boundingBox();
    for (const key of ['x', 'y', 'width', 'height']) {
      assert(
        Math.abs(before[key] - after[key]) <= 1,
        `${width}: clearing keeps bubble ${key}: ${JSON.stringify({ before, during, after, headerDuring, headerAfter, scrollBefore, scrollDuring, scrollAfter })}`
      );
    }
  }
  await assertFilledContrast(page);
  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log('[e2e-chat-selection] OK');
} catch (error) {
  failed = true;
  console.error('[e2e-chat-selection] FAIL:', error.stack ?? error.message);
  console.error(
    '[e2e-chat-selection] geometry:',
    await page.evaluate(() => {
      const node = document.querySelector('.chat-scroll');
      return {
        viewport: [globalThis.innerWidth, globalThis.innerHeight],
        screen: [globalThis.screen.width, globalThis.screen.height],
        column: document
          .querySelector('.chat-column')
          ?.getBoundingClientRect()
          .toJSON(),
        rows: [...document.querySelectorAll('[data-row]')]
          .slice(0, 4)
          .map((row) => ({
            id: row.dataset.row,
            box: row.getBoundingClientRect().toJSON(),
          })),
        scroll: node?.getBoundingClientRect().toJSON(),
        clientWidth: node?.clientWidth,
        textSelection: globalThis.getSelection()?.toString(),
      };
    })
  );
  console.error('[e2e-chat-selection] inputs:', JSON.stringify(inputs));
  const artifactDir = process.env.E2E_ARTIFACT_DIR || os.tmpdir();
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDir, `ms-chat-selection-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
