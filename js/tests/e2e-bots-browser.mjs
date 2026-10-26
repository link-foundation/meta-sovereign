// Real browser e2e for a bot's buttons (R-Y110), as Telegram Desktop has
// them: rows of buttons under the bot's message — one asks the bot and
// shows its answer as a toast, another as a box; a link asks before it
// opens; a copy copies; a switch puts "@bot query" in the box; one only
// Telegram's apps can do says so — and the keyboard under the message
// box, its words in the box's place, a button sending its words, hidden
// and shown again from beside the box. A fake chat in a memory store,
// Telegram's answers faked in the page, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:bots

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('bots');

const CHAT = '777';
const linkOf = (n) => `msg:telegram:${CHAT}:${n}`;
const row = (...buttons) => ({ className: 'KeyboardButtonRow', buttons });
const callback = (text, data) => ({
  className: 'KeyboardButtonCallback',
  text,
  data: { bytes: Buffer.from(data).toString('base64') },
});
const start = Date.now() - 3 * 60_000;
const message = (n, fields) => ({
  id: linkOf(n),
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Bot',
  chatType: 'personal_chat',
  sender: CHAT,
  senderName: 'Fake Bot',
  timestamp: new Date(start + n * 60_000).toISOString(),
  ...fields,
  raw: { id: n, ...fields.raw },
});
const store = createMemoryStore();
await store.put(message(1, { sender: 'me', body: '/start', raw: {} }));
await store.put(
  message(2, {
    body: 'What next?',
    raw: {
      replyMarkup: {
        className: 'ReplyInlineMarkup',
        rows: [
          row(callback('Toast', 'toast'), callback('Alert', 'alert')),
          row(
            {
              className: 'KeyboardButtonUrl',
              text: 'Site',
              url: 'https://example.org/page',
            },
            { className: 'KeyboardButtonCopy', text: 'Code', copyText: 'X-123' }
          ),
          row(
            {
              className: 'KeyboardButtonSwitchInline',
              text: 'Share',
              query: 'hello',
            },
            { className: 'KeyboardButtonBuy', text: 'Pay' }
          ),
        ],
      },
    },
  })
);
await store.put(
  message(3, {
    body: 'Pick one',
    raw: {
      replyMarkup: {
        className: 'ReplyKeyboardMarkup',
        resize: true,
        placeholder: 'Choose one',
        rows: [
          row(
            { className: 'KeyboardButton', text: 'One' },
            { className: 'KeyboardButton', text: 'Two' }
          ),
          row({ className: 'KeyboardButtonRequestPhone', text: 'Phone' }),
        ],
      },
    },
  })
);

const sent = [];
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-bots-'));
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
    send: async (request) => {
      sent.push(request);
      return { via: 'fake' };
    },
  },
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// What the page opens and copies, kept in the page.
await page.addInitScript(() => {
  globalThis.__opened = [];
  globalThis.open = (...args) => {
    globalThis.__opened.push(args);
    return null;
  };
  globalThis.__copied = null;
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (words) => {
        globalThis.__copied = words;
      },
    },
  });
});

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
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: CHAT,
    kind: 'user',
    title: 'Fake Bot',
    username: 'fakebot',
    bot: true,
  })
);
const pressed = [];
const ANSWERS = {
  toast: { ok: true, message: 'Saved!', alert: false, url: null },
  alert: { ok: true, message: 'Are you sure?', alert: true, url: null },
};
await page.route('**/api/telegram/bot-callback', (route) => {
  const body = route.request().postDataJSON();
  pressed.push(body);
  fulfil(route, ANSWERS[Buffer.from(body.data, 'base64').toString()]);
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
const notice = () =>
  page
    .locator('.chat-notice')
    .first()
    .getAttribute('data-notice')
    .catch(() => null);

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  const keyboard = page.locator(`[data-bot-keyboard="${linkOf(2)}"]`);
  await keyboard.waitFor({ timeout: 10_000 });
  const kinds = await keyboard
    .locator('[data-bot-button]')
    .evaluateAll((list) => list.map((b) => b.dataset.botButton));
  assert(
    kinds.join() === 'callback,callback,url,copy,switch,buy',
    `the buttons: ${kinds}`
  );
  const button = (words) =>
    keyboard.locator('[data-bot-button]', { hasText: words });

  // A press asks the bot: its answer as a toast…
  await button('Toast').click();
  await until(async () => (await notice()) === 'bot', 'the toast');
  assert(
    (await page.locator('.chat-notice.bot').textContent()).includes('Saved!'),
    "the bot's words"
  );
  assert(
    pressed[0].chat === CHAT &&
      pressed[0].id === 2 &&
      pressed[0].data === Buffer.from('toast').toString('base64'),
    `asked: ${JSON.stringify(pressed[0])}`
  );
  // …or in a box.
  await button('Alert').click();
  const alert = page.locator('[data-bot-dialog="alert"]');
  await alert.waitFor({ timeout: 5000 });
  assert(
    (await alert.textContent()).includes('Are you sure?'),
    'the alert words'
  );
  await page.locator('[data-action="bot-ok"]').click();
  await alert.waitFor({ state: 'detached' });

  // A link asks before it opens.
  await button('Site').click();
  const ask = page.locator('[data-bot-dialog="url"]');
  await ask.waitFor({ timeout: 5000 });
  assert(
    (await ask.textContent()).includes('https://example.org/page'),
    'the link shown'
  );
  assert(
    (await page.evaluate(() => globalThis.__opened.length)) === 0,
    'not opened yet'
  );
  await page.locator('[data-action="bot-open"]').click();
  const opened = await page.evaluate(() => globalThis.__opened[0]);
  assert(
    opened[0] === 'https://example.org/page' && opened[2].includes('noopener'),
    `opened: ${opened}`
  );

  // A copy copies.
  await button('Code').click();
  await until(
    () => page.evaluate(() => globalThis.__copied === 'X-123'),
    'copied'
  );
  await until(async () => (await notice()) === 'copied', 'the copied toast');

  // A switch puts "@bot query" in the box.
  const box = page.locator('.chat-composer textarea');
  await button('Share').click();
  await until(
    async () => (await box.inputValue()) === '@fakebot hello ',
    'the switch'
  );
  await box.fill('');

  // What only Telegram's apps do says so.
  await button('Pay').click();
  await until(
    async () => (await notice()) === 'bot-unsupported',
    'only in Telegram'
  );

  // The keyboard under the box: its words in the box's place.
  const below = page.locator('.reply-keyboard');
  await below.waitFor({ timeout: 5000 });
  assert(
    (await box.getAttribute('placeholder')) === 'Choose one',
    "the bot's placeholder"
  );
  await below.locator('[data-bot-button]', { hasText: /^One$/ }).click();
  await until(() => sent.some((s) => s.text === 'One'), 'its words sent');
  const one = sent.find((s) => s.text === 'One');
  assert(one.chat === CHAT && !one.replyTo, `sent: ${JSON.stringify(one)}`);
  // Hidden and shown again from beside the box.
  const toggle = page.locator('[data-action="bot-keyboard"]');
  await toggle.click();
  await below.waitFor({ state: 'detached' });
  assert((await toggle.getAttribute('aria-pressed')) === 'false', 'hidden');
  await toggle.click();
  await below.waitFor({ timeout: 5000 });

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-bots] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-bots] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-bots-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
