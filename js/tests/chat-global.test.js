// A jump to a message and a search across Telegram (R-Y107): the store's
// page around a message, Telegram asked for a message far back and the
// page around it, people and chats found by name, messages found in
// every chat (stored, a page at a time), the routes, the words found
// marked, and a found chat opened before it is in the list. Fake
// clients only; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createChatIndex } from '../src/server/chat-index.js';
import { createHistoryJump } from '../src/sources/telegram-jump.js';
import {
  GLOBAL_PAGE,
  createGlobalSearch,
} from '../src/sources/telegram-global.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { marked } from '../src/web/chat-global.js';
import { emptyChat, hintChat } from '../src/web/chat-state.js';
import { createMemoryStore } from '../src/storage/universal.js';

const msg = (n, chat = '42') => ({
  id: `msg:telegram:${chat}:${n}`,
  tokens: [],
  source: 'telegram',
  chat,
  sender: chat,
  body: `m${n}`,
  timestamp: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
});

test('the store gives the page around a message, full at the chat’s end', async () => {
  const store = createMemoryStore();
  for (let n = 1; n <= 100; n += 1) {
    await store.put(msg(n));
  }
  const index = createChatIndex(store);
  const ids = (page) => page.messages.map((m) => Number(m.id.split(':').pop()));
  const mid = await index.page('telegram:42', {
    around: 'msg:telegram:42:50',
    limit: 10,
  });
  assert.deepEqual(ids(mid), [45, 46, 47, 48, 49, 50, 51, 52, 53, 54]);
  assert.equal(mid.target, 'msg:telegram:42:50');
  assert.equal(mid.more, true);
  assert.equal(mid.newer, true);
  const end = await index.page('telegram:42', {
    around: 'msg:telegram:42:99',
    limit: 10,
  });
  assert.deepEqual(ids(end), [91, 92, 93, 94, 95, 96, 97, 98, 99, 100]);
  assert.equal(end.newer, false);
  const start = await index.page('telegram:42', {
    around: 'msg:telegram:42:2',
    limit: 10,
  });
  assert.deepEqual(ids(start).slice(0, 2), [1, 2]);
  assert.equal(start.more, false);
  const none = await index.page('telegram:42', {
    around: 'msg:telegram:42:500',
    limit: 10,
  });
  assert.equal(none.target, null);
  index.close();
});

const jumpSetup = (pages, record = null) => {
  const store = createMemoryStore();
  const asked = [];
  const client = {
    getMessages: async (peer, options) => {
      asked.push(options);
      return pages(options);
    },
  };
  const env = {
    store,
    now: () => Date.UTC(2026, 9, 23),
    queue: { run: (key, priority, task) => task() },
    connection: { open: async () => ({ client }) },
  };
  const tools = {
    credentials: async () => ({ kind: 'user' }),
    toLinks: (dialog, list) => list.map((m) => msg(m.id)),
    writeChanged: async (s, links) => {
      for (const link of links) {
        await s.put(link);
      }
      return links.length;
    },
  };
  const whereIs = async (_env, _tools, _client, chat) => ({
    peer: `peer:${chat}`,
    dialog: { id: chat },
  });
  if (record) {
    store.put({ id: 'history:telegram:42', ...record });
  }
  return { store, asked, jump: createHistoryJump(env, tools, { whereIs }) };
};

test('Telegram is asked for a message far back and the page around it', async () => {
  const { store, asked, jump } = jumpSetup((options) =>
    options.reverse
      ? [{ id: 300 }, { id: 301 }, { id: 302 }]
      : [{ id: 299 }, { id: 298 }]
  );
  const answer = await jump.historyAround({ chat: '42', id: 300, limit: 6 });
  assert.deepEqual(answer, { ok: true, id: 300, newest: false, written: 5 });
  assert.deepEqual(asked, [
    { offsetId: 299, reverse: true, limit: 3 },
    { offsetId: 300, limit: 3 },
  ]);
  assert.ok(await store.get('msg:telegram:42:300'));
  // Gone (deleted): the next one, and the window says it is not there.
  const gone = jumpSetup((options) =>
    options.reverse ? [{ id: 301 }] : [{ id: 299 }]
  );
  const missing = await gone.jump.historyAround({ chat: '42', id: 300 });
  assert.equal(missing.id, 301);
  // The stored stretch holds it: Telegram is not asked.
  const held = jumpSetup(() => [], { newest: 500, oldest: 10 });
  const cached = await held.jump.historyAround({ chat: '42', id: 300 });
  assert.equal(cached.cached, true);
  assert.equal(held.asked.length, 0);
});

// A fake GramJS: requests keep what they were made with.
const request = (name) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { request: name });
    }
  };
const Api = {
  messages: { SearchGlobal: request('SearchGlobal') },
  contacts: { Search: request('Search') },
  InputMessagesFilterEmpty: request('FilterEmpty'),
  InputPeerEmpty: request('PeerEmpty'),
};
const utils = {
  getPeerId: (x) => {
    if (x?.key === undefined) {
      throw new Error('no peer');
    }
    return x.key;
  },
};

const ann = { className: 'User', key: '7', id: 7, firstName: 'Ann' };
const news = {
  className: 'Channel',
  key: '-1009',
  id: 9,
  title: 'Fake News',
  usernames: [{ username: 'fakenews', active: true }],
  participantsCount: 1200,
};
const found = (id, chat, text) => ({
  id,
  peerId: { key: chat },
  date: 1_790_000_000 + id,
  message: text,
  inputChat: { input: chat },
});

const globalSetup = (answers) => {
  const store = createMemoryStore();
  const invoked = [];
  const remembered = [];
  const client = {
    invoke: async (req) => {
      invoked.push(req);
      return answers(req, invoked.length);
    },
  };
  const env = {
    store,
    importer: async () => ({ Api, utils }),
    queue: { run: (key, priority, task) => task() },
    peers: { remember: async (chat) => remembered.push(chat) },
    live: { chats: new Map() },
  };
  const tools = {
    toLinks: telegramDialogLinks,
    dialogOfEntity: (chat, entity) => ({
      id: chat,
      entity,
      title: entity.title ?? entity.firstName,
      isUser: entity.className === 'User',
      isChannel: entity.className === 'Channel',
    }),
    writeChanged: async (s, links) => {
      for (const link of links) {
        await s.put(link);
      }
      return links.length;
    },
  };
  const search = createGlobalSearch(env, {
    userClient: async () => client,
    tools,
  });
  return { store, invoked, remembered, search };
};

test('people and chats are found by name: the user’s own first, each once', async () => {
  const { invoked, remembered, search } = globalSetup(() => ({
    myResults: [{ key: '7' }],
    results: [{ key: '-1009' }, { key: '7' }, { key: 'nobody' }],
    users: [ann],
    chats: [news],
  }));
  const answer = await search.searchPeers({ q: '  fake  ' });
  assert.equal(invoked[0].request, 'Search');
  assert.equal(invoked[0].q, 'fake');
  assert.deepEqual(answer, {
    ok: true,
    peers: [
      {
        chat: '7',
        name: 'Ann',
        username: null,
        kind: 'user',
        members: null,
        mine: true,
      },
      {
        chat: '-1009',
        name: 'Fake News',
        username: 'fakenews',
        kind: 'channel',
        members: 1200,
        mine: false,
      },
    ],
  });
  // Remembered: opening one reads it at once.
  assert.deepEqual(remembered, ['7', '-1009']);
  assert.deepEqual(await search.searchPeers({ q: ' ' }), {
    ok: false,
    supported: false,
  });
});

test('messages are found in every chat, stored, a page at a time', async () => {
  const first = Array.from({ length: GLOBAL_PAGE }, (_, i) =>
    found(1000 - i, i % 2 ? '7' : '-1009', `the fake word ${i}`)
  );
  const { store, invoked, search } = globalSetup((req, n) =>
    n === 1
      ? {
          className: 'messages.MessagesSlice',
          count: 31,
          nextRate: 77,
          messages: first,
          users: [ann],
          chats: [news],
        }
      : { messages: [found(5, '7', 'last fake')], users: [ann], chats: [] }
  );
  const page = await search.searchGlobal({ q: 'fake' });
  assert.equal(invoked[0].request, 'SearchGlobal');
  assert.equal(invoked[0].offsetId, 0);
  assert.equal(invoked[0].offsetPeer.request, 'PeerEmpty');
  assert.equal(page.messages.length, GLOBAL_PAGE);
  assert.equal(page.messages[0].id, 'msg:telegram:-1009:1000');
  assert.equal(page.messages[0].chatName, 'Fake News');
  assert.equal(page.messages[1].chatName, 'Ann');
  assert.equal(page.messages[0].raw, undefined, 'a row, not all of it');
  assert.equal(page.count, 31);
  assert.equal(page.more, true);
  assert.ok(await store.get('msg:telegram:7:999'), 'stored');
  // The next page starts after the last one found.
  const next = await search.searchGlobal({ q: 'fake', cursor: page.cursor });
  assert.equal(invoked[1].offsetRate, 77);
  assert.deepEqual(invoked[1].offsetPeer, { input: '7' });
  assert.equal(invoked[1].offsetId, first.at(-1).id);
  assert.deepEqual(
    next.messages.map((m) => m.id),
    ['msg:telegram:7:5']
  );
  assert.equal(next.more, false);
  assert.equal(next.cursor, null);
  // A cursor it does not know (a restart): nothing more.
  const lost = await search.searchGlobal({ q: 'fake', cursor: 'c999' });
  assert.deepEqual(lost.messages, []);
  assert.equal(invoked.length, 2);
});

const post = async (account, path, body) => {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json' };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = text;
    },
  };
  await handleTelegramRoutes(req, res, path, { telegramAccount: account });
  return { status: res.status, payload: JSON.parse(res.body) };
};

test('the routes search across Telegram and jump to a message', async () => {
  const calls = [];
  const account = {
    searchPeers: async (body) => {
      calls.push(['peers', body]);
      return { ok: true, peers: [] };
    },
    searchGlobal: async (body) => {
      calls.push(['global', body]);
      return { ok: true, messages: [], more: false };
    },
    historyAround: async (body) => {
      calls.push(['around', body]);
      return { ok: true, id: body.id };
    },
    historyAt: async (body) => {
      calls.push(['at', body]);
      return { ok: true, id: 1 };
    },
  };
  assert.equal(
    (await post(account, '/api/telegram/search-peers', { q: ' ' })).status,
    400
  );
  assert.equal(
    (await post(account, '/api/telegram/search-global', { q: 'x'.repeat(500) }))
      .status,
    400
  );
  assert.equal(
    (await post(account, '/api/telegram/search-global', { q: 'a', cursor: 5 }))
      .status,
    400
  );
  await post(account, '/api/telegram/search-peers', { q: 'ann' });
  await post(account, '/api/telegram/search-global', {
    q: 'ann',
    cursor: 'c1',
  });
  const around = await post(account, '/api/telegram/history-at', {
    chat: '42',
    id: 300,
  });
  assert.deepEqual(around.payload, { ok: true, id: 300 });
  await post(account, '/api/telegram/history-at', { chat: '42', date: 9 });
  assert.equal(
    (await post(account, '/api/telegram/history-at', { chat: '42', id: -3 }))
      .status,
    400
  );
  assert.deepEqual(
    calls.map(([name]) => name),
    ['peers', 'global', 'around', 'at']
  );
  assert.deepEqual(calls[1][1], { q: 'ann', cursor: 'c1' });
  assert.equal(calls[2][1].id, 300);
});

test('the words found are marked, whatever their case', () => {
  const parts = marked('Fake news, more FAKE', 'fake');
  assert.equal(parts.length, 3);
  assert.equal(parts[0].type, 'mark');
  assert.equal(parts[0].props.children, 'Fake');
  assert.equal(parts[1], ' news, more ');
  assert.equal(parts[2].props.children, 'FAKE');
  assert.deepEqual(marked('plain', ''), ['plain']);
});

test('a found chat opens with its name and kind before it is in the list', () => {
  hintChat({
    source: 'telegram',
    chat: '-1009',
    name: 'Fake News',
    kind: 'channel',
  });
  const chat = emptyChat([], { source: 'telegram', chat: '-1009' });
  assert.equal(chat.name, 'Fake News');
  assert.equal(chat.kind, 'channel');
  assert.equal(chat.personal, false);
  hintChat({ source: 'telegram', chat: '7', name: 'Ann', kind: 'user' });
  assert.equal(
    emptyChat([], { source: 'telegram', chat: '7' }).kind,
    'private'
  );
});
