// Real browser e2e for the translate bar and the summary (R-Y213), as
// Telegram Desktop and the mobile apps have them: with "Translate entire
// chats" on in Settings and a Premium account, a chat whose messages are in
// another language shows a bar "Translate to English"; pressed, the
// messages are drawn translated (with their entities) and the bar offers
// "Show original"; its ⋯ menu has another language, Do not translate a
// language, Do not translate this chat and Close; a refusal is told in the
// bar. A long message's menu has Summarize. Telegram's answers faked in the
// page, fake chats in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:translate-bar

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42'; // Russian: translated, other language, summary, Close
const BOB = '43'; // Russian, but its info says translations are off
const DAN = '44'; // Russian: "Do not translate this chat"
const ERIC = '45'; // Russian: "Do not translate Русский"
const CAT = '46'; // English: no bar
const FRED = '47'; // Russian: Telegram refuses (quota)
const LONG = `${'Это очень длинное сообщение о нашей поездке. '.repeat(20)}`;

const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const say = async (chat, n, body) =>
  store.put({
    id: `msg:telegram:${chat}:${n}`,
    source: 'telegram',
    chat,
    chatName: `Chat ${chat}`,
    chatType: 'private',
    sender: chat,
    senderName: `Chat ${chat}`,
    body,
    timestamp: at(n),
    raw: { id: n },
  });
for (const chat of [ANN, BOB, DAN, ERIC, FRED]) {
  await say(chat, 1, 'Привет, как у тебя дела сегодня?');
  await say(chat, 2, 'Что нового у тебя? Расскажи мне всё.');
  await say(chat, 3, chat === ANN ? LONG : 'Увидимся завтра в городе.');
}
for (const n of [1, 2, 3]) {
  await say(CAT, n, 'Hello, what is this and are you here with me');
}

const { base, page, until, finish } = await openChatApp('translate-bar', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, {
    chat,
    kind: 'user',
    title: `Chat ${chat}`,
    members: 1,
    ...(chat === BOB ? { translationsDisabled: true } : {}),
  });
});
await page.route('**/api/telegram/translate-account', (route) =>
  fulfil(route, { ok: true, premium: true })
);
const asked = [];
await page.route('**/api/telegram/translate', (route) => {
  const body = route.request().postDataJSON();
  asked.push(body);
  if (body.chat === FRED) {
    return fulfil(route, {
      ok: false,
      error: 'TRANSLATE_REQ_QUOTA_EXCEEDED',
      code: 'quota',
    });
  }
  return fulfil(route, {
    ok: true,
    items: body.ids.map((id) => ({
      id,
      text: `${body.to === 'de' ? 'Deutsch' : 'English'} ${id}`,
      entities: [{ className: 'MessageEntityBold', offset: 0, length: 4 }],
    })),
  });
});
const summaries = [];
await page.route('**/api/telegram/summarize', (route) => {
  summaries.push(route.request().postDataJSON());
  return fulfil(route, {
    ok: true,
    text: 'A trip, in short.',
    entities: [{ className: 'MessageEntityBold', offset: 0, length: 6 }],
  });
});
const toggles = [];
await page.route('**/api/telegram/translations-toggle', (route) => {
  const body = route.request().postDataJSON();
  toggles.push(body);
  return fulfil(route, { ok: true, disabled: body.disabled });
});

const bar = page.locator('[data-translate-bar]');
const row = (n) =>
  page.locator(`.chat-scroll [data-message="msg:telegram:${current}:${n}"]`);
let current = ANN;
const toChat = async (chat) => {
  current = chat;
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await row(1).waitFor({ timeout: 15000 });
};
const text = async (n) => (await row(n).textContent()) ?? '';
const press = (action) => bar.locator(`[data-action="${action}"]`).click();
const openMenu = async () => {
  await press('translate-bar-more');
  await bar.locator('[data-translate-menu]').waitFor({ timeout: 5000 });
};
const noBar = async (what) => {
  await page.waitForTimeout(600);
  assert((await bar.count()) === 0, what);
};

const settingsAndBar = async () => {
  await page.goto(`${base}/`);

  // Off by default: no bar in a Russian chat.
  await toChat(ANN);
  await noBar('no bar while the setting is off');

  // Settings → Language: "Translate entire chats", kept per device.
  await page.locator('button[data-view="settings"]').click();
  const check = page.locator('[data-action="translate-chats"]');
  await check.waitFor({ timeout: 5000 });
  assert(!(await check.isChecked()), 'off by default');
  await check.check();

  // The bar over a Russian chat; an English chat has none.
  await toChat(CAT);
  await noBar('no bar in a chat in the page language');
  await toChat(ANN);
  await bar.waitFor({ timeout: 10000 });
  assert(
    (await bar.textContent()).includes('Translate to English'),
    `bar: ${await bar.textContent()}`
  );

  // Pressed: messages are drawn translated, with their entities.
  await press('translate-bar-go');
  await until(async () => (await text(1)).includes('English 1'), 'translated');
  assert((await row(1).locator('strong, b').count()) > 0, 'bold entity');
  assert(
    asked[0].chat === ANN && asked[0].to === 'en',
    JSON.stringify(asked[0])
  );
  assert(asked[0].ids.length === 3, `ids: ${asked[0].ids}`);
  // Show original brings the texts back.
  await press('translate-original');
  await until(async () => (await text(1)).includes('Привет'), 'original');

  // Another language asks again.
  await openMenu();
  await bar.locator('[data-action="translate-other"]').click();
  await bar.locator('[data-action="translate-to-de"]').click();
  await until(async () => (await text(2)).includes('Deutsch 2'), 'German');
  assert(asked.at(-1).to === 'de', 'asked for de');
};

const summarize = async () => {
  // Summarize: only on the long message.
  const menu = page.locator('.msg-context-menu');
  await row(1)
    .locator('.bubble-body, .bubble')
    .first()
    .click({ button: 'right' });
  await menu.waitFor({ timeout: 5000 });
  assert(
    (await menu.locator('[data-action="summarize"]').count()) === 0,
    'short message: no Summarize'
  );
  await page.keyboard.press('Escape');
  await row(3)
    .locator('.bubble-body, .bubble')
    .first()
    .click({ button: 'right' });
  await menu.waitFor({ timeout: 5000 });
  await menu.locator('[data-action="summarize"]').click();
  const box = page.locator('[data-dialog="summarize"]');
  await until(
    async () => (await box.textContent()).includes('A trip, in short.'),
    'the summary'
  );
  assert(
    summaries[0].chat === ANN && summaries[0].id === 3,
    JSON.stringify(summaries)
  );
  assert((await box.locator('strong, b').count()) > 0, 'summary entity');
  await page.keyboard.press('Escape');
  await until(async () => (await box.count()) === 0, 'summary closed');
};

const refusals = async () => {
  // Close hides the bar for this chat.
  await openMenu();
  await bar.locator('[data-action="translate-hide"]').click();
  await noBar('closed');
  await until(
    async () => (await text(1)).includes('Привет'),
    'back to original'
  );

  // A chat whose info says translations are off has none.
  await toChat(BOB);
  await noBar('translations off in the chat');

  // Telegram's refusal is told in the bar.
  await toChat(FRED);
  await bar.waitFor({ timeout: 10000 });
  await press('translate-bar-go');
  await bar.locator('[data-translate-bar-error]').waitFor({ timeout: 5000 });
  assert(
    (await bar.textContent()).includes('quota'),
    `refusal: ${await bar.textContent()}`
  );
};

const switches = async () => {
  // Do not translate this chat: the switch is asked, the bar goes.
  await toChat(DAN);
  await bar.waitFor({ timeout: 10000 });
  await openMenu();
  await bar.locator('[data-action="translate-stop"]').click();
  await until(() => toggles.length === 1, 'toggle asked');
  assert(toggles[0].chat === DAN && toggles[0].disabled === true, 'toggle');
  await noBar('chat switched off');

  // Do not translate Русский: kept, and no chat in it has the bar.
  await toChat(ERIC);
  await bar.waitFor({ timeout: 10000 });
  await openMenu();
  assert(
    (
      await bar.locator('[data-action="translate-skip"]').textContent()
    ).includes('Русский'),
    'names the language'
  );
  await bar.locator('[data-action="translate-skip"]').click();
  await noBar('language skipped');
  const kept = await page.evaluate(() =>
    globalThis.localStorage.getItem('metaSovereignTranslateSkip')
  );
  assert(kept === '["ru"]', `kept: ${kept}`);
  await toChat(FRED);
  await noBar('skipped language in another chat');
};

await finish(async () => {
  await settingsAndBar();
  await summarize();
  await refusals();
  await switches();
});
