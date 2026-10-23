// Real browser e2e for a forum group's topics (R-Y122), as Telegram's
// apps show them in their tabs layout: a strip over the messages with
// "All" and each topic (its mark, title, unread count, a lock when
// closed), "All" chosen first; choosing a topic shows its messages alone
// and asks Telegram for its history by the topic; what is sent from it
// goes to the topic; "All" shows the whole group again; a chat that is
// no forum has no strip. Telegram's answers faked in the page, fake
// chats in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app, nothing is sent. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:forum-topics

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';

const skip = (msg) => {
  console.log(`[e2e-forum-topics] SKIP: ${msg}`);
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
// As Telegram sends them: a post in a topic names its first message
// alone; an answer in a topic names the topic as its top too.
const inTopic = (top, answers = top) => ({
  replyTo: {
    forumTopic: true,
    replyToMsgId: answers,
    ...(answers === top ? {} : { replyToTopId: top }),
  },
});
await put(FORUM, 1, 'welcome to general');
await put(
  FORUM,
  2,
  '',
  { action: { className: 'MessageActionTopicCreate', title: 'Design' } },
  { service: 'MessageActionTopicCreate' }
);
await put(FORUM, 3, 'first design note', inTopic(2, 2));
await put(FORUM, 4, 'general chatter');
await put(FORUM, 5, 'second design note', inTopic(2, 3));
await put(FORUM, 6, 'release plan', inTopic(6, 6));
await store.put({
  id: `read:telegram:${FORUM}`,
  tokens: ['read', 'telegram', FORUM],
  kind: 'read',
  source: 'telegram',
  chat: FORUM,
  inboxMaxId: 6,
  forum: 1,
});
await put(PLAIN, 1, 'not a forum');

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-forum-topics-'));
const sent = [];
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
    send: async (draft) => {
      sent.push(draft);
      return { via: 'fake' };
    },
  },
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const fulfil = (route, body, status = 200) =>
  route.fulfill({
    status,
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
const histories = [];
await page.route('**/api/telegram/history', (route) => {
  histories.push(route.request().postDataJSON());
  return fulfil(route, { written: 0, cached: 0, complete: true });
});
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
const reads = [];
await page.route('**/api/telegram/read', (route) => {
  reads.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
const asked = [];
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
  at: null,
  last: null,
  ...extra,
});
await page.route('**/api/telegram/forum-topics', (route) => {
  const body = route.request().postDataJSON();
  asked.push(body);
  return fulfil(
    route,
    body.chat === FORUM
      ? {
          ok: true,
          forum: true,
          topics: [
            topic(6, 'Releases', { pinned: true, closed: true }),
            topic(1, 'General'),
            topic(2, 'Design', { unread: 3 }),
          ],
        }
      : { ok: true, forum: false, topics: [] }
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

const strip = page.locator('nav.chat-topics');
const tab = (id) => strip.locator(`[data-topic="${id}"]`);
const shown = () =>
  page
    .locator('.chat-scroll')
    .first()
    .textContent({ timeout: 2000 })
    .catch(() => '');
const shows = async (text) => (await shown()).includes(text);

let failed = false;
try {
  await page.goto(`${base}/`);
  // A chat that is no forum: no strip.
  await page.locator(`[data-chat="telegram:${PLAIN}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  assert((await strip.count()) === 0, 'no strip outside a forum');
  assert(!asked.some((a) => a.chat === PLAIN), 'a private chat is never asked');

  // The forum: "All" chosen, the topics in Telegram's order.
  await page.locator(`[data-chat="telegram:${FORUM}"]`).click();
  await strip.waitFor({ timeout: 10000 });
  const ids = await strip
    .locator('[data-topic]')
    .evaluateAll((all) => all.map((n) => n.dataset.topic));
  assert(ids.join() === 'all,6,1,2', `tabs: ${ids}`);
  assert(
    (await tab('all').getAttribute('aria-selected')) === 'true',
    'All chosen first'
  );
  assert((await tab('6').locator('.chat-topic-closed').count()) === 1, 'lock');
  assert(
    (await tab('2').locator('.chat-topic-unread').textContent()) === '3',
    'unread count'
  );
  assert(
    (await tab('1').locator('.chat-topic-icon.is-general').textContent()) ===
      '#',
    "General's mark"
  );
  await until(() => shows('general chatter'), 'the whole group shown');
  assert(await shows('release plan'), 'every topic shown under All');

  // A topic: its messages alone, its history asked by the topic.
  await tab('2').click();
  await until(
    async () => (await tab('2').getAttribute('aria-selected')) === 'true',
    'Design chosen'
  );
  await until(async () => !(await shows('general chatter')), 'filtered');
  assert(await shows('first design note'), 'its first note');
  assert(await shows('second design note'), 'its answer');
  assert(await shows('Topic “Design” created'), 'its start, named');
  assert(
    (await page.locator('.chat-scroll .bubble-reply').count()) === 1,
    'a post in the topic answers nothing; the answer quotes its note'
  );
  assert(!(await shows('release plan')), 'not another topic');
  await until(
    () => histories.some((h) => h.chat === FORUM && h.topic === 2),
    'history asked by the topic'
  );

  // What is sent goes to the topic.
  await page.locator('.chat-composer textarea').fill('a reply in design');
  await page.keyboard.press('Enter');
  await until(() => sent.length === 1, 'sent');
  assert(
    sent[0].chat === FORUM &&
      sent[0].text === 'a reply in design' &&
      sent[0].topic === 2,
    `send: ${JSON.stringify(sent[0])}`
  );
  await until(() => shows('a reply in design'), 'shown in the topic');

  // General: the messages in no topic.
  await tab('1').click();
  await until(async () => !(await shows('first design note')), 'General');
  assert(await shows('welcome to general'), 'General shows its own');

  // All again: the whole group.
  await tab('all').click();
  await until(() => shows('release plan'), 'All again');
  assert(await shows('first design note'), 'and every topic');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-forum-topics] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-forum-topics] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-forum-topics-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
