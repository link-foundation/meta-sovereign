// A forum group's topics (R-Y122): which topic a message is in, a
// topic's own page of the store, the topics and a topic's history asked
// of Telegram, the reply header a send in a topic carries, and the
// routes. Fake clients; nothing reaches a network.

import { unreadCount } from '../src/web/chat-model.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { serviceInfo } from '../src/web/message-parts.js';
import {
  composerReplyId,
  GENERAL_TOPIC,
  inTopicOnly,
  splitTopicKey,
  topicKey,
  topicOfMessage,
  topicReplyId,
} from '../src/web/forum-topics.js';
import { createForum, topicOf } from '../src/sources/telegram-forum.js';
import { replyHeader } from '../src/sources/telegram-send.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createChatIndex } from '../src/server/chat-index.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import {
  topicColor,
  topicMessages,
  viewedChat,
} from '../src/web/chat-topics.js';

const inTopic = (top, replyToMsgId = top) => ({
  replyTo: { forumTopic: true, replyToMsgId, replyToTopId: top },
});

test('a message is in the topic its reply header names, else General', () => {
  assert.equal(topicOfMessage({}), GENERAL_TOPIC);
  assert.equal(topicOfMessage({ raw: {} }), GENERAL_TOPIC);
  // Answering the topic's first message only.
  assert.equal(
    topicOfMessage({ raw: { replyTo: { forumTopic: true, replyToMsgId: 7 } } }),
    7
  );
  // Answering another message of the topic.
  assert.equal(topicOfMessage({ raw: inTopic(7, 12) }), 7);
  // The message that opened the topic is its own.
  assert.equal(
    topicOfMessage({
      raw: { id: 7, action: { className: 'MessageActionTopicCreate' } },
    }),
    7
  );
  // A reply outside the forum's topics is in General.
  assert.equal(topicOfMessage({ raw: { replyTo: { replyToMsgId: 3 } } }), 1);
  // One sent from here says so itself.
  assert.equal(topicOfMessage({ topic: 9, raw: {} }), 9);
});

test("a topic's key, and what a send in a topic answers", () => {
  assert.equal(topicKey('telegram:-1005', 7), 'telegram:-1005#topic:7');
  assert.deepEqual(splitTopicKey('telegram:-1005#topic:7'), {
    key: 'telegram:-1005',
    topic: 7,
  });
  assert.deepEqual(splitTopicKey('telegram:-1005'), {
    key: 'telegram:-1005',
    topic: null,
  });
  assert.equal(topicReplyId(null), null);
  assert.equal(topicReplyId(GENERAL_TOPIC), null, 'General needs no reply');
  assert.equal(topicReplyId(7), 7);
  assert.equal(topicReplyId(7, 12), 12);
  assert.equal(composerReplyId({ topic: 7, replyTo: null }), 7);
  assert.equal(composerReplyId({ topic: 7, replyTo: { msgId: 9 } }), 9);
  assert.equal(composerReplyId({}), null);
});

const tl = (className) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { className });
    }
  };
const Api = {
  InputReplyToMessage: tl('InputReplyToMessage'),
  messages: { GetForumTopics: tl('messages.GetForumTopics') },
};

test('the reply header of a send in a topic', () => {
  assert.deepEqual(replyHeader(Api, null, null), {});
  assert.deepEqual(replyHeader(Api, null, null, GENERAL_TOPIC), {});
  const first = replyHeader(Api, null, 'ignored', 7).replyTo;
  assert.equal(first.replyToMsgId, 7);
  assert.equal(first.topMsgId, undefined);
  assert.equal(first.quoteText, undefined, 'no quote without a reply');
  const answer = replyHeader(Api, 12, 'part', 7).replyTo;
  assert.equal(answer.replyToMsgId, 12);
  assert.equal(answer.topMsgId, 7);
  assert.equal(answer.quoteText, 'part');
  // Outside a forum, as before.
  const plain = replyHeader(Api, 12, null).replyTo;
  assert.equal(plain.replyToMsgId, 12);
  assert.equal(plain.topMsgId, undefined);
});

const msg = (n, raw = {}) => ({
  id: `msg:telegram:-1005:${n}`,
  tokens: [],
  source: 'telegram',
  chat: '-1005',
  sender: '42',
  body: `m${n}`,
  timestamp: new Date(Date.UTC(2026, 9, 17, 10, 0, n)).toISOString(),
  raw,
});

test("the chat index pages a topic's messages alone", async () => {
  const store = createMemoryStore();
  await store.put(msg(1));
  await store.put(
    msg(2, { id: 2, action: { className: 'MessageActionTopicCreate' } })
  );
  await store.put(msg(3, inTopic(2)));
  await store.put(msg(4));
  await store.put(msg(5, inTopic(2, 3)));
  await store.put(msg(6, inTopic(2)));
  const index = createChatIndex(store);
  await index.ready();
  const all = await index.page('telegram:-1005', { limit: 10 });
  assert.equal(all.messages.length, 6);
  const topic = await index.page(topicKey('telegram:-1005', 2), { limit: 2 });
  assert.deepEqual(
    topic.messages.map((m) => m.body),
    ['m5', 'm6']
  );
  assert.equal(topic.more, true);
  const older = await index.page(topicKey('telegram:-1005', 2), {
    before: 'msg:telegram:-1005:5',
    limit: 5,
  });
  assert.deepEqual(
    older.messages.map((m) => m.body),
    ['m2', 'm3']
  );
  assert.equal(older.more, false);
  const general = await index.page(topicKey('telegram:-1005', 1), {
    limit: 10,
  });
  assert.deepEqual(
    general.messages.map((m) => m.body),
    ['m1', 'm4']
  );
  // A message coming later lands in its topic's page.
  await store.put(msg(7, inTopic(2)));
  const after = await index.page(topicKey('telegram:-1005', 2), { limit: 1 });
  assert.deepEqual(
    after.messages.map((m) => m.body),
    ['m7']
  );
  index.close();
});

const forumSetup = ({
  fail = null,
  topics = [],
  messages = [],
  count = topics.length,
} = {}) => {
  const asked = [];
  const pages = [];
  const written = [];
  let clock = 1_000;
  const client = {
    invoke: async (request) => {
      asked.push(request);
      if (fail) {
        throw fail;
      }
      return { topics, messages, count };
    },
    getMessages: async (peer, options) => {
      pages.push({ peer, options });
      return options.offsetId
        ? [{ id: 7 }, { id: 8 }]
        : [{ id: 9 }, { id: 10 }, { className: 'MessageEmpty', id: 11 }];
    },
  };
  const env = {
    store: createMemoryStore(),
    importer: async () => ({ Api }),
    connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
    queue: { run: (_key, _priority, task) => task() },
  };
  const tools = {
    toLinks: (dialog, list) =>
      list.map((m) => ({
        id: `msg:telegram:${dialog.id}:${m.id}`,
        body: m.message ?? '',
        timestamp: '2026-10-17T10:00:00.000Z',
        sender: m.out ? 'me' : '42',
      })),
    writeChanged: async (_store, links) => {
      written.push(...links);
      return links.length;
    },
  };
  const forum = createForum(
    env,
    { userClient: async () => client, dialogOf: async (id) => ({ id }), tools },
    { now: () => clock }
  );
  return {
    store: env.store,
    forum,
    asked,
    pages,
    written,
    later: (ms) => {
      clock += ms;
    },
  };
};

const TOPIC = (id, extra = {}) => ({
  className: 'ForumTopic',
  id,
  title: `T${id}`,
  iconColor: 0x6fb9f0,
  topMessage: id * 10,
  unreadCount: 2,
  readInboxMaxId: id * 10 - 2,
  unreadMentionsCount: 0,
  date: 1_760_000_000,
  ...extra,
});

test("a forum's topics: pinned first, the newest message of each, kept a while", async () => {
  const { forum, asked, written, later } = forumSetup({
    topics: [
      TOPIC(1),
      TOPIC(5, { closed: true }),
      { className: 'ForumTopicDeleted', id: 6 },
      TOPIC(7, { pinned: true }),
    ],
    messages: [
      { id: 10, message: 'general news', out: false },
      { id: 70, message: 'pinned news', out: true },
    ],
  });
  const answer = await forum.forumTopics({ chat: '-1005' });
  assert.equal(answer.ok, true);
  assert.equal(answer.forum, true);
  assert.deepEqual(
    answer.topics.map((t) => t.id),
    [7, 1, 5]
  );
  const [pinned, general, closed] = answer.topics;
  assert.equal(pinned.pinned, true);
  assert.equal(pinned.last.body, 'pinned news');
  assert.equal(pinned.last.mine, true);
  assert.equal(general.last.body, 'general news');
  assert.equal(general.unread, 2);
  assert.equal(general.readInboxMaxId, 8);
  assert.equal(general.iconColor, 0x6fb9f0);
  assert.equal(general.at, new Date(1_760_000_000_000).toISOString());
  assert.equal(closed.closed, true);
  assert.equal(closed.last, null);
  assert.equal(written.length, 2, "the topics' messages are stored");
  const [request] = asked;
  assert.equal(request.className, 'messages.GetForumTopics');
  assert.deepEqual(request.peer, { peer: '-1005' });
  assert.equal(request.limit, 100);
  // Asked again soon: kept; later: asked again; at once twice: once.
  await forum.forumTopics({ chat: '-1005' });
  assert.equal(asked.length, 1);
  later(20_000);
  await Promise.all([
    forum.forumTopics({ chat: '-1005' }),
    forum.forumTopics({ chat: '-1005' }),
  ]);
  assert.equal(asked.length, 2);
  await forum.forumTopics({ chat: '-1005', fresh: true });
  assert.equal(asked.length, 3);
});

test('a group that is no forum, a private chat, and other errors', async () => {
  const plain = forumSetup({
    fail: Object.assign(new Error('x'), {
      errorMessage: 'CHANNEL_FORUM_MISSING',
    }),
  });
  assert.deepEqual(await plain.forum.forumTopics({ chat: '-1005' }), {
    ok: true,
    forum: false,
    topics: [],
  });
  const user = forumSetup();
  assert.equal((await user.forum.forumTopics({ chat: '42' })).forum, false);
  assert.equal(user.asked.length, 0, 'a private chat is never asked');
  const broken = forumSetup({
    fail: Object.assign(new Error('x'), { errorMessage: 'FLOOD_WAIT_3' }),
  });
  await assert.rejects(broken.forum.forumTopics({ chat: '-1005' }));
  // Asked once more: it is not kept.
  await assert.rejects(broken.forum.forumTopics({ chat: '-1005' }));
  assert.equal(broken.asked.length, 2);
});

test("a topic's history: its replies, newest and older, stored", async () => {
  const { forum, pages, written } = forumSetup();
  const newest = await forum.topicHistory({
    chat: '-1005',
    topic: 7,
    limit: 3,
  });
  assert.deepEqual(pages[0], {
    peer: { peer: '-1005' },
    options: { replyTo: 7, limit: 3 },
  });
  assert.equal(newest.written, 2);
  assert.equal(newest.complete, true, 'a short page is the start');
  const older = await forum.topicHistory({
    chat: '-1005',
    topic: 7,
    before: 9,
    limit: 2,
  });
  assert.deepEqual(pages[1].options, { replyTo: 7, limit: 2, offsetId: 9 });
  assert.equal(older.complete, true, "the topic's first message was seen");
  const general = await forum.topicHistory({
    chat: '-1005',
    topic: 1,
    before: 9,
    limit: 2,
  });
  assert.equal(general.complete, false, 'General goes on');
  assert.deepEqual(written.map((l) => l.id).slice(0, 2), [
    'msg:telegram:-1005:9',
    'msg:telegram:-1005:10',
  ]);
  assert.deepEqual(await forum.topicHistory({ chat: '-1005', topic: 0 }), {
    written: 0,
  });
});

test('topicOf: a deleted topic is none; the page helpers', () => {
  assert.equal(topicOf({ className: 'ForumTopicDeleted', id: 3 }), null);
  assert.equal(topicOf(TOPIC(3)).title, 'T3');
  assert.equal(topicColor(0x6fb9f0), '#6fb9f0');
  assert.equal(topicColor(0), '#000000');
  assert.equal(topicColor(null), '#000000');
  assert.equal(topicColor('x'), null);
  assert.equal(topicColor(-1), null);
  const chat = { key: 'telegram:-1005', chat: '-1005' };
  assert.equal(viewedChat(chat, null), chat);
  assert.deepEqual(viewedChat(chat, 7), {
    key: 'telegram:-1005#topic:7',
    chat: '-1005',
    topic: 7,
  });
  const list = [msg(1), msg(3, inTopic(2)), msg(4, inTopic(5))];
  assert.equal(topicMessages(list, null), list);
  assert.deepEqual(
    topicMessages(list, 2).map((m) => m.body),
    ['m3']
  );
});

const call = async (path, body, account) => {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = `/api/telegram/${path}`;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
    'sec-fetch-site': 'same-origin',
  };
  const res = {
    headers: {},
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = text;
    },
  };
  await handleTelegramRoutes(req, res, `/api/telegram/${path}`, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res;
};

test('the routes: topics, a topic’s history, a topic read', async () => {
  const seen = [];
  const account = {
    forumTopics: async (asked) => {
      seen.push(['topics', asked]);
      return { ok: true, forum: true, topics: [] };
    },
    topicHistory: async (asked) => {
      seen.push(['history', asked]);
      return { written: 1, complete: false };
    },
    history: async () => {
      seen.push(['whole']);
      return { written: 0 };
    },
    markRead: async (asked) => {
      seen.push(['read', asked]);
      return { ok: true };
    },
  };
  assert.equal(
    (await call('forum-topics', { chat: '-1005' }, account)).status,
    200
  );
  assert.equal(
    (await call('forum-topics', { chat: 'x' }, account)).status,
    400
  );
  assert.equal((await call('forum-topics', { chat: '-1005' }, {})).status, 400);
  const page = await call(
    'history',
    { chat: '-1005', topic: 7, before: 30, limit: 500 },
    account
  );
  assert.equal(page.status, 200);
  assert.deepEqual(JSON.parse(page.body), { written: 1, complete: false });
  for (const topic of [0, -2, 1.5, '7']) {
    const bad = await call('history', { chat: '-1005', topic }, account);
    assert.equal(bad.status, 400, String(topic));
  }
  await call('read', { chat: '-1005', maxId: 40, topic: 7 }, account);
  await call('read', { chat: '-1005', maxId: 41 }, account);
  assert.deepEqual(seen, [
    ['topics', { chat: '-1005' }],
    [
      'history',
      { chat: '-1005', topic: 7, limit: 100, before: 30, priority: 'prefetch' },
    ],
    ['read', { chat: '-1005', maxId: 40, topic: 7 }],
    ['read', { chat: '-1005', maxId: 41 }],
  ]);
});

test('a post in a topic answers nothing; the topic service lines', () => {
  assert.equal(inTopicOnly(undefined), false);
  assert.equal(inTopicOnly({ replyToMsgId: 3 }), false);
  assert.equal(inTopicOnly({ forumTopic: true, replyToMsgId: 7 }), true);
  assert.equal(
    inTopicOnly({ forumTopic: true, replyToMsgId: 7, replyToTopId: 7 }),
    true
  );
  assert.equal(
    inTopicOnly({ forumTopic: true, replyToMsgId: 12, replyToTopId: 7 }),
    false
  );
  const service = (action) =>
    serviceInfo({ service: action.className, raw: { action } });
  const created = service({
    className: 'MessageActionTopicCreate',
    title: 'Design',
  });
  assert.equal(created.key, 'chat.service.topicCreate');
  assert.equal(created.title, 'Design');
  assert.equal(created.titleKey, 'chat.service.topicCreateFmt');
  const renamed = service({ className: 'MessageActionTopicEdit', title: 'X' });
  assert.equal(renamed.titleKey, 'chat.service.topicRenamedFmt');
  const keyOf = (fields) =>
    service({ className: 'MessageActionTopicEdit', ...fields }).key;
  assert.equal(keyOf({ closed: true }), 'chat.service.topicClosed');
  assert.equal(keyOf({ closed: false }), 'chat.service.topicReopened');
  assert.equal(keyOf({ hidden: true }), 'chat.service.topicHidden');
  assert.equal(keyOf({ hidden: false }), 'chat.service.topicShown');
  assert.equal(keyOf({}), 'chat.service.topicEdit');
  // A group renamed keeps its own words.
  assert.equal(
    service({ className: 'MessageActionChatEditTitle', title: 'G' }).titleKey,
    'chat.service.titleChangedFmt'
  );
});

test('complete forum topic counters correct phantom dialog unread; partial pages never imply zero', async () => {
  for (const count of [2, 101]) {
    const { forum, store } = forumSetup({
      count,
      topics: [TOPIC(1, { unreadCount: 0 }), TOPIC(2, { unreadCount: 0 })],
    });
    await store.put({
      id: 'read:telegram:-1005',
      source: 'telegram',
      chat: '-1005',
      forum: 1,
      unreadCount: 6,
      unreadTopId: 1556,
      inboxMaxId: 1550,
    });
    const answer = await forum.forumTopics({ chat: '-1005', fresh: true });
    const read = await store.get('read:telegram:-1005');
    assert.equal(answer.complete, count === 2);
    assert.equal(unreadCount([], read), count === 2 ? 0 : 6);
    assert.equal(
      read.unreadCount,
      6,
      'keep the raw dialog baseline for subsequent deltas'
    );
  }
});
