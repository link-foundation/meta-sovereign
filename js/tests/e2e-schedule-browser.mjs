// Real browser e2e for the Send button's menu (R-Y102): a right click on
// Send offers "Send without sound" and "Schedule message"; a scheduled
// message goes with its time and is not shown in the chat; a clock with
// the count appears by the message box, opens the chat's scheduled
// messages, and each can be moved to another time or sent now; a silent
// one goes with `silent` and shows in the chat as usual. Fake chats in a
// memory store, a fake sender that records, Telegram's scheduled list
// faked in the page, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`;
// run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:schedule

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';

const skip = (msg) => {
  console.log(`[e2e-schedule] SKIP: ${msg}`);
  process.exit(0);
};
if (!process.env.RUN_BROWSER_E2E) {
  skip('RUN_BROWSER_E2E not set');
}
const engine = process.env.E2E_BROWSER || 'chromium';
let browserType;
try {
  browserType = (await import('playwright'))[engine];
} catch {
  skip('playwright not installed');
}

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(`assertion failed: ${msg}`);
  }
};

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
  body: 'remind me tomorrow',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

// Telegram's scheduled messages for the chat, as the fakes change them.
let scheduled = [];
let nextId = 100;
const sent = [];
const send = async (draft) => {
  sent.push(draft);
  if (draft.scheduleDate) {
    nextId += 1;
    scheduled.push({ id: nextId, text: draft.text, date: draft.scheduleDate });
    return { via: 'fake', scheduled: true, links: [] };
  }
  return { via: 'fake' };
};
const asLinks = () =>
  [...scheduled]
    .sort((a, b) => a.date - b.date)
    .map((m) => ({
      id: `sched:telegram:${CHAT}:${m.id}`,
      source: 'telegram',
      chat: CHAT,
      sender: 'me',
      body: m.text,
      timestamp: new Date(m.date * 1000).toISOString(),
      scheduled: true,
    }));

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-schedule-'));
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
const asked = [];
await page.route('**/api/telegram/scheduled*', (route) => {
  const name = route.request().url().split('/api/telegram/')[1];
  const body = JSON.parse(route.request().postData() ?? '{}');
  asked.push([name, body]);
  if (name === 'scheduled-reschedule') {
    scheduled = scheduled.map((m) =>
      m.id === body.id ? { ...m, date: body.date } : m
    );
  } else if (name === 'scheduled-send' || name === 'scheduled-delete') {
    scheduled = scheduled.filter((m) => !body.ids.includes(m.id));
  }
  fulfil(
    route,
    name === 'scheduled'
      ? { ok: true, chat: CHAT, links: asLinks() }
      : { ok: true, chat: CHAT }
  );
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
const pad = (n) => String(n).padStart(2, '0');

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  const box = page.locator('.chat-composer textarea');
  await box.waitFor({ timeout: 15000 });
  await until(
    () => asked.some(([name]) => name === 'scheduled'),
    'the scheduled ones asked'
  );
  const clock = page.locator('[data-action="scheduled"]');
  assert((await clock.count()) === 0, 'no clock without scheduled ones');

  // Schedule for tomorrow 10:00.
  await box.fill('call the bank');
  const sendButton = page.locator('.chat-composer button.send');
  await sendButton.click({ button: 'right' });
  await page.locator('.msg-context-menu [data-action="schedule"]').click();
  const dialog = page.locator('.schedule-dialog');
  await dialog.waitFor({ timeout: 5000 });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const day = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  await dialog.locator('[data-field="day"]').fill(day);
  await dialog.locator('[data-field="time"]').fill('10:00');
  await dialog.locator('[data-action="schedule-confirm"]').click();
  await until(() => sent.length === 1, 'the scheduled send');
  const want = Math.floor(tomorrow.getTime() / 1000);
  assert(
    sent[0].text === 'call the bank' && sent[0].scheduleDate === want,
    `scheduled: ${JSON.stringify(sent[0])}`
  );
  assert((await box.inputValue()) === '', 'the box is cleared');

  // Not in the chat; the clock shows one.
  await until(async () => (await clock.count()) === 1, 'the clock');
  assert(
    (await clock.innerText()).trim() === '1',
    `count: ${await clock.innerText()}`
  );
  const stream = page.locator('.chat-scroll');
  assert(
    (await stream.innerText()).includes('remind me tomorrow') &&
      !(await stream.innerText()).includes('call the bank'),
    'not shown in the chat'
  );

  // The list: moved to 11:30, then sent now.
  await clock.click();
  const list = page.locator('.scheduled-dialog');
  await list.waitFor({ timeout: 5000 });
  assert(
    (await list.locator('.scheduled-item').innerText()).includes(
      'call the bank'
    ),
    'listed'
  );
  await list.locator('[data-action="scheduled-move"]').click();
  const move = page.locator('.schedule-dialog');
  await move.waitFor({ timeout: 5000 });
  assert(
    (await move.locator('[data-field="time"]').inputValue()) === '10:00',
    'its own time first'
  );
  await move.locator('[data-field="time"]').fill('11:30');
  await move.locator('[data-action="schedule-confirm"]').click();
  await until(
    () => asked.some(([name]) => name === 'scheduled-reschedule'),
    'moved'
  );
  const moved = asked.find(([name]) => name === 'scheduled-reschedule')[1];
  assert(
    moved.id === 101 && moved.date === want + 90 * 60,
    `moved to: ${JSON.stringify(moved)}`
  );
  await list.locator('[data-action="scheduled-send"]').click();
  await until(
    async () => (await page.locator('.scheduled-dialog').count()) === 0,
    'the list closes when empty'
  );
  assert(
    asked.some(([name, b]) => name === 'scheduled-send' && b.ids[0] === 101),
    'sent now'
  );
  await until(async () => (await clock.count()) === 0, 'the clock goes');

  // Without sound: sent at once, shown in the chat.
  await box.fill('quietly');
  await sendButton.click({ button: 'right' });
  await page.locator('.msg-context-menu [data-action="sendSilent"]').click();
  await until(() => sent.length === 2, 'the silent send');
  await until(
    async () => (await stream.innerText()).includes('quietly'),
    'shown in the chat'
  );
  assert(
    sent[1].silent === true && !sent[1].scheduleDate,
    `silent: ${JSON.stringify(sent[1])}`
  );

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-schedule] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-schedule] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-schedule-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
