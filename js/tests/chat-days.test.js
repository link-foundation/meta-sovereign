// Days in a chat and a jump to a date (R-Y106): the dates between days,
// the calendar's month, the store's page around a time and after a
// message, Telegram asked for the first message on a date and the pages
// after it (fake client), the window opened far back with its ceiling,
// and the route. Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  dayBreaks,
  dayKeyOf,
  dayLabel,
  dayStart,
  monthCells,
} from '../src/web/chat-days.js';
import { mergeNewer, underCeiling } from '../src/web/chat-jump.js';
import { windowMessages } from '../src/web/chat-window.js';
import { followMove } from '../src/web/chat-view.js';
import { createChatIndex } from '../src/server/chat-index.js';
import { coverSlice } from '../src/sources/telegram-history.js';
import { createHistoryJump } from '../src/sources/telegram-jump.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { createMemoryStore } from '../src/storage/universal.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();

const msg = (n, timestamp, extra = {}) => ({
  id: `msg:telegram:42:${n}`,
  tokens: [],
  source: 'telegram',
  chat: '42',
  sender: '42',
  body: `m${n}`,
  timestamp,
  ...extra,
});

const t = (key) =>
  ({ 'chat.group.today': 'Today', 'chat.group.yesterday': 'Yesterday' })[key] ??
  key;

test('each day starts with its date: today, yesterday, a day, a year', () => {
  const now = new Date(2026, 9, 23, 15).getTime();
  const messages = [
    msg(1, at(2025, 3, 3)),
    msg(2, at(2026, 10, 21, 9)),
    msg(3, at(2026, 10, 21, 18)),
    msg(4, at(2026, 10, 22)),
    msg(5, at(2026, 10, 23)),
  ];
  const breaks = dayBreaks(messages);
  assert.deepEqual(
    [...breaks.entries()],
    [
      ['msg:telegram:42:1', '2025-03-03'],
      ['msg:telegram:42:2', '2026-10-21'],
      ['msg:telegram:42:4', '2026-10-22'],
      ['msg:telegram:42:5', '2026-10-23'],
    ]
  );
  const label = (key) => dayLabel(key, { locale: 'en-GB', t, now });
  assert.equal(label('2026-10-23'), 'Today');
  assert.equal(label('2026-10-22'), 'Yesterday');
  assert.equal(label('2026-10-21'), '21 October');
  assert.equal(label('2025-03-03'), '3 March 2025');
  assert.equal(dayKeyOf(dayStart('2026-10-21')), '2026-10-21');
  assert.equal(dayKeyOf('not a time'), null);
});

test('a month in the calendar starts on the week’s first day', () => {
  // October 2026 starts on a Thursday.
  const monday = monthCells(2026, 9, 1);
  assert.equal(monday.indexOf(1), 3);
  assert.equal(monday.at(-1), 31);
  const sunday = monthCells(2026, 9, 0);
  assert.equal(sunday.indexOf(1), 4);
  assert.equal(monthCells(2026, 1, 1).filter(Boolean).length, 28);
});

test('the store gives the page around a time and the page after a message', async () => {
  const store = createMemoryStore();
  for (let n = 1; n <= 20; n += 1) {
    await store.put(msg(n, new Date(Date.UTC(2026, 9, n, 12)).toISOString()));
  }
  const index = createChatIndex(store);
  await index.ready();
  const around = await index.page('telegram:42', {
    at: new Date(Date.UTC(2026, 9, 10)).toISOString(),
    limit: 6,
  });
  assert.equal(around.target, 'msg:telegram:42:10');
  assert.deepEqual(
    around.messages.map((m) => m.body),
    ['m7', 'm8', 'm9', 'm10', 'm11', 'm12']
  );
  assert.equal(around.more, true);
  assert.equal(around.newer, true);
  const after = await index.page('telegram:42', {
    after: 'msg:telegram:42:12',
    limit: 5,
  });
  assert.deepEqual(
    after.messages.map((m) => m.body),
    ['m13', 'm14', 'm15', 'm16', 'm17']
  );
  assert.equal(after.newer, true);
  const last = await index.page('telegram:42', {
    after: 'msg:telegram:42:17',
    limit: 5,
  });
  assert.deepEqual(
    last.messages.map((m) => m.body),
    ['m18', 'm19', 'm20']
  );
  assert.equal(last.newer, false);
  const late = await index.page('telegram:42', {
    at: new Date(Date.UTC(2027, 0, 1)).toISOString(),
    limit: 4,
  });
  assert.equal(late.target, null);
  index.close();
});

test('what is read far back joins the stored stretch only once it reaches it', () => {
  const record = { newest: 500, oldest: 300, complete: false };
  assert.equal(
    coverSlice(record, { ids: [10, 11, 12], limit: 3, mode: 'newer' }),
    record
  );
  assert.deepEqual(
    coverSlice(record, { ids: [250, 280, 300], limit: 3, mode: 'newer' }),
    { newest: 500, oldest: 250, complete: false }
  );
  assert.equal(coverSlice(null, { ids: [1], limit: 1, mode: 'newer' }), null);
});

const jumpSetup = (pages, record = null) => {
  const store = createMemoryStore();
  const asked = [];
  const client = {
    getMessages: async (peer, options) => {
      asked.push({ peer, options });
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
    toLinks: (dialog, list) =>
      list.map((m) =>
        msg(m.id, new Date(m.date * 1000).toISOString(), { raw: { id: m.id } })
      ),
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

const tg = (id) => ({ id, date: 1_790_000_000 + id * 60 });

test('Telegram is asked for the first message on a date and the page around it', async () => {
  const date = 1_790_000_000 + 100 * 60;
  const { store, asked, jump } = jumpSetup((options) =>
    options.reverse ? [tg(100), tg(101), tg(102)] : [tg(99), tg(98)]
  );
  const answer = await jump.historyAt({ chat: '42', date, limit: 6 });
  assert.deepEqual(answer, { ok: true, id: 100, newest: false, written: 5 });
  assert.deepEqual(asked[0].options, {
    offsetDate: date,
    reverse: true,
    limit: 3,
  });
  assert.deepEqual(asked[1].options, { offsetDate: date, limit: 3 });
  assert.ok(await store.get('msg:telegram:42:100'));
  // Nothing that late: the chat's newest is where to go.
  const none = jumpSetup(() => []);
  const late = await none.jump.historyAt({ chat: '42', date, limit: 6 });
  assert.equal(late.id, null);
  assert.equal(late.newest, true);
  assert.deepEqual(await jumpSetup(() => []).jump.historyAt({ chat: '42' }), {
    ok: false,
    supported: false,
  });
});

test('the pages after a message: Telegram unless the stretch holds them', async () => {
  const { asked, jump, store } = jumpSetup(() => [tg(101), tg(102)], {
    newest: 500,
    oldest: 102,
    complete: false,
  });
  const page = await jump.newer({ chat: '42', after: 100, limit: 2 });
  assert.deepEqual(page, { written: 2, cached: false, newest: false });
  assert.deepEqual(asked[0].options, {
    offsetId: 100,
    reverse: true,
    limit: 2,
  });
  // Joined: the stretch reaches back to 101 now.
  assert.equal((await store.get('history:telegram:42')).oldest, 101);
  const stored = await jump.newer({ chat: '42', after: 200, limit: 2 });
  assert.deepEqual(stored, { written: 0, cached: true, newest: false });
  assert.equal(asked.length, 1);
});

test('a window opened far back shows nothing newer than its ceiling', () => {
  const links = [msg(50, at(2026, 10, 23)), msg(11, at(2026, 1, 11))];
  const window = {
    server: true,
    messages: [msg(10, at(2026, 1, 10)), msg(11, at(2026, 1, 11))],
    more: true,
    ceiling: msg(11, at(2026, 1, 11)),
  };
  const shown = windowMessages(links, 'telegram:42', window);
  assert.deepEqual(
    shown.map((m) => m.id),
    ['msg:telegram:42:10', 'msg:telegram:42:11']
  );
  const pending = { ...msg('p', at(2026, 10, 23)), pending: true };
  assert.equal(underCeiling([pending], window).length, 1);
  // A page after the ceiling moves it; the last page takes it away.
  const next = mergeNewer(window, {
    messages: [msg(12, at(2026, 1, 12))],
    newer: true,
  });
  assert.equal(next.ceiling.id, 'msg:telegram:42:12');
  const done = mergeNewer(next, {
    messages: [msg(13, at(2026, 1, 13))],
    newer: false,
  });
  assert.equal(done.ceiling, null);
  assert.equal(done.messages.length, 4);
});

test('a window opened far back is not followed to its end', () => {
  const base = { line: false, near: true, added: 2 };
  assert.equal(followMove({ ...base, opened: false }), 'end');
  assert.equal(followMove({ ...base, opened: false, detached: true }), null);
  assert.equal(
    followMove({ ...base, opened: false, detached: true, justSent: true }),
    'end'
  );
});

test('the route asks for a date and for the page after a message', async () => {
  const calls = [];
  const account = {
    historyAt: async (body) => {
      calls.push(['at', body]);
      return { ok: true, id: 7, newest: false };
    },
    newer: async (body) => {
      calls.push(['newer', body]);
      return { written: 0, cached: true, newest: false };
    },
    history: async (body) => {
      calls.push(['history', body]);
      return { written: 0 };
    },
  };
  const post = async (path, body) => {
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
  const route = '/api/telegram/history-at';
  assert.equal((await post(route, { chat: '42' })).status, 400);
  assert.equal((await post(route, { chat: '42', date: 'x' })).status, 400);
  assert.equal((await post(route, { chat: 'a b', date: 9 })).status, 400);
  const ok = await post(route, { chat: '42', date: 1_790_000_000 });
  assert.deepEqual(ok, {
    status: 200,
    payload: { ok: true, id: 7, newest: false },
  });
  await post('/api/telegram/history', { chat: '42', after: 7 });
  await post('/api/telegram/history', { chat: '42', before: 7 });
  assert.deepEqual(
    calls.map(([name]) => name),
    ['at', 'newer', 'history']
  );
  assert.equal(calls[1][1].after, 7);
});
