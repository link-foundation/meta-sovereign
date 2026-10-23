// Real browser e2e for the statistics of channels and groups (R-Y167), as
// Telegram Desktop shows them to admins: the info column offers
// "Statistics" only when Telegram says the user can view them; the dialog
// shows the overview with the change from the previous period, a graph
// drawn as SVG paths, a graph Telegram sends as a token loaded when it
// scrolls into view, a legend toggle that hides a line, a tooltip with the
// date and values on hover, a click that zooms into a day; a supergroup
// shows its top posters; no entry for a non-admin. Telegram's answers
// faked in the page, fake chats in a memory store, a server on a free port,
// a headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:stats

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHANNEL = '-1001';
const GROUP = '-1002';
const PLAIN = '-1003';
const CHATS = [
  [CHANNEL, 'News Channel', 'channel'],
  [GROUP, 'Big Group', 'supergroup'],
  [PLAIN, 'Other Channel', 'channel'],
];
const INFO = {
  [CHANNEL]: {
    kind: 'channel',
    title: 'News Channel',
    broadcast: true,
    canViewStats: true,
  },
  [GROUP]: { kind: 'channel', title: 'Big Group', canViewStats: true },
  [PLAIN]: {
    kind: 'channel',
    title: 'Other Channel',
    broadcast: true,
    canViewStats: false,
  },
};
const store = createMemoryStore();
for (const [chat, name, type] of CHATS) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

const DAY = 86_400_000;
const START = Date.UTC(2024, 0, 1);
const days = Array.from({ length: 14 }, (_, i) => START + i * DAY);
const chart = (types) => ({
  columns: [
    ['x', ...days],
    ['y0', ...days.map((_, i) => 10 + i * 3)],
    ['y1', ...days.map((_, i) => 4 + (i % 4))],
  ],
  types: { x: 'x', y0: types, y1: types },
  names: { y0: 'Joined', y1: 'Left' },
  colors: { y0: '#3497ed', y1: '#e65850' },
});
const hours = Array.from({ length: 24 }, (_, i) => START + i * 3_600_000);
const hourly = {
  columns: [
    ['x', ...hours],
    ['y0', ...hours.map((_, i) => 5 + i)],
  ],
  types: { x: 'x', y0: 'line' },
  names: { y0: 'Joined' },
  colors: { y0: '#3497ed' },
};
const BROADCAST = {
  ok: true,
  kind: 'broadcast',
  period: { from: START / 1000, to: (START + 13 * DAY) / 1000 },
  overview: [
    { key: 'followers', current: 1234, previous: 1000 },
    { key: 'viewsPerPost', current: 50, previous: 60 },
    { key: 'sharesPerPost', current: 3, previous: 3 },
    { key: 'reactionsPerPost', current: 7, previous: 5 },
  ],
  notifications: { part: 25, total: 100 },
  graphs: [
    {
      key: 'growth',
      graph: { json: JSON.stringify(chart('line')), zoom: 'zoom-growth' },
    },
    { key: 'followers', graph: { token: 'tok-followers' } },
    { key: 'interactions', graph: { json: JSON.stringify(chart('bar')) } },
    { key: 'mute', graph: { error: 'Not enough data' } },
  ],
  posts: [
    { id: 9, views: 1500, forwards: 12, reactions: 40, text: 'Fresh news' },
  ],
};
const MEGAGROUP = {
  ok: true,
  kind: 'megagroup',
  period: BROADCAST.period,
  overview: [
    { key: 'members', current: 500, previous: 400 },
    { key: 'messages', current: 80, previous: 90 },
    { key: 'viewers', current: 30, previous: 30 },
    { key: 'posters', current: 10, previous: 12 },
  ],
  graphs: [{ key: 'members', graph: { json: JSON.stringify(chart('line')) } }],
  posters: [{ id: '11', name: 'Ann Lee', messages: 40, avgChars: 55 }],
  admins: [{ id: '12', name: 'Boss', deleted: 1, kicked: 2, banned: 3 }],
  inviters: [{ id: '13', name: 'Cara', invitations: 6 }],
};

const { base, page, until, finish } = await openChatApp('stats', { store });
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, ...(INFO[chat] ?? {}) });
});
const statsAsks = [];
await page.route('**/api/telegram/chat-stats', (route) => {
  const body = route.request().postDataJSON();
  statsAsks.push(body);
  return fulfil(route, body.chat === GROUP ? MEGAGROUP : BROADCAST);
});
const graphAsks = [];
await page.route('**/api/telegram/stats-graph', (route) => {
  const body = route.request().postDataJSON();
  graphAsks.push(body);
  return fulfil(route, {
    ok: true,
    graph: {
      json: JSON.stringify(body.x ? hourly : chart('area')),
    },
  });
});

const row = page.locator('.person-panel [data-action="stats-open"]');
const dialog = page.locator('[data-dialog="stats"]');
const openAbout = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  const about = page.locator('.person-panel');
  if ((await about.count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  await about.waitFor({ timeout: 10000 });
  await until(
    async () => (await page.locator('.person-panel-body').count()) > 0,
    'the panel'
  );
};
const card = (key) => dialog.locator(`[data-graph="${key}"]`);

await finish(async () => {
  await page.goto(`${base}/`);

  // A channel admin: the overview, with its changes.
  await openAbout(CHANNEL);
  await row.waitFor({ timeout: 10000 });
  await row.click();
  await dialog.locator('[data-figure="followers"]').waitFor({ timeout: 5000 });
  assert(statsAsks.length === 1 && statsAsks[0].chat === CHANNEL, 'asked');
  const followers = dialog.locator('[data-figure="followers"]');
  const text = await followers.textContent();
  assert(
    text.includes('1,234') && text.includes('+234'),
    `followers figure: ${text}`
  );
  assert(
    (await followers.locator('[data-change="up"]').count()) === 1,
    'followers went up'
  );
  assert(
    (await dialog
      .locator('[data-figure="viewsPerPost"] [data-change="down"]')
      .count()) === 1,
    'views went down'
  );
  const notifications = await dialog
    .locator('[data-figure="notifications"]')
    .textContent();
  assert(notifications.includes('25%'), `notifications: ${notifications}`);

  // A graph drawn as SVG paths.
  const growth = card('growth');
  await growth
    .locator('svg path[data-shape]')
    .first()
    .waitFor({ timeout: 5000 });
  assert(
    (await growth.locator('svg path[data-shape]').count()) === 2,
    'two lines drawn'
  );
  const d = await growth.locator('path[data-shape="y0"]').getAttribute('d');
  assert(/^M[\d.]+,[\d.]+L/.test(d), `a path: ${d}`);
  const bars = card('interactions');
  await bars.scrollIntoViewIfNeeded();
  assert((await bars.locator('svg rect').count()) >= 14, 'bars drawn');

  // The failing graph says why.
  await card('mute').scrollIntoViewIfNeeded();
  const failed = await card('mute').textContent();
  assert(failed.includes('Not enough data'), `error graph: ${failed}`);

  // The token graph loads when it comes into view.
  const async = card('followers');
  await async.scrollIntoViewIfNeeded();
  await async
    .locator('svg path[data-shape]')
    .first()
    .waitFor({ timeout: 5000 });
  assert(
    graphAsks.some((a) => a.token === 'tok-followers' && a.x === undefined),
    `async graph asked: ${JSON.stringify(graphAsks)}`
  );

  // A legend toggle hides a line (and shows it again).
  await growth.scrollIntoViewIfNeeded();
  await growth.locator('[data-legend="y1"]').click();
  await until(
    async () => (await growth.locator('svg path[data-shape]').count()) === 1,
    'the line hides'
  );
  assert(
    (await growth
      .locator('[data-legend="y1"]')
      .getAttribute('aria-pressed')) === 'false',
    'legend shows it off'
  );
  await growth.locator('[data-legend="y1"]').click();
  await until(
    async () => (await growth.locator('svg path[data-shape]').count()) === 2,
    'the line shows again'
  );

  // A tooltip with the date and the values on hover.
  await growth.locator('svg').hover();
  const tip = growth.locator('[data-stats-tooltip]');
  await tip.waitFor({ timeout: 5000 });
  const tipText = await tip.textContent();
  assert(
    tipText.includes('Joined') &&
      tipText.includes('Left') &&
      /2024/.test(tipText),
    `tooltip: ${tipText}`
  );

  // A click zooms into a day through the zoom token; Back returns.
  await growth.locator('svg').click();
  await until(
    async () =>
      (await growth.locator('[data-action="stats-unzoom"]').count()) === 1,
    'zoomed'
  );
  const zoom = graphAsks.find((a) => a.token === 'zoom-growth');
  assert(zoom && /^\d+$/.test(zoom.x), `zoom asked: ${JSON.stringify(zoom)}`);
  await growth.locator('[data-action="stats-unzoom"]').click();
  await until(
    async () =>
      (await growth.locator('[data-action="stats-unzoom"]').count()) === 0,
    'unzoomed'
  );

  // The recent posts.
  const posts = await dialog.locator('[data-stats-posts]').textContent();
  assert(
    posts.includes('Fresh news') && posts.includes('1.5K'),
    `posts: ${posts}`
  );
  await dialog.locator('[data-action="close"]').click();
  await until(async () => (await dialog.count()) === 0, 'the dialog closes');

  // A supergroup: its top posters.
  await openAbout(GROUP);
  await row.waitFor({ timeout: 10000 });
  await row.click();
  await dialog.locator('[data-stats-top="posters"]').waitFor({ timeout: 5000 });
  const top = await dialog.locator('[data-stats-top="posters"]').textContent();
  assert(top.includes('Ann Lee') && top.includes('40'), `top posters: ${top}`);
  assert(
    (await dialog.locator('[data-stats-top="admins"]').count()) === 1 &&
      (await dialog.locator('[data-stats-top="inviters"]').count()) === 1,
    'top admins and inviters'
  );
  await dialog.locator('[data-action="close"]').click();

  // A non-admin sees no entry.
  await openAbout(PLAIN);
  await page.waitForTimeout(500);
  assert((await row.count()) === 0, 'no Statistics row for a non-admin');
});
