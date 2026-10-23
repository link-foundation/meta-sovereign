// Real browser e2e for cloud drafts, the calendar's counts and frequent
// contacts (R-Y207), as Telegram Desktop has them:
//  - a draft typed on the phone shows in the chat list ("Draft:" in red)
//    and fills the composer when the chat opens; one cleared elsewhere
//    goes from both; the drafts are asked for from Telegram on connect;
//  - the jump-to-date calendar shows how many messages a day holds, a day
//    with none is closed, an earlier month is read with an earlier offset
//    date;
//  - the search box with nothing typed shows "People" (frequent contacts);
//    a right click removes one or turns the list off and on again;
//  - Settings > Privacy > "Clear all drafts" asks, then clears.
// Fake chats in a memory store, Telegram's answers faked in the page, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:drafts-calendar

import { readLink } from '../src/sources/telegram-account-live.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n, hour = 10) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

// Ann's messages: 2 days ago three, 5 ago one, 40 ago two, 70 ago one.
const PLAN = [
  [2, 3],
  [5, 1],
  [40, 2],
  [70, 1],
];
const store = createMemoryStore();
const sent = [];
let seq = 0;
for (const [back, many] of [...PLAN].sort((a, b) => b[0] - a[0])) {
  for (let i = 0; i < many; i += 1) {
    seq += 1;
    const when = daysAgo(back, 9 + i);
    sent.push({ id: seq, when });
    await store.put({
      id: `msg:telegram:${ANN}:${seq}`,
      source: 'telegram',
      chat: ANN,
      chatName: 'Ann Lee',
      chatType: 'private',
      sender: ANN,
      senderName: 'Ann Lee',
      body: `message ${seq}`,
      timestamp: when.toISOString(),
      raw: { id: seq },
    });
  }
}
await store.put({
  id: `msg:telegram:${BOB}:1`,
  source: 'telegram',
  chat: BOB,
  chatName: 'Bob Ray',
  chatType: 'private',
  sender: BOB,
  senderName: 'Bob Ray',
  body: 'hello',
  timestamp: daysAgo(10).toISOString(),
  raw: { id: 1 },
});
// The draft typed on the phone, as the live update stores it.
const draftLink = (chat, draft) =>
  readLink(chat, { draft, draftAt: new Date().toISOString() });
await store.put(draftLink(BOB, 'call me back tonight'));

const { base, page, until, finish } = await openChatApp('drafts-calendar', {
  store,
});

const asked = {
  sync: 0,
  clear: 0,
  before: [],
  removed: [],
  toggled: [],
  topPeers: 0,
};
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: true, complete: true, newest: false })
);
await page.route('**/api/telegram/drafts-sync', (route) => {
  asked.sync += 1;
  return fulfil(route, { ok: true, drafts: 1, cleared: 0 });
});
await page.route('**/api/telegram/drafts-clear', (route) => {
  asked.clear += 1;
  return fulfil(route, { ok: true, cleared: 1 });
});

// The calendar: days before the offset date, newest first, as counted
// from the messages above.
await page.route('**/api/telegram/calendar', (route) => {
  const body = route.request().postDataJSON();
  asked.before.push(body.before);
  const days = new Map();
  for (const m of sent) {
    const day = new Date(m.when);
    day.setHours(0, 0, 0, 0);
    const date = day.getTime() / 1000;
    if (!body.before || date < body.before) {
      days.set(date, (days.get(date) ?? 0) + 1);
    }
  }
  const periods = [...days.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([date, count]) => ({ date, count, minId: 1, maxId: 1 }));
  return fulfil(route, {
    ok: true,
    days: periods,
    first: Math.min(...sent.map((m) => m.when.getTime())) / 1000,
    total: sent.length,
    inexact: false,
  });
});

// Frequent contacts, kept as Telegram keeps them.
const top = {
  enabled: true,
  peers: [
    { chat: ANN, name: 'Ann Lee', username: null, kind: 'user' },
    { chat: BOB, name: 'Bob Ray', username: null, kind: 'user' },
  ],
};
await page.route('**/api/telegram/top-peers', (route) => {
  asked.topPeers += 1;
  return fulfil(route, {
    ok: true,
    enabled: top.enabled,
    peers: top.enabled ? top.peers : [],
  });
});
await page.route('**/api/telegram/top-peers-remove', (route) => {
  const { chat } = route.request().postDataJSON();
  asked.removed.push(chat);
  top.peers = top.peers.filter((p) => p.chat !== chat);
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/top-peers-toggle', (route) => {
  const { enabled } = route.request().postDataJSON();
  asked.toggled.push(enabled);
  top.enabled = enabled;
  return fulfil(route, { ok: true, enabled });
});

// The privacy dialog's other parts, quiet here.
await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Me',
    lastName: '',
    about: '',
    username: 'me',
    phone: '+15551234567',
    hasPhoto: false,
    aboutMax: 70,
  })
);
await page.route('**/api/telegram/privacy', (route) =>
  fulfil(route, { ok: true, keys: [] })
);
await page.route('**/api/telegram/sessions', (route) =>
  fulfil(route, { ok: true, ttlDays: 180, sessions: [] })
);
await page.route('**/api/telegram/archive-settings', (route) =>
  fulfil(route, {
    ok: true,
    settings: {
      archiveAndMute: false,
      keepUnmuted: false,
      keepFolders: false,
      hideReadMarks: false,
      requirePremium: false,
    },
  })
);
await page.route('**/api/telegram/web-sessions', (route) =>
  fulfil(route, { ok: true, sessions: [] })
);

const row = (chat) => page.locator(`.chat-list [data-chat="telegram:${chat}"]`);

// The calendar's month shown until it holds `key`'s day.
const show = async (key) => {
  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator(`[data-date="${key}"]`).count()) > 0) {
      return page.locator(`[data-date="${key}"]`);
    }
    const shown = await page
      .locator('[data-date]')
      .first()
      .getAttribute('data-date');
    const way = shown.slice(0, 7) > key.slice(0, 7) ? 'previous' : 'next';
    await page.locator(`[data-move="${way}"]`).click();
  }
  throw new Error(`no day ${key} in the calendar`);
};

const draftsSteps = async () => {
  await page.goto(`${base}/`);
  await row(BOB).waitFor();
  await until(() => asked.sync > 0, 'the drafts asked for on connect');
  // The phone's draft in the list, in red, in place of the last message.
  const draft = row(BOB).locator('.chat-item-draft');
  await draft.waitFor({ timeout: 5000 });
  assert((await draft.textContent()).trim() === 'Draft:', 'the Draft: label');
  const preview = await row(BOB).locator('.chat-item-preview').textContent();
  assert(preview.includes('call me back tonight'), `preview: ${preview}`);
  assert((await row(ANN).locator('.chat-item-draft').count()) === 0, 'Ann');
  // Opened, the composer holds it (and the list stops repeating it).
  await row(BOB).click();
  await until(
    async () =>
      (await page.locator('.chat-composer textarea').inputValue()) ===
      'call me back tonight',
    'the draft in the composer'
  );
  // Cleared on the phone: the stored draft empties, the composer follows.
  await store.put(draftLink(BOB, ''));
  await until(
    async () =>
      (await page.locator('.chat-composer textarea').inputValue()) === '',
    'the cleared draft gone from the composer',
    20_000
  );
  await row(ANN).click();
  await until(
    async () => (await row(BOB).locator('.chat-item-draft').count()) === 0,
    'the cleared draft gone from the list'
  );
};

const calendarSteps = async () => {
  await row(ANN).click();
  await page.locator('.chat-day .chat-day-pill').last().click();
  await page.locator('.calendar').waitFor({ timeout: 5000 });
  const withThree = await show(keyOf(daysAgo(2)));
  await until(
    async () => (await withThree.getAttribute('data-count')) === '3',
    'the count of a day'
  );
  assert(!(await withThree.isDisabled()), 'a day with messages opens');
  assert(
    (await withThree.getAttribute('title')) === 'Messages: 3',
    'its title says how many'
  );
  const empty = await show(keyOf(daysAgo(3)));
  assert(await empty.isDisabled(), 'a day without messages is closed');
  assert(asked.before[0] === 0, `newest page first: ${asked.before}`);
  // An earlier month: read with an earlier offset date.
  const old = await show(keyOf(daysAgo(70)));
  await until(
    async () => (await old.getAttribute('data-count')) === '1',
    'the earlier month counted'
  );
  assert(
    asked.before.some((b) => b > 0),
    `an earlier offset date asked: ${asked.before}`
  );
  const gap = await show(keyOf(daysAgo(60)));
  assert(await gap.isDisabled(), 'an earlier day without messages is closed');
  await page.locator('.calendar .btn').click();
};

const peopleSteps = async () => {
  const strip = page.locator('[data-top-peers="on"]');
  await page.locator('.chat-search').focus();
  await strip.waitFor({ timeout: 5000 });
  assert(
    (await strip.locator('[data-top-peer]').count()) === 2,
    'two frequent contacts'
  );
  // A right click removes one from the list.
  await strip.locator(`[data-top-peer="${BOB}"]`).click({ button: 'right' });
  await page.locator('[data-action="top-remove"]').click();
  await until(() => asked.removed.includes(BOB), 'remove asked');
  await until(
    async () => (await strip.locator(`[data-top-peer="${BOB}"]`).count()) === 0,
    'Bob gone from the strip'
  );
  // Typing hides the strip; emptying shows it again.
  await page.locator('.chat-search').fill('ann');
  await until(
    async () => (await page.locator('[data-top-peers]').count()) === 0,
    'the strip hidden while typing'
  );
  await page.locator('.chat-search').fill('');
  await strip.waitFor({ timeout: 5000 });
  // Turned off, one line offers it back.
  await strip.locator(`[data-top-peer="${ANN}"]`).click({ button: 'right' });
  await page.locator('[data-action="top-off"]').click();
  await until(() => asked.toggled.includes(false), 'turn off asked');
  const off = page.locator('[data-top-peers="off"]');
  await off.waitFor({ timeout: 5000 });
  await off.locator('[data-action="top-on"]').click();
  await until(() => asked.toggled.at(-1) === true, 'turn on asked');
  await page.locator('[data-top-peers="on"]').waitFor({ timeout: 5000 });
  // A click opens the person's chat.
  await page.locator(`[data-top-peer="${ANN}"]`).click();
  await until(
    async () =>
      (await page.locator('.chat-header-title').textContent())?.includes(
        'Ann Lee'
      ),
    'the person opens'
  );
};

const clearSteps = async () => {
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-privacy"]').click();
  const dialog = page.locator('[data-dialog="privacy"]');
  const button = dialog.locator('[data-action="drafts-clear"]');
  await button.waitFor({ timeout: 5000 });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  // Asked first: nothing is cleared before the confirmation.
  await page.locator('[data-drafts-confirm]').waitFor({ timeout: 5000 });
  assert(asked.clear === 0, 'nothing cleared before the confirmation');
  await page.locator('[data-action="drafts-cancel"]').click();
  assert(asked.clear === 0, 'Cancel clears nothing');
  // Escape closes only the question, not the Privacy dialog under it.
  await button.click();
  await page.locator('[data-drafts-confirm]').waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await page
    .locator('[data-drafts-confirm]')
    .waitFor({ state: 'detached', timeout: 5000 });
  assert(await dialog.isVisible(), 'the Privacy dialog stays');
  assert(asked.clear === 0, 'Escape clears nothing');
  await button.click();
  await page.locator('[data-action="drafts-confirm"]').click();
  await until(() => asked.clear === 1, 'clear asked once');
  await dialog.locator('[data-drafts-note="done"]').waitFor({ timeout: 5000 });
};

await finish(async () => {
  await draftsSteps();
  await calendarSteps();
  await peopleSteps();
  await clearSteps();
});
