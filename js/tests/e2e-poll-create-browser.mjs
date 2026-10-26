// Real browser e2e for creating a poll (R-Y74), as Telegram Desktop does:
// the paperclip's menu offers "Poll"; "New poll" opens, with Create off
// until the question and two options are filled; an empty last option
// adds the next, each can be removed, up to ten; a quiz needs its right
// option and excludes multiple answers; Escape and Cancel close it; and
// Create sends the right body to /api/telegram/send-poll. Telegram's
// answers faked in the page, a fake chat in a memory store, a server on a
// free port, a headless browser; nothing reaches a network or a running
// app, nothing is sent. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:poll-create

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('poll-create');

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
  body: 'look at this',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-poll-create-'));
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

const fulfil = (route, body, status = 200) =>
  route.fulfill({
    status,
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
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
const sends = [];
await page.route('**/api/telegram/send-poll', (route) => {
  sends.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: CHAT });
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

const dialog = page.locator('.poll-dialog');
const create = page.locator('[data-action="poll-create"]');
const options = dialog.locator('[data-field="option"]');
const optionTexts = () => options.evaluateAll((a) => a.map((i) => i.value));
const openDialog = async () => {
  await page.locator('[data-action="attach"]').click();
  await page.locator('[data-action="attach-poll"]').click();
  await dialog.waitFor({ timeout: 5000 });
};
const setOption = (index, text) => options.nth(index).fill(text);

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });

  // The paperclip offers File and Poll; Escape closes the menu only.
  await page.locator('[data-action="attach"]').click();
  assert(
    (await page.locator('[data-action="attach-file"]').count()) === 1,
    'the menu has File'
  );
  // Over the paperclip and on the screen, whatever the composer's styling.
  const [menuBox, clipBox] = await Promise.all([
    page.locator('.attach-menu').boundingBox(),
    page.locator('[data-action="attach"]').boundingBox(),
  ]);
  const width = page.viewportSize().width;
  assert(
    Math.abs(menuBox.x - clipBox.x) < 2 &&
      menuBox.x + menuBox.width <= width &&
      menuBox.y + menuBox.height <= clipBox.y,
    `menu at ${JSON.stringify(menuBox)}, paperclip at ${JSON.stringify(clipBox)}`
  );
  await page.keyboard.press('Escape');
  await until(
    async () => (await page.locator('.attach-menu').count()) === 0,
    'menu closed'
  );

  // The dialog: empty, two fields, Create off; anonymous voting on.
  await openDialog();
  assert((await options.count()) === 2, `two fields: ${await options.count()}`);
  assert(await create.isDisabled(), 'Create off when empty');
  assert(
    await dialog.locator('[data-option="anonymous"] input').isChecked(),
    'anonymous by default'
  );
  assert(
    !(await dialog.locator('[data-option="multiple"] input').isChecked()),
    'one answer by default'
  );
  assert(
    (await dialog.locator('[data-field="solution"]').count()) === 0,
    'no explanation outside a quiz'
  );

  // The question alone, then one option: still off; two: on.
  await dialog.locator('[data-field="question"]').fill('Lunch?');
  assert(await create.isDisabled(), 'off without options');
  await setOption(0, 'Soup');
  assert(await create.isDisabled(), 'off with one option');
  assert((await options.count()) === 2, 'an empty last field stays');
  await setOption(1, 'Salad');
  assert((await options.count()) === 3, 'filling the last adds the next');
  assert(!(await create.isDisabled()), 'Create on');

  // Options added to the limit of ten, each removed again.
  for (let i = 2; i < 10; i += 1) {
    await setOption(i, `Option ${i + 1}`);
  }
  assert((await options.count()) === 10, `ten: ${await options.count()}`);
  assert(
    (await optionTexts()).every((text) => text !== ''),
    'no empty field at ten'
  );
  assert(
    (await options.first().getAttribute('maxlength')) === '100',
    'options hold 100 characters'
  );
  assert(
    (await dialog
      .locator('[data-field="question"]')
      .getAttribute('maxlength')) === '255',
    'the question holds 255 characters'
  );
  await dialog.locator('[data-action="poll-remove"]').nth(2).click();
  assert((await options.count()) === 10, 'an empty field is back');
  assert(
    (await optionTexts()).slice(0, 3).join() === 'Soup,Salad,Option 4',
    `removed the third: ${await optionTexts()}`
  );
  for (let i = 0; i < 7; i += 1) {
    await dialog.locator('[data-action="poll-remove"]').nth(2).click();
  }
  assert(
    (await optionTexts()).join() === 'Soup,Salad,',
    `back to two: ${await optionTexts()}`
  );

  // A plain poll: Create sends it, the dialog closes.
  await dialog.locator('[data-option="anonymous"] input').uncheck();
  await dialog.locator('[data-option="multiple"] input').check();
  await create.click();
  await until(() => sends.length === 1, 'poll sent');
  const plain = sends[0];
  assert(
    plain.chat === CHAT &&
      plain.question === 'Lunch?' &&
      plain.options.join() === 'Soup,Salad' &&
      plain.anonymous === false &&
      plain.multiple === true &&
      plain.quiz === false &&
      plain.correct === undefined &&
      plain.solution === undefined &&
      typeof plain.clientId === 'string',
    `plain: ${JSON.stringify(plain)}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed after');

  // Escape and Cancel close it; it opens empty again.
  await openDialog();
  await dialog.locator('[data-field="question"]').fill('kept?');
  await page.keyboard.press('Escape');
  await until(async () => (await dialog.count()) === 0, 'Escape closes');
  await openDialog();
  assert(
    (await dialog.locator('[data-field="question"]').inputValue()) === '',
    'opens empty again'
  );
  await dialog.locator('button', { hasText: 'Cancel' }).click();
  await until(async () => (await dialog.count()) === 0, 'Cancel closes');

  // A quiz: needs its right option; no multiple answers; an explanation.
  await openDialog();
  await dialog.locator('[data-field="question"]').fill('2 + 2?');
  await setOption(0, '3');
  await setOption(1, '4');
  await setOption(2, '5');
  await dialog.locator('[data-option="multiple"] input').check();
  await dialog.locator('[data-option="quiz"] input').check();
  assert(
    await dialog.locator('[data-option="multiple"] input').isDisabled(),
    'a quiz excludes multiple answers'
  );
  assert(
    !(await dialog.locator('[data-option="multiple"] input').isChecked()),
    'multiple answers off in a quiz'
  );
  assert(
    (await dialog.locator('[data-field="correct"]').count()) === 4,
    'a mark on each field'
  );
  assert(await create.isDisabled(), 'a quiz without its right option');
  await dialog.locator('[data-field="solution"]').fill('Count again.');
  await dialog.locator('[data-field="correct"]').nth(1).check();
  assert(!(await create.isDisabled()), 'Create on with the right option');
  // Taking the marked option away takes the mark with it.
  await dialog.locator('[data-action="poll-remove"]').nth(1).click();
  assert(await create.isDisabled(), 'off after the marked option is removed');
  await setOption(1, '4');
  await setOption(2, '5');
  await dialog.locator('[data-field="correct"]').nth(1).check();
  await create.click();
  await until(() => sends.length === 2, 'quiz sent');
  const quiz = sends[1];
  assert(
    quiz.quiz === true &&
      quiz.multiple === false &&
      quiz.anonymous === true &&
      quiz.options.join() === '3,4,5' &&
      quiz.correct === 1 &&
      quiz.solution === 'Count again.',
    `quiz: ${JSON.stringify(quiz)}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed after');
  assert(sends.length === 2, 'nothing else sent');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-poll-create] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-poll-create] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-poll-create-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
