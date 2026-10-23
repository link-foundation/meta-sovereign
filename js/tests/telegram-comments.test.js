// A channel post's comments and a message's thread (R-Y126): the
// discussion asked once and kept, its replies by page, a comment sent
// to the discussion group as an answer to the post's copy (or to a
// comment, inside the thread), the bar's reading of the replies header,
// and the routes. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createComments } from '../src/sources/telegram-comments.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { threadOf } from '../src/web/chat-comments-bar.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: {
    GetDiscussionMessage: named('GetDiscussionMessage'),
    SendMessage: named('SendMessage'),
    ReadDiscussion: named('ReadDiscussion'),
  },
  InputReplyToMessage: named('InputReplyToMessage'),
};

const GROUP = { className: 'Channel', id: 77n, title: 'Fake Chat' };
const DISCUSSION = {
  className: 'messages.DiscussionMessage',
  messages: [
    { className: 'Message', id: 40, peerId: { channelId: 77n } },
    { className: 'MessageEmpty', id: 1 },
  ],
  chats: [GROUP],
  users: [],
  unreadCount: 3,
};

const make = ({ discussion = DISCUSSION, replies = [] } = {}) => {
  const log = [];
  const pages = [];
  const peers = [];
  const queued = [];
  let clock = 0;
  const client = {
    invoke: async (request) => {
      log.push(request);
      if (request.className === 'GetDiscussionMessage') {
        if (discussion instanceof Error) {
          throw discussion;
        }
        return discussion;
      }
      return { className: 'UpdateShortSentMessage', id: 99, date: 1 };
    },
    getMessages: async (peer, options) => {
      pages.push({ peer, options });
      return replies;
    },
    getInputEntity: async (peer) => peer,
  };
  const comments = createComments(
    {
      importer: async () => ({
        Api,
        helpers: { readBigIntFromBuffer: () => 1n },
      }),
      queue: {
        run: async (key, priority, fn) => {
          queued.push([key, priority]);
          return fn();
        },
      },
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
      peers: { remember: async (...args) => peers.push(args) },
    },
    {
      userClient: async () => client,
      tools: {
        toLinks: (dialog, messages) =>
          messages.map((m) => ({
            id: `msg:telegram:${dialog.id}:${m.id}`,
            chat: dialog.id,
            chatName: dialog.title,
          })),
      },
    },
    { now: () => clock }
  );
  return {
    comments,
    log,
    pages,
    peers,
    queued,
    tick: (ms) => {
      clock += ms;
    },
  };
};

test('comments: the discussion found, its replies oldest first', async () => {
  const replies = [
    { className: 'Message', id: 43 },
    { className: 'Message', id: 41 },
    { className: 'MessageEmpty', id: 42 },
  ];
  const { comments, log, pages, peers, queued } = make({ replies });
  const answer = await comments.comments({ chat: '-1005', post: 7 });
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.group, { chat: '-10077', title: 'Fake Chat' });
  assert.equal(answer.root, 40);
  assert.equal(answer.unread, 3);
  assert.deepEqual(
    answer.messages.map((m) => m.id),
    ['msg:telegram:-10077:41', 'msg:telegram:-10077:43']
  );
  assert.equal(answer.complete, true);
  // The post asked about in its channel; the replies in the group.
  assert.equal(log[0].className, 'GetDiscussionMessage');
  assert.deepEqual([log[0].peer, log[0].msgId], [{ chat: '-1005' }, 7]);
  assert.deepEqual(pages[0], {
    peer: { chat: '-10077' },
    options: { replyTo: 40, limit: 50 },
  });
  // The group's peer kept, so its files and sends resolve.
  assert.equal(peers[0][0], '-10077');
  assert.equal(peers[0][1], GROUP);
  assert.equal(peers[0][2].isGroup, true);
  assert.ok(queued.every(([, priority]) => priority === 'view'));
});

test('comments: older pages by offset; the discussion kept a while', async () => {
  const replies = Array.from({ length: 50 }, (_, i) => ({
    className: 'Message',
    id: 100 + i,
  }));
  const { comments, log, pages, tick } = make({ replies });
  const first = await comments.comments({ chat: '-1005', post: 7 });
  assert.equal(first.complete, false);
  await comments.comments({ chat: '-1005', post: 7, before: 100 });
  assert.deepEqual(pages[1].options, {
    replyTo: 40,
    limit: 50,
    offsetId: 100,
  });
  assert.equal(log.length, 1, 'the discussion is asked once');
  tick(11 * 60_000);
  await comments.comments({ chat: '-1005', post: 7 });
  assert.equal(log.length, 2, 'asked again once stale');
});

test('comments: a basic group, none, bad input', async () => {
  const basic = make({
    discussion: {
      ...DISCUSSION,
      messages: [{ className: 'Message', id: 5, peerId: { chatId: 9n } }],
      chats: [{ className: 'Chat', id: 9n, title: 'Small' }],
    },
  });
  const answer = await basic.comments.comments({ chat: '-9', post: 5 });
  assert.deepEqual(answer.group, { chat: '-9', title: 'Small' });
  const none = make({ discussion: { ...DISCUSSION, messages: [] } });
  assert.equal(
    (await none.comments.comments({ chat: '-1005', post: 7 })).code,
    'no-comments'
  );
  const bad = make();
  for (const body of [
    { chat: 'x', post: 7 },
    { chat: '-1005', post: 0 },
    { chat: '-1005', post: 1.5 },
  ]) {
    assert.equal((await bad.comments.comments(body)).ok, false);
  }
  assert.equal(bad.log.length, 0, 'nothing asked for bad input');
});

test('sendComment: answers the post copy, or a comment in its thread', async () => {
  const { comments, log } = make();
  const sent = await comments.sendComment({
    chat: '-1005',
    post: 7,
    text: 'hello',
    clientId: 'c1',
  });
  assert.deepEqual(sent, { ok: true, chat: '-10077' });
  const first = log.find((r) => r.className === 'SendMessage');
  assert.deepEqual(first.peer, { chat: '-10077' });
  assert.equal(first.message, 'hello');
  assert.equal(first.replyTo.replyToMsgId, 40);
  assert.equal(first.replyTo.topMsgId, undefined);
  await comments.sendComment({
    chat: '-1005',
    post: 7,
    text: 'to you',
    replyTo: 45,
  });
  const second = log.filter((r) => r.className === 'SendMessage')[1];
  assert.equal(second.replyTo.replyToMsgId, 45);
  assert.equal(second.replyTo.topMsgId, 40);
});

test('readComments: the thread read in the discussion group', async () => {
  const { comments, log } = make();
  assert.deepEqual(
    await comments.readComments({ chat: '-1005', post: 7, max: 45 }),
    { ok: true }
  );
  const read = log.find((r) => r.className === 'ReadDiscussion');
  assert.deepEqual(
    [read.peer, read.msgId, read.readMaxId],
    [{ chat: '-10077' }, 40, 45]
  );
});

test('sendComment: Telegram errors thrown as send errors', async () => {
  // A refused send: the client throws on SendMessage.
  const error = Object.assign(new Error('CHAT_WRITE_FORBIDDEN'), {
    errorMessage: 'CHAT_WRITE_FORBIDDEN',
  });
  const blocked = createComments(
    {
      importer: async () => ({ Api, helpers: null }),
      queue: { run: async (_k, _p, fn) => fn() },
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => ({
        invoke: async (request) => {
          if (request.className === 'GetDiscussionMessage') {
            return DISCUSSION;
          }
          throw error;
        },
        getInputEntity: async (peer) => peer,
      }),
      tools: { toLinks: () => [] },
    }
  );
  await assert.rejects(
    blocked.sendComment({ chat: '-1005', post: 7, text: 'x' })
  );
});

test('the bar: comments, replies, unread', () => {
  const at = (replies, extra = {}) => ({ id: 'm', raw: { replies }, ...extra });
  assert.equal(threadOf({ raw: {} }), null);
  assert.deepEqual(threadOf(at({ comments: true, replies: 0 })), {
    comments: true,
    count: 0,
    unread: false,
  });
  assert.equal(threadOf(at({ comments: false, replies: 0 })), null);
  assert.deepEqual(threadOf(at({ replies: 4, maxId: 20, readMaxId: 10 })), {
    comments: false,
    count: 4,
    unread: true,
  });
  assert.equal(threadOf(at({ comments: true }, { pending: true })), null);
});

const post = async (route, body, account) => {
  const path = `/api/telegram/${route}`;
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
  };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end() {},
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return { status: res.status };
};

test('routes validate strictly', async () => {
  const asked = [];
  const account = {
    comments: async (body) => asked.push(body) && { ok: true },
    sendComment: async (body) => asked.push(body) && { ok: true },
    readComments: async (body) => asked.push(body) && { ok: true },
  };
  for (const [route, bad, good] of [
    ['comments', { chat: '-1005' }, { chat: '-1005', post: 7 }],
    [
      'comments',
      { chat: '-1005', post: 7, before: -1 },
      { chat: '-1', post: 1, before: 3 },
    ],
    [
      'comment-send',
      { chat: '-1005', post: 7, text: ' ' },
      { chat: '-1005', post: 7, text: 'hi' },
    ],
    [
      'comment-send',
      { chat: '-1005', post: 7, text: 'hi', replyTo: 'x' },
      { chat: '-1005', post: 7, text: 'hi', replyTo: 9 },
    ],
    [
      'comments-read',
      { chat: '-1005', post: 7, max: 0 },
      { chat: '-1005', post: 7, max: 9 },
    ],
  ]) {
    assert.equal((await post(route, bad, account)).status, 400, route);
    assert.equal((await post(route, good, account)).status, 200, route);
  }
  await post('comments', { chat: '-1005', post: 7, limit: 5000 }, account);
  assert.equal(asked.at(-1).limit, 100, 'the page is capped');
});
