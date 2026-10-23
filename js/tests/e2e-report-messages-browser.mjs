// Real browser e2e for reporting single messages (R-Y175), as Telegram
// Desktop has it: "Report" in the menu of another person's message in a
// group and on the selection's bar (only when every selected message is
// someone else's), never on our own messages nor in a private chat. It
// walks the same list of reasons as reporting a chat — here with the
// message ids — and nothing is reported until the last click in the
// dialog. Telegram's answers faked in the page, fake chats in a memory
// store, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:report-messages

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const PRIVATE = '42';
const store = createMemoryStore();
const base0 = Date.now();
for (let i = 1; i <= 6; i++) {
  const mine = i === 4;
  await store.put({
    id: `msg:telegram:${GROUP}:${i}`,
    source: 'telegram',
    chat: GROUP,
    chatName: 'Fake Group',
    chatType: 'supergroup',
    sender: mine ? 'me' : 'u1',
    senderName: mine ? 'me' : 'Alice',
    body: `group message ${i}`,
    timestamp: new Date(base0 - (10 - i) * 60_000).toISOString(),
    raw: { id: i },
  });
}
await store.put({
  id: `msg:telegram:${PRIVATE}:1`,
  source: 'telegram',
  chat: PRIVATE,
  chatName: 'Ann Lee',
  chatType: 'private',
  sender: PRIVATE,
  senderName: 'Ann Lee',
  body: 'hello in private',
  timestamp: new Date(base0 - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('report-messages', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/peer-settings', (route) =>
  fulfil(route, { ok: true, bar: {} })
);
const calls = [];
await page.route('**/api/telegram/peer-report', (route) => {
  const body = route.request().postDataJSON();
  calls.push(body);
  if (!body.option) {
    return fulfil(route, {
      ok: true,
      result: 'choose',
      title: 'Why are you reporting this message?',
      options: [{ text: 'Spam', option: 'AQ==' }],
    });
  }
  if (body.option === 'AQ==') {
    return fulfil(route, {
      ok: true,
      result: 'comment',
      optional: false,
      option: 'Ag==',
    });
  }
  return fulfil(route, { ok: true, result: 'reported' });
});

const rowBody = (chat, n) =>
  page.locator(`[data-row="msg:telegram:${chat}:${n}"] .bubble-body`);
const pointOn = async (chat, n) => {
  const body = rowBody(chat, n);
  await body.scrollIntoViewIfNeeded();
  const box = await body.boundingBox();
  return [box.x + 10, box.y + box.height / 2];
};
const rightClick = async (chat, n) => {
  await page.mouse.click(...(await pointOn(chat, n)), { button: 'right' });
  await page.waitForSelector('[role=menu] [data-action]', { timeout: 3000 });
};
const menu = () =>
  page.$$eval('[role=menu] [data-action]', (n) =>
    n.map((e) => e.dataset.action)
  );
const dialog = page.locator('[data-dialog="report"]');

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:${GROUP}`);
  await page.waitForSelector('[data-row]', { timeout: 15_000 });
  await page.waitForTimeout(500);

  // Our own message: no Report.
  await rightClick(GROUP, 4);
  assert(!(await menu()).includes('report'), `own menu: ${await menu()}`);
  await page.keyboard.press('Escape');

  // Another's message: Report, after Delete.
  await rightClick(GROUP, 2);
  const items = await menu();
  assert(
    items.indexOf('report') === items.indexOf('delete') + 1,
    `menu: ${items}`
  );
  assert(calls.length === 0, 'opening the menu reports nothing');
  await page.click('[role=menu] [data-action="report"]');
  await dialog.waitFor({ timeout: 5000 });

  // The reasons Telegram offers, asked for these message ids.
  await dialog.locator('[data-action="report-reason"]').waitFor();
  assert(
    (await dialog.locator('h3').textContent()).includes('this message'),
    'Telegram title'
  );
  assert(
    calls.length === 1 &&
      calls[0].chat === GROUP &&
      JSON.stringify(calls[0].ids) === '[2]' &&
      calls[0].option === undefined,
    `first ask: ${JSON.stringify(calls)}`
  );
  await dialog.locator('[data-action="report-reason"]').click();
  await dialog.locator('[data-action="report-send"]').waitFor();
  // Telegram wants words: nothing is sent until the explicit click.
  assert((await dialog.locator('[data-report="done"]').count()) === 0, 'early');
  assert(
    await dialog.locator('[data-action="report-send"]').isDisabled(),
    'words are needed'
  );
  await dialog.locator('textarea').fill('this is spam');
  assert(calls.length === 2, `no final call yet: ${calls.length}`);
  await dialog.locator('[data-action="report-send"]').click();
  await dialog.locator('[data-report="done"]').waitFor({ timeout: 5000 });
  assert(calls.length === 3, 'one final call');
  assert(
    calls[2].message === 'this is spam' &&
      calls[2].option === 'Ag==' &&
      JSON.stringify(calls[2].ids) === '[2]',
    `final: ${JSON.stringify(calls[2])}`
  );
  await dialog.locator('[data-action="cancel"]').click();
  await until(async () => (await dialog.count()) === 0, 'dialog closes');

  // The selection bar: REPORT n when all are others'.
  await rightClick(GROUP, 1);
  await page.click('[role=menu] [data-action="select"]');
  await page.mouse.click(...(await pointOn(GROUP, 3)));
  const top = page.locator('.selection-top');
  await top.waitFor({ timeout: 5000 });
  const label = (await top.innerText()).replace(/\s+/g, ' ').trim();
  assert(
    label === 'FORWARD 2 DELETE 2 REPORT 2 CANCEL',
    `selection bar: ${label}`
  );
  await rightClick(GROUP, 1);
  assert((await menu()).includes('reportSelected'), `sel: ${await menu()}`);
  await page.keyboard.press('Escape');
  calls.length = 0;
  await top.locator('[data-action="report"]').click();
  await dialog.locator('[data-action="report-reason"]').waitFor();
  assert(
    JSON.stringify(calls[0].ids) === '[1,3]',
    `ids of the selection: ${JSON.stringify(calls[0])}`
  );
  await dialog.locator('[data-action="cancel"]').click();
  await until(async () => (await dialog.count()) === 0, 'dialog closes');

  // A selection with our own message has no REPORT.
  await rightClick(GROUP, 4);
  await page.click('[role=menu] [data-action="select"]');
  await page.mouse.click(...(await pointOn(GROUP, 5)));
  await top.waitFor({ timeout: 5000 });
  const mixed = (await top.innerText()).replace(/\s+/g, ' ').trim();
  assert(!mixed.includes('REPORT'), `mixed selection: ${mixed}`);
  await page.keyboard.press('Escape');

  // A private chat: no Report on a message.
  await page.goto(`${base}/#chat=telegram:${PRIVATE}`);
  await page.waitForSelector(`[data-row="msg:telegram:${PRIVATE}:1"]`, {
    timeout: 15_000,
  });
  await page.waitForTimeout(300);
  await rightClick(PRIVATE, 1);
  assert(!(await menu()).includes('report'), `private: ${await menu()}`);
});
