// Real browser e2e for a forum seen as messages or as topics (R-Y171), as
// Telegram Desktop's ⋯ menu has it: the header's menu offers "View as
// messages" in a forum showing its topics, and "View as topics" in one
// showing messages; a click switches the view at once (the topics' strip
// gone, the whole group's messages shown, or the reverse) and only then
// asks the server (channels.toggleViewForumAsMessages); the flag Telegram
// keeps (channelFull view_forum_as_messages) is followed on load without
// any write; a refusal takes the switch back; a chat that is no forum has
// no such menu. Telegram's answers faked in the page, fake chats in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app, nothing is sent. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:forum-view

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const FORUM = '-1009';
const PLAIN = '555';
const at = Date.now();
const store = createMemoryStore();
const put = (chat, id, body, raw = {}, extra = {}) =>
  store.put({
    id: `msg:telegram:${chat}:${id}`,
    source: 'telegram',
    chat,
    chatName: chat === FORUM ? 'Fake Forum' : 'Fake Dave',
    chatType: chat === FORUM ? 'channel' : 'user',
    sender: '77',
    senderName: 'Fake Erin',
    body,
    timestamp: new Date(at - (100 - id) * 60_000).toISOString(),
    raw: { id, ...raw },
    ...extra,
  });
const inTopic = (top) => ({
  replyTo: { forumTopic: true, replyToMsgId: top },
});
await put(FORUM, 1, 'welcome to general');
await put(
  FORUM,
  2,
  '',
  { action: { className: 'MessageActionTopicCreate', title: 'Design' } },
  { service: 'MessageActionTopicCreate' }
);
await put(FORUM, 3, 'first design note', inTopic(2));
await put(FORUM, 4, 'general chatter');
await store.put({
  id: `read:telegram:${FORUM}`,
  tokens: ['read', 'telegram', FORUM],
  kind: 'read',
  source: 'telegram',
  chat: FORUM,
  inboxMaxId: 4,
  forum: 1,
});
await put(PLAIN, 1, 'not a forum');

const { base, page, until, finish } = await openChatApp('forum-view', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
// Telegram's flag, as the chat info carries it.
let flag = false;
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(
    route,
    chat === FORUM
      ? {
          chat,
          kind: 'channel',
          forum: true,
          forumAsMessages: flag,
          topics: { manage: false, create: false, delete: false },
        }
      : { chat, kind: 'user' }
  );
});
const topic = (id, title) => ({
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
  at: null,
  last: null,
});
await page.route('**/api/telegram/forum-topics', (route) =>
  fulfil(route, {
    ok: true,
    forum: route.request().postDataJSON().chat === FORUM,
    topics: [topic(1, 'General'), topic(2, 'Design')],
  })
);
const writes = [];
let refuse = false;
await page.route('**/api/telegram/forum-view', (route) => {
  const body = route.request().postDataJSON();
  writes.push(body);
  return fulfil(
    route,
    refuse
      ? { ok: false, error: 'CHANNEL_INVALID', code: 'no-access' }
      : { ok: true, asMessages: body.asMessages }
  );
});

const strip = page.locator('nav.chat-topics');
const toggle = page.locator('[data-action="forum-menu"]');
const item = page.locator('[data-action="forum-view"]');
const shown = () =>
  page
    .locator('.chat-scroll')
    .first()
    .textContent({ timeout: 2000 })
    .catch(() => '');
const shows = async (text) => (await shown()).includes(text);
const openForum = async () => {
  await page.locator(`[data-chat="telegram:${FORUM}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
};
const menuText = async () => {
  await toggle.click();
  await item.waitFor({ timeout: 5000 });
  return (await item.textContent()).trim();
};

await finish(async () => {
  await page.goto(`${base}/`);
  // A chat that is no forum: no menu.
  await page.locator(`[data-chat="telegram:${PLAIN}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  assert((await toggle.count()) === 0, 'no menu outside a forum');

  // The forum as topics (Telegram's flag off): the strip, no write on load.
  await openForum();
  await strip.waitFor({ timeout: 10000 });
  await toggle.waitFor({ timeout: 5000 });
  assert((await menuText()) === 'View as messages', 'offers messages');
  assert(writes.length === 0, 'nothing written on load');

  // View as messages: at once the strip is gone and everything is shown.
  await item.click();
  await until(async () => (await strip.count()) === 0, 'strip gone');
  await until(() => writes.length === 1, 'written');
  assert(
    writes[0].chat === FORUM && writes[0].asMessages === true,
    `write: ${JSON.stringify(writes[0])}`
  );
  assert(await shows('general chatter'), 'the whole group shown');
  assert(await shows('first design note'), 'every topic shown');
  assert((await menuText()) === 'View as topics', 'offers topics');

  // View as topics: the strip is back.
  await item.click();
  await strip.waitFor({ timeout: 10000 });
  await until(() => writes.length === 2, 'written again');
  assert(writes[1].asMessages === false, `write: ${JSON.stringify(writes[1])}`);

  // A refusal takes the switch back.
  refuse = true;
  await menuText();
  await item.click();
  await until(() => writes.length === 3, 'refused write');
  await until(async () => (await strip.count()) === 1, 'strip back');
  refuse = false;

  // Telegram's flag on: followed on load, nothing written.
  flag = true;
  await page.reload();
  await openForum();
  await toggle.waitFor({ timeout: 10000 });
  await until(async () => (await strip.count()) === 0, 'loaded as messages');
  assert(await shows('first design note'), 'messages shown');
  assert((await menuText()) === 'View as topics', 'offers topics on load');
  assert(writes.length === 3, 'no write on load');
});
