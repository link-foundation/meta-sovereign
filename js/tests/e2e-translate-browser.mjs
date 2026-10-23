// Real browser e2e for translating a message (R-Y132), as Telegram
// Desktop does: the menu of a message with text has "Translate…", which
// opens a box with the original and the translation (drawn with its
// entities), a list of languages that asks again, Copy translation, and
// Close (also Escape and a click outside); a refusal is told in words.
// Telegram's answers faked in the page, a fake chat in a memory store, a
// server on a free port, a headless browser; nothing reaches a network
// or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:translate

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '7';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const message = (n, body) => ({
  id: `msg:telegram:${CHAT}:${n}`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Ann Fake',
  chatType: 'private',
  sender: CHAT,
  senderName: 'Ann Fake',
  body,
  timestamp: at(n),
  raw: { id: n },
});
await store.put(message(1, 'Guten Tag'));
await store.put(message(2, 'Nicht erlaubt'));

const { base, page, until, finish } = await openChatApp('translate', {
  store,
});

// The clipboard is faked: what is written is kept for the test.
await page.addInitScript(() => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text) => {
        globalThis.__clip = text;
      },
    },
  });
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: CHAT, kind: 'private', title: 'Ann Fake' })
);
const asked = [];
await page.route('**/api/telegram/translate', (route) => {
  const body = route.request().postDataJSON();
  asked.push(body);
  if (body.ids[0] === 2) {
    return fulfil(route, {
      ok: false,
      error: 'TRANSLATIONS_DISABLED',
      code: 'disabled',
    });
  }
  const text = body.to === 'ru' ? 'Добрый день' : 'Good day';
  return fulfil(route, {
    ok: true,
    items: [
      {
        id: body.ids[0],
        text,
        entities: [{ className: 'MessageEntityBold', offset: 0, length: 4 }],
      },
    ],
  });
});

const box = page.locator('[data-dialog="translate"]');
const row = (n) =>
  page.locator(`.chat-scroll [data-message="msg:telegram:${CHAT}:${n}"]`);
const menu = page.locator('.msg-context-menu');
const open = async (n) => {
  await row(n)
    .locator('.bubble-body, .bubble')
    .first()
    .click({ button: 'right' });
  await menu.waitFor({ timeout: 5000 });
  await menu.locator('[data-action="translate"]').click();
  await box.waitFor({ timeout: 5000 });
};
const gone = (what) => until(async () => (await box.count()) === 0, what);

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await row(1).waitFor({ timeout: 15000 });

  // The original, the translation with its bold part, the first request.
  await open(1);
  const translated = box.locator('[data-translate="translation"]');
  await until(
    async () => (await translated.textContent()).includes('Good day'),
    'the translation'
  );
  assert(
    (await box.locator('[data-translate="original"]').textContent()).includes(
      'Guten Tag'
    ),
    'the original'
  );
  assert((await translated.locator('strong, b').count()) > 0, 'bold entity');
  assert(
    JSON.stringify(asked[0]) ===
      `{"chat":"${CHAT}","ids":[1],"to":"${asked[0].to}"}`,
    `asked: ${JSON.stringify(asked[0])}`
  );

  // Another language asks again.
  await box.locator('[data-action="language"]').selectOption('ru');
  await until(
    async () => (await translated.textContent()).includes('Добрый день'),
    'the Russian translation'
  );
  assert(asked.at(-1).to === 'ru', 'asked for ru');

  // Copy translation.
  await box.locator('[data-action="copy-translation"]').click();
  await until(
    async () => (await box.textContent()).includes('copied'),
    'copied'
  );
  const clip = await page.evaluate(() => globalThis.__clip);
  assert(clip === 'Добрый день', `clipboard: ${clip}`);

  // Close, Escape and a click outside.
  await box.locator('[data-action="close-translate"]').click();
  await gone('closed by Close');
  await open(1);
  await page.keyboard.press('Escape');
  await gone('closed by Escape');
  await open(1);
  await page.mouse.click(3, 3);
  await gone('closed beside it');

  // A refusal is told.
  await open(2);
  await box.locator('[role="alert"]').waitFor({ timeout: 5000 });
  assert(
    (await box.textContent()).includes('turned off'),
    `refusal: ${await box.textContent()}`
  );
});
