// Real browser e2e for managing a forum's topics (R-Y153), as Telegram
// Desktop does: a "+" makes a topic (its name and colour posted, the new
// topic shown); a right-click offers Edit (renames it), Close (a lock in
// the strip, and for a member who cannot manage topics the composer is
// replaced by "The topic is closed"), Pin (the topic moves up) and Delete
// (asked first). Telegram's answers faked in the page, a fake forum in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:topic-admin

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const FORUM = '-1009';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${FORUM}:1`,
  source: 'telegram',
  chat: FORUM,
  chatName: 'Fake Forum',
  chatType: 'channel',
  sender: '77',
  senderName: 'Fake Erin',
  body: 'welcome to general',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});
await store.put({
  id: `read:telegram:${FORUM}`,
  tokens: ['read', 'telegram', FORUM],
  kind: 'read',
  source: 'telegram',
  chat: FORUM,
  inboxMaxId: 1,
  forum: 1,
});

const { base, page, until, finish } = await openChatApp('topic-admin', {
  store,
});

// The fake forum: topics changed by the routes below.
const topic = (id, title, extra = {}) => ({
  id,
  title,
  iconColor: 0x6fb9f0,
  iconEmojiId: null,
  top: id,
  unread: 0,
  readInboxMaxId: 100,
  mentions: 0,
  pinned: false,
  closed: false,
  hidden: false,
  mine: false,
  at: null,
  last: null,
  ...extra,
});
let topics = [topic(1, 'General'), topic(2, 'Design'), topic(3, 'Release')];
let admin = true;
const calls = { create: [], edit: [], pin: [], remove: [] };
const ordered = () => [
  ...topics.filter((t) => t.pinned),
  ...topics.filter((t) => !t.pinned),
];
const change = (id, fields) => {
  topics = topics.map((t) => (t.id === id ? { ...t, ...fields } : t));
};

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
await page.route('**/api/telegram/read', (route) =>
  fulfil(route, { ok: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: FORUM,
    kind: 'channel',
    title: 'Fake Forum',
    forum: true,
    topics: admin
      ? { manage: true, create: true, delete: true }
      : { manage: false, create: false, delete: false },
  })
);
await page.route('**/api/telegram/forum-topics', (route) =>
  fulfil(route, { ok: true, forum: true, topics: ordered() })
);
await page.route('**/api/telegram/topic-icons', (route) =>
  fulfil(route, { ok: true, icons: [{ id: '11', emoji: '💡' }] })
);
await page.route('**/api/telegram/topic-create', (route) => {
  const body = route.request().postDataJSON();
  calls.create.push(body);
  topics = [
    ...topics,
    topic(9, body.title, {
      iconColor: body.iconColor,
      iconEmojiId: body.iconEmojiId ?? null,
    }),
  ];
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/topic-edit', (route) => {
  const body = route.request().postDataJSON();
  calls.edit.push(body);
  change(body.topic, {
    ...(body.title === undefined ? {} : { title: body.title }),
    ...(body.closed === undefined ? {} : { closed: body.closed }),
  });
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/topic-pin', (route) => {
  const body = route.request().postDataJSON();
  calls.pin.push(body);
  change(body.topic, { pinned: body.pinned });
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/topic-delete', (route) => {
  const body = route.request().postDataJSON();
  calls.remove.push(body);
  topics = topics.filter((t) => t.id !== body.topic);
  return fulfil(route, { ok: true });
});

const strip = page.locator('nav.chat-topics');
const tab = (id) => strip.locator(`[data-topic="${id}"]`);
const order = () =>
  strip
    .locator('[data-topic]')
    .evaluateAll((all) => all.map((n) => n.dataset.topic).join());
const menu = (action) =>
  page.locator(`.msg-context-menu [data-action="${action}"]`);
const rightClick = async (id) => {
  await tab(id).click({ button: 'right' });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
};
const openForum = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${FORUM}"]`).click();
  await strip.waitFor({ timeout: 10000 });
};

// A member who cannot manage topics: no "+", no menu, and a closed
// topic's composer is replaced.
const memberChecks = async () => {
  admin = false;
  await openForum();
  assert(
    (await strip.locator('[data-action="topic-new"]').count()) === 0,
    'no + for a member who may not create'
  );
  await tab(3).click({ button: 'right' });
  await page.waitForTimeout(200);
  assert((await page.locator('.msg-context-menu').count()) === 0, 'no menu');
  await tab(2).click();
  await page.locator('.topic-closed-bar').waitFor({ timeout: 5000 });
  assert(
    (await page.locator('.topic-closed-bar').textContent()) ===
      'The topic is closed',
    'the bar says so'
  );
  assert(
    (await page.locator('.chat-composer textarea').count()) === 0,
    'the composer is gone'
  );
  await tab(3).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 5000 });
};

await finish(async () => {
  await openForum();
  assert((await order()) === 'all,1,2,3', `tabs: ${await order()}`);

  // Create: the name and the chosen colour are posted; the topic appears.
  await strip.locator('[data-action="topic-new"]').click();
  const create = page.locator('[data-dialog="topic-create"]');
  await create.waitFor({ timeout: 5000 });
  await create.locator('[data-field="title"]').fill('Ideas');
  await create.locator('[data-color="16766590"]').click(); // 0xffd67e
  await create.locator('[data-icon-emoji="11"]').click();
  await create.locator('[data-action="submit"]').click();
  await until(() => calls.create.length === 1, 'create posted');
  assert(
    calls.create[0].title === 'Ideas' &&
      calls.create[0].iconColor === 0xffd67e &&
      calls.create[0].iconEmojiId === '11' &&
      calls.create[0].chat === FORUM,
    `create: ${JSON.stringify(calls.create[0])}`
  );
  await until(async () => (await tab(9).count()) === 1, 'the new topic shown');
  assert((await tab(9).textContent()).includes('Ideas'), 'its name');

  // Edit renames it.
  await rightClick(2);
  await menu('editTopic').click();
  const edit = page.locator('[data-dialog="topic-edit"]');
  await edit.waitFor({ timeout: 5000 });
  await edit.locator('[data-field="title"]').fill('Design v2');
  await edit.locator('[data-action="submit"]').click();
  await until(() => calls.edit.length === 1, 'edit posted');
  assert(
    calls.edit[0].topic === 2 &&
      calls.edit[0].title === 'Design v2' &&
      !('closed' in calls.edit[0]),
    `edit: ${JSON.stringify(calls.edit[0])}`
  );
  await until(
    async () => (await tab(2).textContent()).includes('Design v2'),
    'renamed'
  );

  // Pin moves it up, as Telegram orders the pinned first.
  await rightClick(3);
  await menu('pinTopic').click();
  await until(() => calls.pin.length === 1, 'pin posted');
  assert(calls.pin[0].topic === 3 && calls.pin[0].pinned === true, 'pinned');
  await until(async () => (await order()) === 'all,3,1,2,9', 'moved up');
  await rightClick(3);
  assert((await menu('unpinTopic').count()) === 1, 'now offers Unpin');
  await page.keyboard.press('Escape');

  // Close shows the lock; an admin keeps the composer.
  await rightClick(2);
  await menu('closeTopic').click();
  await until(
    async () => (await tab(2).locator('.chat-topic-closed').count()) === 1,
    'the lock'
  );
  assert(calls.edit[1].closed === true, 'closed posted');
  await tab(2).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 5000 });
  assert(
    (await page.locator('.topic-closed-bar').count()) === 0,
    'an admin may still write'
  );

  // Delete asks first.
  await rightClick(9);
  await menu('deleteTopic').click();
  const ask = page.locator('[data-dialog="topic-delete"]');
  await ask.waitFor({ timeout: 5000 });
  assert(calls.remove.length === 0, 'nothing deleted before the answer');
  await ask.locator('[data-action="cancel"]').click();
  await page.waitForTimeout(200);
  assert(calls.remove.length === 0, 'Cancel deletes nothing');
  assert((await tab(9).count()) === 1, 'still there');
  await rightClick(9);
  await menu('deleteTopic').click();
  await ask.locator('[data-action="submit"]').click();
  await until(() => calls.remove.length === 1, 'delete posted');
  assert(calls.remove[0].topic === 9, 'the right topic');
  await until(async () => (await tab(9).count()) === 0, 'topic gone');

  await memberChecks();
});
