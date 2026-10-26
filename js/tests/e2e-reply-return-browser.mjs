// Real browser e2e for three of Telegram Desktop's ways (R-Y109): text
// selected in the message box shows the formatting bar — its Underline
// wraps the selection in <u>…</u>, as Ctrl/Cmd+U does, again takes it
// off; after a reply's quote is followed, "down" goes back to the reply,
// then to the newest; the open chat clicked again in the list goes to
// its newest. A fake chat in a memory store, Telegram's answers faked in
// the page, a server on a free port, a headless browser; nothing reaches
// a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:reply-return

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('reply-return');

const CHAT = '555';
const COUNT = 120;
const ANSWERED = 30;
const REPLY = 100;
const start = Date.now() - COUNT * 3600_000;
const linkOf = (n) => `msg:telegram:${CHAT}:${n}`;
const store = createMemoryStore();
for (let n = 1; n <= COUNT; n += 1) {
  await store.put({
    id: linkOf(n),
    source: 'telegram',
    chat: CHAT,
    chatName: 'Fake Dave',
    chatType: 'personal_chat',
    sender: CHAT,
    senderName: 'Fake Dave',
    body: n === REPLY ? 'answering an old one' : `message ${n}`,
    timestamp: new Date(start + n * 3600_000).toISOString(),
    ...(n === REPLY ? { replyTo: `${CHAT}:${ANSWERED}` } : {}),
    raw: { id: n },
  });
}

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-return-'));
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
    send: async () => ({ via: 'fake' }),
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
  fulfil(route, { written: 0, cached: true, complete: true, newest: false })
);
await page.route('**/api/telegram/history-at', (route) =>
  fulfil(route, { ok: true, id: route.request().postDataJSON().id })
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

// Whether a message's row is drawn and in the stream's view.
const inView = (id) =>
  page.evaluate((target) => {
    const box = document.querySelector('.chat-scroll');
    const row = box?.querySelector(`[data-message="${target}"]`);
    if (!row) {
      return false;
    }
    const a = box.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    return b.bottom > a.top && b.top < a.bottom;
  }, id);

let failed = false;
try {
  await page.goto(`${base}/`);
  const item = page.locator(`[data-chat="telegram:${CHAT}"]`);
  await item.click();
  await until(() => inView(linkOf(COUNT)), 'the newest shown', 15_000);

  // Selected text: the formatting bar; Underline wraps it, again unwraps.
  const box = page.locator('.chat-composer textarea');
  await box.fill('make this underlined');
  assert((await page.locator('.format-bar').count()) === 0, 'no bar yet');
  await box.evaluate((area) => {
    area.focus();
    area.setSelectionRange(5, 9);
  });
  const underline = page.locator('[data-format="underline"]');
  await underline.waitFor({ timeout: 5000 });
  const titles = await page
    .locator('.format-bar button')
    .evaluateAll((list) => list.map((b) => b.dataset.format));
  assert(
    titles.join() === 'bold,italic,underline,strike,code,spoiler,link,plain',
    `the bar's buttons: ${titles}`
  );
  await underline.click();
  assert(
    (await box.inputValue()) === 'make <u>this</u> underlined',
    `underlined: ${await box.inputValue()}`
  );
  const kept = await box.evaluate((a) => [a.selectionStart, a.selectionEnd]);
  assert(kept.join() === '8,12', `the selection kept: ${kept}`);
  await underline.click();
  assert(
    (await box.inputValue()) === 'make this underlined',
    'again: taken off'
  );
  // The shortcut does the same.
  await box.evaluate((area) => area.setSelectionRange(0, 4));
  await page.keyboard.press('ControlOrMeta+u');
  assert(
    (await box.inputValue()) === '<u>make</u> this underlined',
    `Ctrl+U: ${await box.inputValue()}`
  );
  // Nothing selected: no bar.
  await box.fill('');
  await page.locator('.format-bar').waitFor({ state: 'detached' });

  // A reply's quote followed: "down" goes back to the reply, then on.
  const reply = page.locator(`[data-message="${linkOf(REPLY)}"]`);
  await reply.scrollIntoViewIfNeeded();
  await reply.locator('.bubble-reply').click();
  await until(() => inView(linkOf(ANSWERED)), 'the answered one', 15_000);
  const down = page.locator('[data-action="scroll-new"]');
  await down.click();
  await until(() => inView(linkOf(REPLY)), 'back at the reply', 15_000);
  assert(!(await inView(linkOf(ANSWERED))), 'left the answered one');
  await down.click();
  await until(() => inView(linkOf(COUNT)), 'then the newest', 15_000);

  // Scrolled up, the open chat clicked again in the list: the newest.
  await page.evaluate(() => {
    const scroller = document.querySelector('.chat-scroll');
    scroller.scrollTop = 0;
  });
  await until(async () => !(await inView(linkOf(COUNT))), 'scrolled up');
  await item.click();
  await until(() => inView(linkOf(COUNT)), 'the newest again', 15_000);

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-reply-return] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-reply-return] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-reply-return-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
