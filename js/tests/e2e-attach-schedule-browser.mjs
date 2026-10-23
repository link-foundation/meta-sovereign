// Real browser e2e for the attach dialog's Send menu (R-Y99, R-Y102): a
// file picked from the paperclip opens the dialog; a right click on its
// Send offers "Send without sound" (the request to the files route says
// `silent`) and "Schedule message" (a day and a time, the request says
// `scheduleDate`, a future unix time); Escape and Cancel, in the dialog
// or in the schedule dialog, send nothing. Uploads and Telegram's
// answers faked in the page, fake chats in a memory store, a server on a
// free port, a headless browser; nothing reaches a network or a running
// app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:attach-schedule

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

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
  body: 'send me the notes',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('attach-schedule', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, links: [] })
);
let uploads = 0;
await page.route('**/api/telegram/upload*', (route) => {
  uploads += 1;
  return fulfil(route, {
    ok: true,
    token: String(uploads).padStart(32, '0'),
    name: 'notes.txt',
    size: 11,
  });
});
const sends = [];
await page.route('**/api/telegram/send-files', (route) => {
  sends.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: CHAT, ids: [2] });
});

const dialog = page.locator('.attach-dialog');
const schedule = page.locator('.schedule-dialog');
const pad = (n) => String(n).padStart(2, '0');

// The paperclip's File, the system's picker with one in-memory file.
const attachFile = async () => {
  await page.locator('[data-action="attach"]').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-action="attach-file"]').click(),
  ]);
  await chooser.setFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello notes'),
  });
  await dialog.waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[data-file="notes.txt"]').count()) === 1,
    'the file is listed'
  );
};
const openMenu = async (action) => {
  await dialog
    .locator('[data-action="attach-send"]')
    .click({ button: 'right' });
  await page.locator(`.msg-context-menu [data-action="${action}"]`).click();
};
const gone = async (locator, what) =>
  until(async () => (await locator.count()) === 0, what);

const silentStep = async () => {
  await attachFile();
  await openMenu('sendSilent');
  await until(() => sends.length === 1, 'the silent send');
  assert(sends[0].silent === true, `silent: ${JSON.stringify(sends[0])}`);
  assert(!sends[0].scheduleDate, 'not scheduled');
  assert(sends[0].tokens.length === 1, 'the uploaded file goes');
  await gone(dialog, 'the dialog closes after sending');
};

const scheduleStep = async () => {
  await attachFile();
  await openMenu('schedule');
  await schedule.waitFor({ timeout: 5000 });
  const later = new Date(Date.now() + 2 * 86_400_000);
  later.setHours(10, 0, 0, 0);
  const day = `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}`;
  await schedule.locator('[data-field="day"]').fill(day);
  await schedule.locator('[data-field="time"]').fill('10:00');
  await schedule.locator('[data-action="schedule-confirm"]').click();
  await until(() => sends.length === 2, 'the scheduled send');
  const want = Math.floor(later.getTime() / 1000);
  assert(
    sends[1].scheduleDate === want && want > Date.now() / 1000,
    `scheduled: ${JSON.stringify(sends[1])}`
  );
  assert(!sends[1].silent, 'scheduled is not silent');
  await gone(dialog, 'the dialog closes after scheduling');
};

const cancelStep = async () => {
  const before = sends.length;
  // Escape closes the attach dialog.
  await attachFile();
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes the dialog');
  // Cancel closes it too.
  await attachFile();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await gone(dialog, 'Cancel closes the dialog');
  // Escape in the schedule dialog closes it, the attach dialog stays.
  await attachFile();
  await openMenu('schedule');
  await schedule.waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await gone(schedule, 'Escape closes the schedule dialog');
  assert((await dialog.count()) === 1, 'the attach dialog stays');
  // Cancel in the schedule dialog likewise.
  await openMenu('schedule');
  await schedule.waitFor({ timeout: 5000 });
  await schedule.getByRole('button', { name: 'Cancel' }).click();
  await gone(schedule, 'Cancel closes the schedule dialog');
  assert((await dialog.count()) === 1, 'the attach dialog still stays');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await gone(dialog, 'the attach dialog closes');
  await page.waitForTimeout(300);
  assert(sends.length === before, `nothing sent: ${sends.length - before}`);
};

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('[data-action="attach"]').waitFor({ timeout: 15000 });
  await silentStep();
  await scheduleStep();
  await cancelStep();
});
