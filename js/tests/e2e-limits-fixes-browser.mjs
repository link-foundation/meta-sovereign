// Real browser e2e for three gaps closed (R-Y161), as Telegram Desktop
// behaves: (1) the files' box offers "Send with effect" on its Send in a
// private chat, and the files route gets the picked effect (a group has no
// such entry); (2) the "N requested to join" bar follows Telegram's
// pending-requests update live: it appears, changes and goes without the
// chat being opened again; (3) a t.me/c/<channel>/<topic>/<message> link
// opens that forum's topic and highlights the message, and a link to the
// topic itself (t.me/c/<channel>/<topic>) opens the topic. Telegram's
// answers are faked in the page, the chats fakes in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:limits-fixes

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const GROUP = '-1005';
const FORUM = '-1009';
const LINKS = '555';
const FIRE = '5104841245755180586';
const TOPIC_LINK = 'https://t.me/c/9/2/5';
const TOPIC_ONLY = 'https://t.me/c/9/6';
const store = createMemoryStore();
const at = Date.now();
const put = (chat, [name, type], id, body, raw = {}, extra = {}) =>
  store.put({
    id: `msg:telegram:${chat}:${id}`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: chat === ANN ? ANN : '77',
    senderName: 'Fake Erin',
    body,
    timestamp: new Date(at - (100 - id) * 60_000).toISOString(),
    raw: { id, ...raw },
    ...extra,
  });
const inTopic = (top, answers = top) => ({
  replyTo: {
    forumTopic: true,
    replyToMsgId: answers,
    ...(answers === top ? {} : { replyToTopId: top }),
  },
});
const urlAt = (text, url) => ({
  className: 'MessageEntityUrl',
  offset: text.indexOf(url),
  length: url.length,
});
const forum = (id, body, raw, extra) =>
  put(FORUM, ['Fake Forum', 'channel'], id, body, raw, extra);
await put(ANN, ['Ann Lee', 'private'], 1, 'hello there');
await put(GROUP, ['Fake Group', 'supergroup'], 1, 'hello group');
await forum(1, 'welcome to general');
await forum(
  2,
  '',
  { action: { className: 'MessageActionTopicCreate', title: 'Design' } },
  { service: 'MessageActionTopicCreate' }
);
await forum(3, 'first design note', inTopic(2, 2));
await forum(4, 'general chatter');
await forum(5, 'second design note', inTopic(2, 3));
await forum(6, 'release plan', inTopic(6, 6));
await store.put({
  id: `read:telegram:${FORUM}`,
  tokens: ['read', 'telegram', FORUM],
  kind: 'read',
  source: 'telegram',
  chat: FORUM,
  inboxMaxId: 6,
  forum: 1,
});
const linkBody = `see ${TOPIC_LINK} and ${TOPIC_ONLY}`;
await put(LINKS, ['Fake Dave', 'private'], 1, linkBody, {
  entities: [urlAt(linkBody, TOPIC_LINK), urlAt(linkBody, TOPIC_ONLY)],
});

const { base, page, until, finish } = await openChatApp('limits-fixes', {
  store,
});
await page.addInitScript(() => {
  globalThis.__found = [];
  new globalThis.MutationObserver((records) => {
    for (const r of records) {
      const node = r.target;
      if (node.classList?.contains('is-found') && node.dataset.message) {
        globalThis.__found.push(node.dataset.message);
      }
    }
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, links: [] })
);
await page.route('**/api/telegram/avatar*', (route) =>
  route.fulfill({ status: 404, body: '' })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  const answers = {
    [ANN]: { kind: 'user', title: 'Ann Lee' },
    [GROUP]: { kind: 'channel', title: 'Fake Group', canInvite: true },
  };
  return fulfil(route, {
    chat,
    ...(answers[chat] ?? { kind: 'channel', title: 'Chat' }),
  });
});
await page.route('**/api/telegram/effects', (route) =>
  fulfil(route, {
    ok: true,
    premium: false,
    effects: [{ id: FIRE, emoticon: '🔥' }],
  })
);
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
  fulfil(
    route,
    route.request().postDataJSON().chat === FORUM
      ? {
          ok: true,
          forum: true,
          topics: [
            topic(6, 'Releases'),
            topic(1, 'General'),
            topic(2, 'Design'),
          ],
        }
      : { ok: true, forum: false, topics: [] }
  )
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
  return fulfil(route, { ok: true, chat: ANN, ids: [2] });
});

const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
};
const dialog = page.locator('.attach-dialog');
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
};
const rightClickSend = () =>
  dialog.locator('[data-action="attach-send"]').click({ button: 'right' });

const effectStep = async () => {
  await open(ANN);
  await attachFile();
  await rightClickSend();
  await page.locator('.msg-context-menu [data-action="sendEffect"]').click();
  const panel = page.locator('[data-effect-panel]');
  await panel.waitFor({ timeout: 5000 });
  await panel.locator(`[data-effect-id="${FIRE}"]`).click();
  await until(() => sends.length === 1, 'sent with the effect');
  assert(sends[0].effect === FIRE, `effect: ${JSON.stringify(sends[0])}`);
  assert(sends[0].tokens.length === 1, 'the file goes');
  await until(async () => (await dialog.count()) === 0, 'the box closes');
  // A group: the files' menu has no effect entry.
  await open(GROUP);
  await attachFile();
  await rightClickSend();
  await page.waitForTimeout(300);
  assert(
    (await page.locator('[data-action="sendEffect"]').count()) === 0,
    'no effect entry in a group'
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
};

const bar = () => page.locator('[data-requests-bar]');
const barText = async () =>
  (await bar().count()) === 0 ? null : await bar().textContent();
const live = (pending, names) =>
  store.put({
    id: `requests:telegram:${GROUP}`,
    tokens: ['requests', 'telegram', GROUP],
    kind: 'requests',
    source: 'telegram',
    chat: GROUP,
    pending,
    recent: names.map((name, i) => ({ id: String(5 + i), name })),
    at: new Date().toISOString(),
  });
const requestsStep = async () => {
  await open(GROUP);
  await page.waitForTimeout(500);
  assert((await bar().count()) === 0, 'no bar without requests');
  await live(2, ['Ann Lee', 'Bob Ray']);
  await until(async () => (await barText())?.includes('2'), 'the bar appears');
  assert((await bar().locator('.requests-face').count()) === 2, 'two faces');
  await live(5, ['Cy Joined']);
  await until(async () => (await barText())?.includes('5'), 'count changes');
  assert((await bar().locator('.requests-face').count()) === 1, 'one face');
  await live(0, []);
  await until(async () => (await bar().count()) === 0, 'the bar goes');
};

const found = (id) => page.evaluate((x) => globalThis.__found.includes(x), id);
const topicTab = (id) => page.locator(`nav.chat-topics [data-topic="${id}"]`);
const selected = async (id) =>
  (await topicTab(id).count()) > 0 &&
  (await topicTab(id).getAttribute('aria-selected')) === 'true';
const linkOf = (n) =>
  page.locator(`[data-row="msg:telegram:${LINKS}:1"] a.msg-link`).nth(n);
const topicLinkStep = async () => {
  // A message of topic 2: the topic opens, the message is highlighted.
  await open(LINKS);
  await linkOf(0).click();
  await until(() => selected(2), 'the topic opens');
  await until(() => found(`msg:telegram:${FORUM}:5`), 'the message is found');
  await until(async () => {
    const text = await page.locator('.chat-scroll').first().textContent();
    return !text.includes('general chatter') && text.includes('design note');
  }, 'only the topic is shown');
  // A link to a topic itself.
  await open(LINKS);
  await linkOf(1).click();
  await until(() => selected(6), 'the topic itself opens');
};

await finish(async () => {
  await page.goto(`${base}/`);
  await effectStep();
  await requestsStep();
  await topicLinkStep();
});
