// Real browser e2e for the emoji skin tones (R-Y114): emoji that take a
// tone carry a mark; a right click or a held press opens the six
// variants; a pick goes in at the caret and the tone is remembered (in
// the panel, in search, next visit); recent keeps the exact variant;
// Escape and a click elsewhere close the popover. A fake chat in a memory
// store, a fake sender that records, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of `npm
// test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:emoji-tones

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('emoji-tones');

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
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-emoji-tones-'));
const handle = await startServer({
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
  const pop = page.locator('[data-emoji-tones]');
  const thumb = panel.locator('[data-category="people"] [data-tonable="👍"]');
  await box.fill('ok ');
  await button.click();
  await panel.waitFor({ timeout: 5000 });
  assert((await panel.locator('[data-tonable]').count()) > 50, 'marked');
  assert(
    (await panel.locator('[data-emoji="😀"][data-tonable]').count()) === 0,
    'a face has no mark'
  );

  // Right click: six variants, default first.
  await thumb.scrollIntoViewIfNeeded();
  await thumb.click({ button: 'right' });
  await pop.waitFor({ timeout: 5000 });
  const variants = await pop
    .locator('[data-tone]')
    .evaluateAll((b) => b.map((x) => x.dataset.emoji));
  assert(
    variants.join('') === '👍👍🏻👍🏼👍🏽👍🏾👍🏿',
    `variants: ${variants.join(' ')}`
  );
  // Escape closes the popover only.
  await page.keyboard.press('Escape');
  await until(async () => (await pop.count()) === 0, 'Escape closes tones');
  assert((await panel.count()) === 1, 'the panel stays');

  // A click outside it (inside the panel) closes it.
  await thumb.click({ button: 'right' });
  await pop.waitFor({ timeout: 5000 });
  await panel.locator('[data-field="emoji-search"]').click();
  await until(async () => (await pop.count()) === 0, 'outside closes tones');
  assert((await box.inputValue()) === 'ok ', 'nothing inserted');

  // A held press (mouse) opens it too, and the release picks nothing.
  const at = await thumb.boundingBox();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await pop.waitFor({ timeout: 5000 });
  await page.mouse.up();
  assert((await box.inputValue()) === 'ok ', 'a hold is no pick');
  await page.keyboard.press('Escape');
  await until(async () => (await pop.count()) === 0, 'closed again');

  // Pick the medium tone: inserted, remembered, shown.
  await thumb.click({ button: 'right' });
  await pop.locator('[data-tone="3"]').click();
  await until(
    async () => (await box.inputValue()) === 'ok 👍🏽',
    `inserted: ${await box.inputValue()}`
  );
  await until(async () => (await pop.count()) === 0, 'closed after a pick');
  assert(
    (await thumb.getAttribute('data-emoji')) === '👍🏽',
    'the panel shows the tone'
  );
  const recent = await panel
    .locator('[data-category="recent"] .emoji-cell')
    .evaluateAll((c) => c.map((x) => x.dataset.emoji));
  assert(recent[0] === '👍🏽', `recent keeps the variant: ${recent[0]}`);

  // Search shows it as well.
  await panel.locator('[data-field="emoji-search"]').fill('thumbs up');
  const found = panel.locator('[data-category="found"] [data-tonable="👍"]');
  await found.waitFor({ timeout: 5000 });
  assert((await found.getAttribute('data-emoji')) === '👍🏽', 'search tone');
  await found.click();
  await until(
    async () => (await box.inputValue()) === 'ok 👍🏽👍🏽',
    `search pick: ${await box.inputValue()}`
  );

  // Next visit remembers it.
  // Sent, so no draft is left to save as the page goes away.
  await box.press('Enter');
  await until(() => sent.length === 1, 'sent');
  await page.waitForTimeout(300);
  await page.reload();
  box = await open();
  await button.click();
  await panel.waitFor({ timeout: 5000 });
  const again = panel.locator('[data-category="people"] [data-tonable="👍"]');
  await again.scrollIntoViewIfNeeded();
  assert((await again.getAttribute('data-emoji')) === '👍🏽', 'remembered');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-emoji-tones] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-emoji-tones] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-emoji-tones-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
