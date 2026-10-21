// Search in a chat (R-Y98): Telegram is asked through the queue, the
// messages found are stored, ids come back newest first with Telegram's
// count; a chat off Telegram is searched in what the page holds. Fake
// client; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createActions } from '../src/sources/telegram-actions.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { SEARCH_PAGE } from '../src/sources/telegram-search.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { localMatches } from '../src/web/chat-search.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

const setup = (found) => {
  const store = createMemoryStore();
  const asked = [];
  const queued = [];
  const client = {
    getMessages: async (peer, options) => {
      asked.push({ peer, options });
      return found(options);
    },
  };
  const env = {
    store,
    live: createTelegramLive({ store, toLinks: telegramDialogLinks }),
    importer: async () => ({ Api: {} }),
    log: () => {},
    queue: {
      run: (key, priority, task) => {
        queued.push({ key, priority });
        return task();
      },
    },
    connection: {
      open: async () => ({ client }),
      withPeer: (_client, chat, use) => use(`peer:${chat}`),
    },
    peers: {
      input: async (chat) => `peer:${chat}`,
      dialog: async (chat) => ({ id: chat, isUser: true }),
    },
    catchUp: { observeResult: () => {} },
    channels: { observe: async () => {} },
  };
  const actions = createActions(env, {
    credentials: async () => ({ kind: 'user' }),
    toLinks: telegramDialogLinks,
    writeChanged: async (s, links) => {
      for (const link of links) {
        await s.put(link);
      }
      return links.length;
    },
  });
  return { store, asked, queued, actions };
};

const message = (id, text) => ({
  id,
  message: text,
  date: 1_760_000_000 + id,
  senderId: 42,
  peerId: { userId: 42 },
});

const list = (messages, total) =>
  Object.assign([...messages], { total: total ?? messages.length });

test('Telegram is asked, newest first; what it finds is stored (R-Y98)', async () => {
  const { store, asked, queued, actions } = setup(() =>
    list([message(30, 'the plan, v3'), message(12, 'a plan')], 2)
  );
  const answer = await actions.searchChat({ chat: '42', q: '  plan ' });
  assert.deepEqual(answer, { ok: true, ids: [30, 12], count: 2, more: false });
  assert.deepEqual(asked[0], {
    peer: 'peer:42',
    options: { search: 'plan', limit: SEARCH_PAGE },
  });
  assert.equal(queued[0].priority, 'view');
  assert.equal((await store.get('msg:telegram:42:30')).body, 'the plan, v3');
});

test('a full page has more; the next page starts below the last id (R-Y98)', async () => {
  const page = Array.from({ length: SEARCH_PAGE }, (_, i) =>
    message(200 - i, `plan ${i}`)
  );
  const { asked, actions } = setup((options) =>
    options.offsetId ? list([message(1, 'first plan')], 51) : list(page, 51)
  );
  const first = await actions.searchChat({ chat: '42', q: 'plan' });
  assert.equal(first.more, true);
  assert.equal(first.count, 51);
  const next = await actions.searchChat({
    chat: '42',
    q: 'plan',
    offsetId: first.ids.at(-1),
  });
  assert.equal(asked[1].options.offsetId, 151);
  assert.deepEqual(next.ids, [1]);
  assert.equal(next.more, false);
});

test('no words or no chat: Telegram is not asked (R-Y98)', async () => {
  const { asked, actions } = setup(() => list([]));
  assert.deepEqual(await actions.searchChat({ chat: '42', q: '   ' }), {
    ok: false,
    supported: false,
  });
  assert.deepEqual(await actions.searchChat({ q: 'plan' }), {
    ok: false,
    supported: false,
  });
  assert.equal(asked.length, 0);
});

test('the route checks the chat and the words (R-Y98)', async () => {
  const calls = [];
  const account = {
    searchChat: async (body) => {
      calls.push(body);
      return { ok: true, ids: [], count: 0, more: false };
    },
  };
  const post = async (body) => {
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
    await handleTelegramRoutes(req, res, '/api/telegram/search', {
      telegramAccount: account,
    });
    return { status: res.status, payload: JSON.parse(res.body) };
  };
  assert.equal((await post({ chat: '42', q: '' })).status, 400);
  assert.equal((await post({ chat: 'x; y', q: 'plan' })).status, 400);
  assert.equal((await post({ chat: '42', q: 'a'.repeat(300) })).status, 400);
  const ok = await post({ chat: '-1001', q: 'plan', offsetId: 9 });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls, [{ chat: '-1001', q: 'plan', offsetId: 9 }]);
});

test('a chat off Telegram: what the page holds, newest first (R-Y98)', () => {
  const messages = [
    { id: 'a', body: 'Plan for Monday' },
    { id: 'b', body: 'nothing here' },
    { id: 'c', body: 'the PLAN changed' },
    { id: 'd', body: 'plan (sending)', pending: true },
  ];
  assert.deepEqual(localMatches(messages, 'plan'), ['c', 'a']);
  assert.deepEqual(localMatches(messages, '  '), []);
});
