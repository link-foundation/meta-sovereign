// Real browser e2e for the emoji panel (R-Y104): the smiley by the
// message box opens it; a pick goes in at the caret, the panel stays and
// the pick leads the recent ones (kept on the next visit); the bar jumps
// to a category; a search finds by name; Escape and a click elsewhere
// close it; the message goes with the emoji. A fake chat in a memory
// store, a fake sender that records, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of `npm
// test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:emoji

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('emoji');

const CHAT = '555';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHAT}:1`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Dave',
  body: 'how was the trip?',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const sent = [];
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-emoji-'));
const handle = await startServer({
  localUi: true,
  port: 0,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
  automations: {
    scheduler: false,
    setTyping: async () => ({ supported: false }),
    send: async (draft) => {
      sent.push(draft);
      return { via: 'fake' };
    },
  },
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

const open = async () => {
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  const box = page.locator('.chat-composer textarea');
  await box.waitFor({ timeout: 15000 });
  return box;
};

let failed = false;
try {
  await page.goto(`${base}/`);
  let box = await open();
  const panel = page.locator('.emoji-panel');
  const button = page.locator('[data-action="emoji"]');
  assert((await panel.count()) === 0, 'closed at first');

  // A pick at the caret: "great trip" → "great 🌍 trip".
  await box.fill('great trip');
  await box.evaluate((area) => area.setSelectionRange(6, 6));
  await button.click();
  await panel.waitFor({ timeout: 5000 });
  const first = await panel
    .locator('[data-category="recent"] .emoji-cell')
    .evaluateAll((cells) => cells.map((c) => c.dataset.emoji));
  assert(first.length > 10, `recent at first: ${first.length}`);
  await panel.locator('[data-jump="travel"]').click();
  await until(
    async () =>
      (await panel.locator('.emoji-cat.active').getAttribute('data-jump')) ===
      'travel',
    'the bar follows the jump'
  );
  await panel.locator('.emoji-cell[data-emoji="🌍"]').first().click();
  await until(
    async () => (await box.inputValue()) === 'great 🌍trip',
    `at the caret: ${await box.inputValue()}`
  );
  assert((await panel.count()) === 1, 'the panel stays');
  // The next pick goes after the first.
  await panel.locator('.emoji-cell[data-emoji="✈️"]').first().click();
  await until(
    async () => (await box.inputValue()) === 'great 🌍✈️trip',
    `after it: ${await box.inputValue()}`
  );

  // Found by name.
  await panel.locator('[data-field="emoji-search"]').fill('red heart');
  await until(
    async () =>
      (await panel.locator('[data-category="found"] .emoji-cell').count()) ===
      1,
    'found'
  );
  await panel.locator('[data-field="emoji-search"]').fill('zzzz qqqq');
  await panel.locator('.emoji-none').waitFor({ timeout: 5000 });

  // Escape closes; a click elsewhere closes.
  await page.keyboard.press('Escape');
  await until(async () => (await panel.count()) === 0, 'Escape closes');
  await button.click();
  await panel.waitFor({ timeout: 5000 });
  await page.locator('.chat-scroll').click({ position: { x: 20, y: 20 } });
  await until(async () => (await panel.count()) === 0, 'outside closes');

  // Sent as typed.
  await box.press('Enter');
  await until(() => sent.length === 1, 'sent');
  assert(sent[0].text === 'great 🌍✈️trip', `sent: ${sent[0].text}`);

  // The recent ones lead with the latest picks, next time too.
  await page.reload();
  box = await open();
  await button.click();
  await panel.waitFor({ timeout: 5000 });
  const recent = await panel
    .locator('[data-category="recent"] .emoji-cell')
    .evaluateAll((cells) => cells.map((c) => c.dataset.emoji));
  assert(
    recent[0] === '✈️' && recent[1] === '🌍',
    `recent: ${recent.slice(0, 3)}`
  );

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-emoji] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-emoji] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-emoji-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
