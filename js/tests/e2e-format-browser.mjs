// Real browser e2e for text formatting (R-Y101): in the message box
// Ctrl+B makes the selection bold (again takes it off), Ctrl+Shift+X
// with nothing selected puts strike markers round the caret; what is
// sent is the markdown as typed; the message on its way already shows
// bold and struck, and so does Telegram's answer; editing it gives the
// markdown back. Fake chats in a memory store, a fake sender that holds
// the send, a server on a free port, a headless browser; nothing reaches
// a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:format

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { parseFormatted, rawEntities } from '../src/sources/telegram-format.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('format');

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
  body: 'how was it?',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

// The sender holds each send until the test lets it go, then answers as
// the account does: the text without markers, the formatting as entities.
const sent = [];
let release = null;
const held = new Promise((resolve) => {
  release = resolve;
});
const send = async (draft) => {
  sent.push(draft.text);
  await held;
  const { text, entities } = parseFormatted(draft.text);
  const [link] = telegramDialogLinks({ id: CHAT, isUser: true }, [
    {
      id: 9,
      out: true,
      message: text,
      date: new Date(),
      entities: rawEntities(entities),
    },
  ]);
  return { via: 'fake', link };
};

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-format-'));
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
    send,
  },
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (dialog) => dialog.accept());

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

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  const box = page.locator('.chat-composer textarea');
  await box.waitFor({ timeout: 15000 });
  await box.fill('hello world');
  const select = (start, end) =>
    box.evaluate((area, [a, b]) => area.setSelectionRange(a, b), [start, end]);

  // Ctrl+B: the selection bold; again: not.
  await select(6, 11);
  await page.keyboard.press('Control+b');
  assert(
    (await box.inputValue()) === 'hello **world**',
    `bold: ${await box.inputValue()}`
  );
  await page.keyboard.press('Control+b');
  assert(
    (await box.inputValue()) === 'hello world',
    `bold off: ${await box.inputValue()}`
  );
  await page.keyboard.press('Control+b');

  // Ctrl+Shift+X with nothing selected: markers round the caret.
  // (End does not move the caret in Safari on a Mac.)
  const end = (await box.inputValue()).length;
  await select(end, end);
  await page.keyboard.type(' ');
  await page.keyboard.press('Control+Shift+x');
  await page.keyboard.type('old');
  const typed = await box.inputValue();
  assert(typed === 'hello **world** ~~old~~', `typed: ${typed}`);

  // Sent as typed; on its way it shows formatted already.
  await page.keyboard.press('Enter');
  await until(() => sent.length === 1, 'the send');
  assert(sent[0] === typed, `sent: ${sent[0]}`);
  const stream = page.locator('.chat-main');
  const shows = async () =>
    (await stream.locator('strong', { hasText: 'world' }).count()) === 1 &&
    (await stream.locator('s', { hasText: 'old' }).count()) === 1;
  await until(shows, 'formatted on its way');
  assert(!(await stream.innerText()).includes('**world**'), 'no markers shown');

  // Telegram's answer: still formatted, once.
  release();
  await until(
    async () => (await page.locator('[data-delivery="sending"]').count()) === 0,
    'delivered'
  );
  await until(shows, 'formatted when sent');

  // Editing it gives the markdown back.
  await box.press('ArrowUp');
  await page.locator('[data-edit-bar]').waitFor({ timeout: 5000 });
  const again = await box.inputValue();
  assert(again === typed, `edit box: ${again}`);
  await box.press('Escape');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-format] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-format] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-format-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
