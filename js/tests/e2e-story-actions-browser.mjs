// Real browser e2e for story interactions (R-Y148), as Telegram Desktop
// has them: a ring on the chat row of someone with stories opens them
// (a click on the avatar); a private reply box (playback waits while it
// is used) sends with the story as the reply-to; a heart and a small
// picker send reactions and take them back; one's own story shows its
// views and the viewers with their reactions (50 a page, "load more")
// and asks before deleting; "Hide stories" / "Unhide" move a person to
// and from the hidden list of the strip. Telegram's answers faked in the
// page, fake chats in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:story-actions

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const ME = '7';
const store = createMemoryStore();
for (const [chat, name] of [
  [ANN, 'Ann Lee'],
  [BOB, 'Bob Ray'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'private',
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

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
  [ANN]: [story(11), story(12)],
  [BOB]: [story(21, { reaction: '🔥' })],
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
  head(ANN, 'Ann Lee', { maxReadId: 10 }),
  head(BOB, 'Bob Ray'),
];
const viewer = (n) => ({
  user: String(1000 + n),
  name: `Viewer ${n}`,
  date: NOW - n,
  reaction: n === 1 ? '🔥' : '',
});

const { base, page, until, finish } = await openChatApp('story-actions', {
  store,
});
await page.addInitScript(() => {
  // A picture stays long enough to be acted on.
  globalThis.__STORY_PHOTO_MS__ = 60_000;
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignStoriesEnabled', 'on');
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
const sent = { reply: [], react: [], views: [], remove: [], hide: [] };
await page.route('**/api/telegram/stories', (route) =>
  fulfil(route, {
    ok: true,
    peers: route.request().postDataJSON()?.hidden ? [] : PEERS,
    state: 'S',
    more: false,
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
const record = (name, list, answer) =>
  page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    list.push(body);
    return fulfil(route, answer(body));
  });
await record('story-reply', sent.reply, () => ({ ok: true }));
await record('story-react', sent.react, (b) => ({
  ok: true,
  reaction: b.reaction,
}));
await record('story-delete', sent.remove, () => ({ ok: true }));
await record('stories-hide', sent.hide, (b) => ({
  ok: true,
  hidden: b.hidden,
}));
await record('story-views', sent.views, (b) =>
  b.offset
    ? { ok: true, views: [viewer(51), viewer(52)], next: '', viewsCount: 52 }
    : {
        ok: true,
        views: Array.from({ length: 50 }, (_, i) => viewer(i + 1)),
        next: 'N1',
        viewsCount: 52,
      }
);

const view = page.locator('[data-story-viewer]');
const at = async () =>
  [
    await view.getAttribute('data-story-viewer'),
    await view.getAttribute('data-story'),
  ].join(':');
const waitAt = (want) =>
  until(async () => (await view.count()) === 1 && (await at()) === want, want);
const closeView = async () => {
  await page.keyboard.press('Escape');
  await until(async () => (await view.count()) === 0, 'closed');
};
const heart = view.locator('[data-action="story-react"]');
const now = () => heart.getAttribute('data-reaction-now');

const opens = async () => {
  await page.goto(`${base}/`);
  await until(
    async () => (await page.locator('[data-story-peer]').count()) === 3,
    'three peers in the strip'
  );

  // 1. A ring on the chat row; a click on it opens the viewer.
  const ring = page.locator(`.chat-item-ring[data-story-ring="${ANN}"]`);
  await until(async () => (await ring.count()) === 1, 'a ring on the row');
  assert(
    (await ring.getAttribute('data-story-state')) === 'unread',
    'an unread ring'
  );
  await ring.click();
  await waitAt(`${ANN}:11`);
  // (Seen up to 11 now: it opens again at 12.)
  await closeView();
};

const replies = async () => {
  // 2. Reply: playback waits while the box is focused; the body is the
  // story's; the box clears.
  await page.locator(`[data-story-peer="${ANN}"]`).click();
  await waitAt(`${ANN}:12`);
  const input = view.locator('[data-story-reply="input"]');
  assert(
    (await input.getAttribute('placeholder')) === 'Reply privately…',
    'placeholder'
  );
  await input.focus();
  assert((await view.getAttribute('data-paused')) === 'true', 'paused');
  await input.fill('nice one');
  await input.press('Enter');
  await until(() => sent.reply.length === 1, 'reply sent');
  assert(
    JSON.stringify(sent.reply[0]) ===
      JSON.stringify({ chat: ANN, id: 12, text: 'nice one' }),
    `reply body: ${JSON.stringify(sent.reply[0])}`
  );
  await until(async () => (await input.inputValue()) === '', 'box cleared');
  await until(
    async () => (await view.getAttribute('data-paused')) === 'false',
    'playing again'
  );
};

const reacts = async () => {
  // 3. The heart: a quick like, a second press takes it back; the picker.
  assert((await now()) === '', 'no reaction yet');
  await heart.click();
  await until(() => sent.react.length === 1, 'like sent');
  assert(sent.react[0].reaction === '❤', `like: ${sent.react[0].reaction}`);
  assert(sent.react[0].chat === ANN && sent.react[0].id === 12, 'which story');
  await until(async () => (await now()) === '❤', 'liked');
  await heart.click();
  await until(() => sent.react.length === 2, 'unlike sent');
  assert(sent.react[1].reaction === '', 'ReactionEmpty is an empty string');
  await view.locator('[data-action="story-react-more"]').click();
  assert((await view.getAttribute('data-paused')) === 'true', 'picker pauses');
  await view.locator('[data-reaction="🎉"]').click();
  await until(() => sent.react.length === 3, 'emoji sent');
  assert(sent.react[2].reaction === '🎉', 'the picked emoji');
  await until(async () => (await now()) === '🎉', 'emoji shown');
  await view.locator('[data-action="story-react-more"]').click();
  await view.locator('[data-reaction="🎉"]').click();
  await until(() => sent.react.length === 4, 'emoji taken back');
  assert(sent.react[3].reaction === '', 'second press removes it');
  await closeView();
};

const hides = async () => {
  // 4. Hide: Ann leaves the strip for the hidden list; Unhide brings her back.
  await page.locator(`[data-story-peer="${ANN}"]`).click();
  await waitAt(`${ANN}:11`);
  await view.locator('[data-action="story-menu"]').click();
  assert(
    (await view.locator('[data-action="story-hide"]').textContent()) ===
      'Hide stories',
    'hide item'
  );
  await view.locator('[data-action="story-hide"]').click();
  await until(() => sent.hide.length === 1, 'hide sent');
  assert(
    JSON.stringify(sent.hide[0]) ===
      JSON.stringify({ chat: ANN, hidden: true }),
    `hide body: ${JSON.stringify(sent.hide[0])}`
  );
  await closeView();
  await until(
    async () =>
      (await page.locator(`[data-story-peer="${ANN}"]`).count()) === 0,
    'Ann left the strip'
  );
  assert(
    (await page
      .locator(`.chat-item-ring[data-story-ring="${ANN}"]`)
      .count()) === 0,
    'no ring for hidden stories'
  );
  const toggle = page.locator('[data-action="stories-hidden"]');
  assert((await toggle.textContent()) === 'Hidden stories (1)', 'hidden count');
  await toggle.click();
  await page.locator(`[data-story-peer="${ANN}"]`).click();
  await waitAt(`${ANN}:11`);
  await view.locator('[data-action="story-menu"]').click();
  assert(
    (await view.locator('[data-action="story-hide"]').textContent()) ===
      'Unhide stories',
    'unhide item'
  );
  await view.locator('[data-action="story-hide"]').click();
  await until(() => sent.hide.length === 2, 'unhide sent');
  assert(sent.hide[1].hidden === false, 'unhide body');
  await closeView();
  await page.locator('[data-action="stories-hidden"]').click();
  await until(
    async () =>
      (await page.locator(`[data-story-peer="${ANN}"]`).count()) === 1,
    'Ann is back'
  );
};

const bobReaction = async () => {
  // Bob's own reaction from before shows in the heart.
  await page.locator(`[data-story-peer="${BOB}"]`).click();
  await waitAt(`${BOB}:21`);
  assert((await now()) === '🔥', 'the reaction already sent');
  await closeView();
};

const own = async () => {
  // 5. One's own story: views, the viewers (50, then more), delete asks first.
  await page.locator(`[data-story-peer="${ME}"]`).click();
  await waitAt(`${ME}:31`);
  assert(
    (await view.locator('[data-story-reply="input"]').count()) === 0,
    'no reply box on one’s own story'
  );
  const views = view.locator('[data-action="story-views"]');
  assert((await views.textContent()) === '52 views', 'views count');
  await views.click();
  const rows = view.locator('[data-viewer]');
  await until(async () => (await rows.count()) === 50, 'fifty viewers');
  assert(sent.views[0].offset === undefined, 'the first page has no offset');
  assert(
    (await rows.first().locator('.story-viewer-reaction').textContent()) ===
      '🔥',
    'a viewer’s reaction'
  );
  await view.locator('[data-action="story-viewers-more"]').click();
  await until(async () => (await rows.count()) === 52, 'load more');
  assert(sent.views[1].offset === 'N1', 'the next page by offset');
  assert(
    (await view.locator('[data-action="story-viewers-more"]').count()) === 0,
    'no more to load'
  );
  await view.locator('[data-action="story-viewers-close"]').click();

  await view.locator('[data-action="story-delete"]').click();
  assert(
    (await view.locator('[data-story-confirm]').count()) === 1,
    'asks first'
  );
  await view.locator('[data-action="story-delete-no"]').click();
  assert(sent.remove.length === 0, 'No deletes nothing');
  await view.locator('[data-action="story-delete"]').click();
  await view.locator('[data-action="story-delete-yes"]').click();
  await until(() => sent.remove.length === 1, 'delete sent');
  assert(
    JSON.stringify(sent.remove[0]) === JSON.stringify({ chat: ME, id: 31 }),
    `delete body: ${JSON.stringify(sent.remove[0])}`
  );
  // It was the only story: the viewer goes on to the next person.
  await until(
    async () => (await view.count()) === 1 && !(await at()).startsWith(ME),
    'on to the next person'
  );
};

await finish(async () => {
  await opens();
  await replies();
  await reacts();
  await hides();
  await bobReaction();
  await own();
});
