// Real browser e2e for days in a chat and a jump to a date (R-Y106): the
// messages of each day under its date; the date at the top floats while
// the chat scrolls; a click on a date opens the calendar, a day picked
// there opens the chat at its first message, far back, with nothing
// newer shown above a gap; scrolling down reads the pages after it; a
// day with no messages goes on to the next; the round "down" button goes
// back to the newest. A fake chat of thirteen months in a memory store,
// Telegram's answers faked in the page, a server on a free port, a
// headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:jump-date

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('jump-date');

const CHAT = '555';
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n, hour) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

// Two messages a day for 400 days, none on the day 60 days ago.
const EMPTY_DAY = 60;
const store = createMemoryStore();
const sent = [];
let id = 0;
for (let back = 400; back >= 0; back -= 1) {
  if (back === EMPTY_DAY) {
    continue;
  }
  for (const hour of [10, 15]) {
    id += 1;
    const when = daysAgo(back, hour);
    sent.push({ id, when });
    await store.put({
      id: `msg:telegram:${CHAT}:${id}`,
      source: 'telegram',
      chat: CHAT,
      chatName: 'Fake Dave',
      chatType: 'user',
      sender: CHAT,
      senderName: 'Fake Dave',
      body: `day ${back} at ${hour}`,
      timestamp: when.toISOString(),
      raw: { id },
    });
  }
}

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-jump-'));
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
const asked = { at: [], after: [] };
await page.route('**/api/telegram/history', (route) => {
  const body = route.request().postDataJSON();
  if (body.after) {
    asked.after.push(body.after);
  }
  fulfil(route, { written: 0, cached: true, complete: true, newest: false });
});
await page.route('**/api/telegram/history-at', (route) => {
  const { date } = route.request().postDataJSON();
  asked.at.push(date);
  const first = sent.find((m) => m.when.getTime() >= date * 1000);
  fulfil(route, { ok: true, id: first ? first.id : null, newest: !first });
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

const scroller = page.locator('.chat-scroll');
const has = async (n) =>
  (await page.locator(`[data-message="msg:telegram:${CHAT}:${n}"]`).count()) >
  0;
const topOf = (selector) =>
  page.evaluate((sel) => {
    const node = document.querySelector(sel);
    const box = document.querySelector('.chat-scroll');
    return node
      ? node.getBoundingClientRect().top - box.getBoundingClientRect().top
      : null;
  }, selector);

const pickDay = async (target) => {
  await page.locator('.calendar').waitFor({ timeout: 5000 });
  const key = keyOf(target);
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(`[data-date="${key}"]`).count()) > 0) {
      break;
    }
    const shown = await page
      .locator('[data-date]')
      .first()
      .getAttribute('data-date');
    const way = shown.slice(0, 7) > key.slice(0, 7) ? 'previous' : 'next';
    await page.locator(`[data-move="${way}"]`).click();
  }
  await page.locator(`[data-date="${key}"]`).click();
  await until(
    async () => (await page.locator('.calendar').count()) === 0,
    'the calendar closed'
  );
};

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await until(() => has(id), 'the newest message');

  // The days: the newest is "Today", the one before "Yesterday".
  const labels = await page
    .locator('.chat-day .chat-day-pill')
    .evaluateAll((list) => list.map((b) => b.textContent));
  assert(labels.at(-1) === 'Today', `last day: ${labels.at(-1)}`);
  assert(labels.at(-2) === 'Yesterday', `day before: ${labels.at(-2)}`);

  // Scrolling floats the date of what is at the top.
  await scroller.evaluate((node) => {
    node.scrollTop = Math.max(0, node.scrollTop - 700);
  });
  await page
    .locator('.chat-day-float.is-shown .chat-day-pill')
    .waitFor({ timeout: 3000 });

  // A date's click opens the calendar on its month; tomorrow is closed.
  await page.locator('.chat-day .chat-day-pill').last().click();
  await page.locator('.calendar').waitFor({ timeout: 5000 });
  const tomorrow = keyOf(daysAgo(-1, 12));
  const closed = page.locator(`[data-date="${tomorrow}"]`);
  if ((await closed.count()) > 0) {
    assert(await closed.isDisabled(), 'tomorrow cannot be picked');
  }
  assert(
    (await page.locator('[data-move="next"]').isDisabled()) === true,
    'no month after this one'
  );

  // 300 days back: its first message, its date at the top, nothing newer.
  const target = sent.find((m) => keyOf(m.when) === keyOf(daysAgo(300, 10)));
  await pickDay(daysAgo(300, 12));
  await until(() => has(target.id), 'the day’s first message');
  assert(asked.at.length === 1, `asked once: ${asked.at}`);
  await until(async () => {
    const top = await topOf(`.chat-day[data-day="${keyOf(target.when)}"]`);
    return top !== null && Math.abs(top) < 60;
  }, 'its date at the top');
  assert(!(await has(id)), 'the newest is not shown above a gap');
  await page.locator('[data-action="scroll-new"]').waitFor({ timeout: 3000 });

  // Scrolling down reads the pages after it.
  await page.waitForTimeout(300);
  const before = await page.locator('[data-message]').count();
  await until(async () => {
    await scroller.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    return (await page.locator('[data-message]').count()) > before;
  }, 'a page after it');
  assert(!(await has(id)), 'still not the newest');
  assert(asked.after.length > 0, 'Telegram asked for the page after');

  // The day with no messages goes on to the next one.
  await page.locator('.chat-day .chat-day-pill').first().click();
  await pickDay(daysAgo(EMPTY_DAY, 12));
  const next = sent.find((m) => keyOf(m.when) === keyOf(daysAgo(59, 10)));
  await until(() => has(next.id), 'the next day’s first message');
  await until(async () => {
    const top = await topOf(`.chat-day[data-day="${keyOf(next.when)}"]`);
    return top !== null && Math.abs(top) < 60;
  }, 'the next day at the top');

  // Down: back to the newest.
  await page.locator('[data-action="scroll-new"]').click();
  await until(() => has(id), 'the newest again');
  await until(
    async () =>
      (await page.locator('[data-action="scroll-new"]').count()) === 0,
    'the down button gone at the end'
  );

  // Once the chat is read back to its first message the calendar stops
  // there: the days before it are closed and the arrow cannot go on.
  await until(
    async () => {
      await scroller.evaluate((node) => {
        node.scrollTop = 0;
      });
      return has(1);
    },
    'the first message',
    40_000
  );
  await page.locator('.chat-day .chat-day-pill').first().click();
  await page.locator('.calendar').waitFor({ timeout: 5000 });
  const firstDay = sent[0].when;
  const firstKey = keyOf(firstDay);
  const prev = page.locator('[data-move="previous"]');
  // Back to the first message's month.
  for (let i = 0; i < 16 && !(await prev.isDisabled()); i += 1) {
    await prev.click();
  }
  assert(await prev.isDisabled(), 'no month before the first message');
  const shownDays = await page
    .locator('[data-date]')
    .evaluateAll((list) => list.map((b) => [b.dataset.date, b.disabled]));
  assert(
    shownDays[0][0].slice(0, 7) === firstKey.slice(0, 7),
    `stopped at the first month: ${shownDays[0][0]}`
  );
  for (const [date, disabled] of shownDays) {
    assert(
      disabled === date < firstKey,
      `${date} ${disabled ? 'closed' : 'open'} (first ${firstKey})`
    );
  }
  assert(
    shownDays.some(([date, disabled]) => date < firstKey && disabled) ||
      firstDay.getDate() === 1,
    'a day before the first message is closed'
  );
  // The future is closed at the other end.
  for (
    let i = 0;
    i < 16 && !(await page.locator('[data-move="next"]').isDisabled());
    i += 1
  ) {
    await page.locator('[data-move="next"]').click();
  }
  const today = keyOf(new Date());
  const lastDays = await page
    .locator('[data-date]')
    .evaluateAll((list) => list.map((b) => [b.dataset.date, b.disabled]));
  for (const [date, disabled] of lastDays) {
    assert(disabled === date > today, `${date} closed: ${disabled}`);
  }
  await page.keyboard.press('Escape');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-jump-date] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-jump-date] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-jump-date-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
