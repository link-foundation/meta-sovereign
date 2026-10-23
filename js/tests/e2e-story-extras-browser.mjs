// Real browser e2e for the remaining story features (R-Y199), as Telegram
// Desktop has them: "Stealth mode" in a story's menu (a dialog that says
// what it hides, a Premium error shown as text, the time left while it is
// on, the badge over the story, the wait while it cools down); "Report
// story" walking Telegram's reasons through the chat report's dialog; one's
// own story's counter refreshed when it is opened; its viewers with a
// "Reactions" tab (reposts as entries), a search box and the "Contacts only"
// / "Reactions first" switches. Telegram's answers faked in the page, fake
// chats in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`; run
// it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:story-extras

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const ME = '7';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${ANN}:1`,
  source: 'telegram',
  chat: ANN,
  chatName: 'Ann Lee',
  chatType: 'private',
  sender: ANN,
  senderName: 'Ann Lee',
  body: 'hello',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const NOW = Math.floor(Date.now() / 1000);
const photo = { kind: 'photo' };
const story = (id, extra = {}) => ({
  id,
  date: NOW - 60,
  caption: `caption ${id}`,
  entities: [],
  media: photo,
  ...extra,
});
const STORIES = {
  [ANN]: [story(11)],
  [ME]: [story(31, { mine: true, views: 52, reactions: 2 })],
};
const head = (peer, name, extra = {}) => ({
  peer,
  name,
  self: false,
  count: STORIES[peer].length,
  lastId: STORIES[peer].at(-1).id,
  maxReadId: 0,
  unread: true,
  ...extra,
});
const PEERS = [
  head(ME, 'Me', { self: true, unread: false }),
  head(ANN, 'Ann Lee'),
];
const entry = (kind, n, extra = {}) => ({
  kind,
  user: String(kind === 'view' ? 1000 + n : -1000 - n),
  name: `${kind} ${n}`,
  date: NOW - n,
  reaction: '',
  ...extra,
});

const { base, page, until, finish } = await openChatApp('story-extras', {
  store,
});
await page.addInitScript(() => {
  // A picture stays long enough to be acted on.
  globalThis.__STORY_PHOTO_MS__ = 120_000;
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/stories', (route) =>
  fulfil(route, {
    ok: true,
    peers: route.request().postDataJSON()?.hidden ? [] : PEERS,
    state: 'S',
    more: false,
    stealth: { activeUntil: 0, cooldownUntil: 0 },
  })
);
await page.route('**/api/telegram/stories-peer', (route) => {
  const { chat } = route.request().postDataJSON();
  const peer = PEERS.find((p) => p.peer === chat);
  return fulfil(route, { ok: true, peer, stories: STORIES[chat] ?? [] });
});
await page.route('**/api/telegram/stories-read', (route) =>
  fulfil(route, { ok: true })
);
await page.route(/\/api\/telegram\/story\?/, (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
const sent = { stealth: [], report: [], fresh: [], views: [], reactions: [] };
const record = (name, list, answer) =>
  page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    list.push(body);
    return fulfil(route, answer(body, list.length));
  });
// The first try is a free account's; the second turns it on for 3 seconds.
await record('story-stealth', sent.stealth, (_b, n) =>
  n === 1
    ? { ok: false, error: 'PREMIUM_ACCOUNT_REQUIRED', code: 'premium' }
    : {
        ok: true,
        stealth: {
          activeUntil: Math.floor(Date.now() / 1000) + 3,
          cooldownUntil: Math.floor(Date.now() / 1000) + 3600,
        },
      }
);
await record('story-report', sent.report, (b) => {
  if (!b.option) {
    return {
      ok: true,
      result: 'choose',
      title: 'Why?',
      options: [{ text: 'Spam', option: 'AQID' }],
    };
  }
  return b.message
    ? { ok: true, result: 'reported' }
    : { ok: true, result: 'comment', optional: false, option: b.option };
});
await record('stories-views', sent.fresh, (b) => ({
  ok: true,
  stories: b.ids.map((id) => ({ id, views: 77, reactions: 5, forwards: 1 })),
}));
await record('story-views', sent.views, () => ({
  ok: true,
  views: [entry('view', 1, { reaction: '🔥' }), entry('view', 2)],
  next: '',
  viewsCount: 77,
}));
await record('story-reactions', sent.reactions, () => ({
  ok: true,
  views: [entry('view', 3, { reaction: '❤' }), entry('repost', 4)],
  next: '',
}));

const view = page.locator('[data-story-viewer]');
const waitAt = (want) =>
  until(
    async () =>
      (await view.count()) === 1 &&
      [
        await view.getAttribute('data-story-viewer'),
        await view.getAttribute('data-story'),
      ].join(':') === want,
    want
  );
const closeView = async () => {
  await page.keyboard.press('Escape');
  await until(async () => (await view.count()) === 0, 'closed');
};
const menu = async (action) => {
  await view.locator('[data-action="story-menu"]').click();
  await view.locator(`[data-action="${action}"]`).click();
};

const stealth = async () => {
  // 1. Stealth mode: explained, a Premium error as text, then on with the
  // time left and a badge, then the wait.
  await page.goto(`${base}/`);
  await until(
    async () => (await page.locator('[data-story-peer]').count()) === 2,
    'two peers in the strip'
  );
  await page.locator(`[data-story-peer="${ANN}"]`).click();
  await waitAt(`${ANN}:11`);
  await menu('story-stealth');
  const dialog = page.locator('[data-dialog="story-stealth"]');
  await until(async () => (await dialog.count()) === 1, 'the dialog');
  const text = await dialog.textContent();
  assert(text.includes('Hide recent views (past 5 minutes)'), 'past explained');
  assert(text.includes('Hide my next views (25 minutes)'), 'future explained');
  assert((await view.getAttribute('data-paused')) === 'true', 'paused');
  const enable = dialog.locator('[data-action="story-stealth-enable"]');
  assert((await enable.textContent()) === 'Enable stealth mode', 'button');
  await enable.click();
  await until(() => sent.stealth.length === 1, 'first try sent');
  assert(
    JSON.stringify(sent.stealth[0]) ===
      JSON.stringify({ past: true, future: true }),
    `stealth body: ${JSON.stringify(sent.stealth[0])}`
  );
  const error = dialog.locator('[data-stealth-error="premium"]');
  await until(async () => (await error.count()) === 1, 'the Premium error');
  assert(
    (await error.textContent()).includes('Telegram Premium'),
    'a clear Premium message'
  );
  await enable.click();
  await until(() => sent.stealth.length === 2, 'second try sent');
  await until(
    async () => (await dialog.locator('[data-stealth="on"]').count()) === 1,
    'time left shown'
  );
  assert(await enable.isDisabled(), 'no second use while it cools down');
  await dialog.locator('[data-action="cancel"]').click();
  await until(async () => (await dialog.count()) === 0, 'dialog closed');
  await until(
    async () => (await view.locator('[data-stealth-badge]').count()) === 1,
    'the badge over the story'
  );
  // Three seconds on, it is over; the wait shows.
  await until(
    async () => (await view.locator('[data-stealth-badge]').count()) === 0,
    'the badge goes'
  );
  await menu('story-stealth');
  await until(
    async () =>
      (await dialog.locator('[data-stealth="cooldown"]').count()) === 1,
    'the cooldown shown'
  );
  assert(await enable.isDisabled(), 'disabled during the cooldown');
  await dialog.locator('[data-action="cancel"]').click();
};

const reports = async () => {
  // 2. Report story: the chat report's own dialog and walk.
  await menu('story-report');
  const dialog = page.locator('[data-dialog="report"]');
  await until(async () => (await dialog.count()) === 1, 'the report dialog');
  const reason = dialog.locator('[data-action="report-reason"]');
  await until(async () => (await reason.count()) === 1, 'reasons');
  assert(
    JSON.stringify(sent.report[0]) === JSON.stringify({ chat: ANN, id: 11 }),
    `first body: ${JSON.stringify(sent.report[0])}`
  );
  await reason.click();
  const words = dialog.locator('textarea');
  await until(async () => (await words.count()) === 1, 'asks for words');
  assert(sent.report[1].option === 'AQID', 'the chosen option is sent back');
  await words.fill('rude');
  await dialog.locator('[data-action="report-send"]').click();
  await until(
    async () => (await dialog.locator('[data-report="done"]').count()) === 1,
    'reported'
  );
  assert(
    sent.report[2].message === 'rude' && sent.report[2].id === 11,
    `last body: ${JSON.stringify(sent.report[2])}`
  );
  await dialog.locator('[data-action="cancel"]').click();
  await closeView();
};

const own = async () => {
  // 3. One's own story: the counter is refreshed; the viewers have tabs,
  // a search box and switches.
  await page.locator(`[data-story-peer="${ME}"]`).click();
  await waitAt(`${ME}:31`);
  const views = view.locator('[data-action="story-views"]');
  await until(
    async () => (await views.textContent()) === '77 views',
    'the fresh counter'
  );
  assert(
    JSON.stringify(sent.fresh[0]) === JSON.stringify({ chat: ME, ids: [31] }),
    `fresh body: ${JSON.stringify(sent.fresh[0])}`
  );
  await views.click();
  const rows = view.locator('[data-viewer]');
  await until(async () => (await rows.count()) === 2, 'two viewers');
  assert(sent.views[0].q === undefined, 'no search yet');
  await view.locator('[data-viewers-search="input"]').fill('vie');
  await until(() => sent.views.some((b) => b.q === 'vie'), 'search sent');
  await view.locator('[data-viewers-filter="contacts"]').check();
  await until(
    () => sent.views.some((b) => b.q === 'vie' && b.justContacts === true),
    'contacts only sent'
  );
  await view.locator('[data-viewers-filter="reactionsFirst"]').check();
  await until(
    () => sent.views.some((b) => b.reactionsFirst === true),
    'reactions first sent'
  );
  await view.locator('[data-viewers-tab="reactions"]').click();
  await until(() => sent.reactions.length === 1, 'reactions asked');
  assert(
    JSON.stringify(sent.reactions[0]) === JSON.stringify({ chat: ME, id: 31 }),
    `reactions body: ${JSON.stringify(sent.reactions[0])}`
  );
  const repost = view.locator('[data-viewer-kind="repost"]');
  await until(async () => (await repost.count()) === 1, 'a repost entry');
  assert(
    (await repost.textContent()).includes('Reposted'),
    'the entry says it is a repost'
  );
  assert(
    (await view.locator('[data-viewers-search="input"]').count()) === 0,
    'no search on the reactions tab'
  );
  await view.locator('[data-action="story-viewers-close"]').click();
};

await finish(async () => {
  await stealth();
  await reports();
  await own();
});
