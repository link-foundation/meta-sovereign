// The @ and ♥ buttons above "down" (R-Y55): how many mentions and
// reactions are not seen yet, which messages they are, and telling
// Telegram they were seen. A fake client and a memory store only —
// nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import { createUnreadMarks } from '../src/sources/telegram-unread.js';
import { readLink, readLinkId } from '../src/sources/telegram-account-live.js';
import { unreadMarks } from '../src/web/chat-model.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { Readable } from 'node:stream';

const tl = (className) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { className });
    }
  };
const Api = {
  messages: {
    GetUnreadMentions: tl('messages.GetUnreadMentions'),
    GetUnreadReactions: tl('messages.GetUnreadReactions'),
    ReadMessageContents: tl('messages.ReadMessageContents'),
    ReadMentions: tl('messages.ReadMentions'),
    ReadReactions: tl('messages.ReadReactions'),
  },
  channels: { ReadMessageContents: tl('channels.ReadMessageContents') },
};

const setup = async (answer) => {
  const store = createMemoryStore();
  const sent = [];
  const written = [];
  const observed = [];
  const logged = [];
  const priorities = [];
  const client = {
    invoke: async (request) => {
      sent.push(request);
      return request.className.startsWith('messages.GetUnread')
        ? answer
        : { pts: 9, ptsCount: 1 };
    },
  };
  const env = {
    store,
    importer: async () => ({ Api }),
    queue: {
      run: (_key, priority, task) => {
        priorities.push(priority);
        return task();
      },
    },
    connection: { withPeer: (_c, chat, use) => use(`peer:${chat}`) },
    catchUp: { observeResult: (result) => observed.push(result) },
    log: (entry) => logged.push(entry),
  };
  const marks = createUnreadMarks(env, {
    userClient: async () => client,
    write: async (chat, messages) => written.push({ chat, messages }),
  });
  return { store, marks, sent, written, observed, logged, priorities };
};

test('the counts come from the chat list, plus mentions newer than it', () => {
  const read = {
    inboxMaxId: 10,
    unreadMentions: 2,
    unreadReactions: 3,
  };
  const msg = (id, raw, sender = '7') => ({
    id: `msg:telegram:-5:${id}`,
    sender,
    raw,
  });
  const messages = [
    msg(9, { mentioned: true, mediaUnread: true }),
    msg(11, { mentioned: true, mediaUnread: true }),
    msg(12, { mentioned: true, mediaUnread: false }),
    msg(13, { mentioned: true, mediaUnread: true }, 'me'),
  ];
  assert.deepEqual(unreadMarks(messages, read), {
    mentions: 3,
    reactions: 3,
  });
  assert.deepEqual(unreadMarks(messages, null), {
    mentions: 0,
    reactions: 0,
  });
});

test('the marked messages are asked for, stored and given oldest first', async () => {
  const answer = {
    count: 3,
    messages: [
      { id: 30 },
      { id: 12 },
      { id: 21 },
      { className: 'MessageEmpty', id: 5 },
    ],
  };
  const t = await setup(answer);
  const result = await t.marks.marks({ chat: '-5', kind: 'mentions' });
  assert.deepEqual(result, { ok: true, ids: [12, 21, 30], count: 3 });
  assert.equal(t.sent[0].className, 'messages.GetUnreadMentions');
  assert.equal(t.sent[0].peer, 'peer:-5');
  assert.equal(t.written[0].messages.length, 3);
  assert.deepEqual(t.priorities, ['view'], 'the user is waiting');
  const entry = t.logged.find((e) => e.event === 'telegram_unread_marks');
  assert.equal(entry.ids, 3);

  await t.marks.marks({ chat: '-5', kind: 'reactions' });
  assert.equal(t.sent[1].className, 'messages.GetUnreadReactions');
  assert.equal((await t.marks.marks({ chat: '-5', kind: 'pins' })).ok, false);
});

test('a seen mark is read, and the last one reads the whole list', async () => {
  const t = await setup({ messages: [] });
  await t.store.put(
    readLink('-5', { inboxMaxId: 40, unreadMentions: 3, unreadReactions: 2 })
  );
  await t.store.put({
    id: 'msg:telegram:-5:12',
    body: 'mention',
    raw: { mentioned: true, mediaUnread: true },
  });
  await t.marks.readMarks({ chat: '-5', kind: 'mentions', ids: [12] });
  assert.equal(t.sent[0].className, 'messages.ReadMessageContents');
  assert.deepEqual(t.sent[0].id, [12]);
  assert.equal(t.observed[0].className, 'UpdateReadMessagesContents');
  assert.equal((await t.store.get(readLinkId('-5'))).unreadMentions, 2);
  assert.equal(
    (await t.store.get('msg:telegram:-5:12')).raw.mediaUnread,
    false,
    'the local flag cannot create a phantom unread mention after acknowledgement'
  );

  await t.marks.readMarks({
    chat: '-5',
    kind: 'reactions',
    ids: [21],
    last: true,
  });
  assert.equal(t.sent.at(-1).className, 'messages.ReadReactions');
  const read = await t.store.get(readLinkId('-5'));
  assert.equal(read.unreadReactions, 0);
  assert.equal(read.unreadMentions, 2);

  // A channel reads contents through channels.*.
  await t.marks.readMarks({ chat: '-1007', kind: 'mentions', ids: ['4', 'x'] });
  assert.equal(t.sent.at(-1).className, 'channels.ReadMessageContents');
  assert.deepEqual(t.sent.at(-1).id, [4]);

  const before = t.sent.length;
  assert.equal(
    (await t.marks.readMarks({ chat: '-5', kind: 'mentions' })).ok,
    false
  );
  assert.equal(t.sent.length, before, 'nothing to read, nothing asked');
});

test('an authoritative empty marks page reconciles a stale counter without marking contents read', async () => {
  const fixture = await setup({ messages: [], count: 0 });
  await fixture.store.put(readLink('-5', { unreadMentions: 1 }));
  assert.deepEqual(
    (await fixture.marks.marks({ chat: '-5', kind: 'mentions' })).ids,
    []
  );
  assert.equal((await fixture.store.get(readLinkId('-5'))).unreadMentions, 0);
  assert.equal(fixture.sent.length, 1);
  assert.equal(fixture.sent[0].className, 'messages.GetUnreadMentions');
});

const call = async (account, method, path, body) => {
  const req = Object.assign(
    Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []),
    {
      method,
      url: path,
      headers: { 'content-type': 'application/json' },
    }
  );
  const res = {
    status: null,
    body: null,
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = JSON.parse(text);
    },
  };
  const p = path.split('?')[0];
  assert.equal(
    await handleTelegramRoutes(req, res, p, { telegramAccount: account }),
    true
  );
  return res;
};

test('the routes ask the account which marks there are and read them', async () => {
  const asked = [];
  const account = {
    unreadMarks: async (q) => (asked.push(q), { ok: true, ids: [3], count: 1 }),
    readMarks: async (q) => (asked.push(q), { ok: true, read: 1 }),
  };
  const got = await call(
    account,
    'GET',
    '/api/telegram/unread-marks?chat=-5&kind=reactions'
  );
  assert.deepEqual(got.body.ids, [3]);
  const read = await call(account, 'POST', '/api/telegram/read-marks', {
    chat: '-5',
    kind: 'reactions',
    ids: [3],
    last: 1,
  });
  assert.equal(read.body.ok, true);
  assert.deepEqual(asked, [
    { chat: '-5', kind: 'reactions' },
    { chat: '-5', kind: 'reactions', ids: [3], last: true },
  ]);
  const without = await call({}, 'GET', '/api/telegram/unread-marks?chat=1');
  assert.equal(without.status, 501);
});
