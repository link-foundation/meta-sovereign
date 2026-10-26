// The chat holds up like a messenger when things go wrong: updates missed
// while the connection was down are fetched (getDifference), reading a
// chat marks it read, drafts follow the user across devices, and a
// message that could not go out is tried again by itself or waits for the
// user — in order, never twice. Fakes stand in for Telegram and the
// browser; nothing here touches the network.
// See docs/CHAT-REFERENCES.md and docs/case-studies/chat-reliability/.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import {
  TELEGRAM_STATE_ID,
  createPtsCounter,
  createTelegramCatchUp,
  markedId,
  ptsStep,
} from '../src/sources/telegram-catchup.js';
import {
  connectionStateOf,
  updateEffect,
} from '../src/sources/telegram-updates.js';
import {
  createTelegramLive,
  readLinkId,
} from '../src/sources/telegram-account-live.js';
import { splitMessage } from '../src/sources/telegram-send.js';
import {
  afterFailure,
  cascade,
  keptDrafts,
  nextToSend,
  readSaved,
  requeueFailed,
  restoreOutbox,
  retryDelay,
  waitsForNetwork,
  writeSaved,
} from '../src/web/chat-outbox.js';
import {
  chatMessages,
  cloudDraft,
  deliveryStatus,
  firstUnreadId,
  readInboxUpTo,
  summarizeChats,
  unreadCount,
} from '../src/web/chat-model.js';
import {
  readReadReceipts,
  writeReadReceipts,
} from '../src/web/privacy-prefs.js';

// Timers the test fires by hand.
const manualTimers = () => {
  let next = 1;
  const due = new Map();
  return {
    setTimeout: (fn, ms) => {
      const id = next;
      next += 1;
      due.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => due.delete(id),
    pending: () => [...due.values()].map((t) => t.ms),
    fire: () => {
      const all = [...due.values()];
      due.clear();
      for (const t of all) {
        t.fn();
      }
    },
  };
};

// Let the promises started by an event run to the end.
const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => globalThis.setImmediate(resolve));
  }
};

const step = (pts, count = 1) => ({
  className: 'UpdateNewMessage',
  pts,
  ptsCount: count,
});

test('the update counter follows, skips repeats and waits 0.7 s on a gap', () => {
  const timers = manualTimers();
  let gaps = 0;
  let moves = 0;
  const counter = createPtsCounter({
    timers,
    onGap: () => {
      gaps += 1;
    },
    onMove: () => {
      moves += 1;
    },
  });
  counter.set({ pts: 10, qts: 0, date: 1, seq: 0 });
  counter.step(step(11));
  assert.equal(counter.get().pts, 11);
  counter.step(step(11)); // already applied
  assert.equal(counter.get().pts, 11);
  assert.equal(moves, 1);

  // 13 arrives before 12: it waits, and the gap timer is armed.
  counter.step(step(13));
  assert.equal(counter.get().pts, 11);
  assert.equal(counter.pending(), 1);
  assert.deepEqual(timers.pending(), [700]);
  // 12 fills the gap: both apply and the timer is dropped.
  counter.step(step(12));
  assert.equal(counter.get().pts, 13);
  assert.equal(counter.pending(), 0);
  assert.deepEqual(timers.pending(), []);

  // A gap that stays open asks for the difference.
  counter.step(step(20, 2));
  timers.fire();
  assert.equal(gaps, 1);

  // Channels count on their own; they never move this counter.
  assert.equal(
    ptsStep({ className: 'UpdateNewChannelMessage', pts: 5, ptsCount: 1 }),
    null
  );
  assert.equal(markedId({ className: 'Channel', id: 7 }), '-1007');
  assert.equal(markedId({ className: 'Chat', id: 7 }), '-7');
  assert.equal(markedId({ className: 'User', id: 7 }), '7');
});

// A fake GramJS: requests are plain objects, answers come from a script.
const fakeApi = () => {
  const request = (name) =>
    class {
      constructor(args = {}) {
        Object.assign(this, args, { request: name });
      }
    };
  return {
    updates: {
      GetState: request('GetState'),
      GetDifference: request('GetDifference'),
    },
  };
};

const fakeClient = (answers) => {
  const client = {
    asked: [],
    handlers: [],
    invoke: async (req) => {
      client.asked.push(req);
      const next = answers.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    addEventHandler: (fn) => client.handlers.push(fn),
  };
  return client;
};

const catchUpWith = (store, { timers = manualTimers(), resync } = {}) => {
  const handled = [];
  const resyncs = [];
  const states = [];
  const catchUp = createTelegramCatchUp({
    store,
    importer: async () => ({ Api: fakeApi() }),
    handle: async (client, update) => handled.push(update),
    resync:
      resync ??
      (async (reason) => {
        resyncs.push(reason);
      }),
    onConnection: (state) => states.push(state),
    timers,
  });
  return { catchUp, handled, resyncs, states, timers };
};

const message = (id, text) => ({
  className: 'Message',
  id,
  message: text,
  peerId: { userId: 5 },
});

test('catch-up: a new account starts from now, then replays every slice', async () => {
  const store = createMemoryStore();
  const client = fakeClient([
    { pts: 10, qts: 0, date: 100, seq: 1 }, // GetState
    {
      className: 'updates.DifferenceSlice',
      newMessages: [message(1, 'one')],
      otherUpdates: [],
      users: [{ className: 'User', id: 5 }],
      chats: [],
      intermediateState: { pts: 12, qts: 0, date: 110, seq: 2 },
    },
    {
      className: 'updates.Difference',
      newMessages: [message(2, 'two')],
      otherUpdates: [
        { className: 'UpdateReadHistoryInbox', peer: { userId: 5 }, maxId: 2 },
      ],
      users: [],
      chats: [],
      state: { pts: 15, qts: 0, date: 120, seq: 3 },
    },
  ]);
  const { catchUp, handled, states } = catchUpWith(store);
  await catchUp.attach(client, { id: 77 });
  assert.equal(client.asked[0].request, 'GetState');
  assert.equal(catchUp.state().pts, 10);
  assert.deepEqual(states, [1], 'attached means connected');
  const saved = await store.get(TELEGRAM_STATE_ID);
  assert.equal(saved.account, '77');
  assert.equal(saved.pts, 10);

  await catchUp.run('manual');
  assert.equal(client.asked[1].request, 'GetDifference');
  assert.equal(client.asked[1].pts, 10);
  assert.equal(client.asked[2].pts, 12, 'the next slice starts where it ended');
  assert.deepEqual(
    handled.map((u) => u.className),
    ['UpdateNewMessage', 'UpdateNewMessage', 'UpdateReadHistoryInbox']
  );
  assert.equal(handled[0].message.message, 'one');
  assert.equal(handled[0]._entities.get('5').id, 5);
  assert.equal(catchUp.state().pts, 15);
  assert.equal((await store.get(TELEGRAM_STATE_ID)).pts, 15);
  await catchUp.stop();
});

test('catch-up: a saved number resumes; too long re-reads the chats', async () => {
  const store = createMemoryStore();
  await store.put({
    id: TELEGRAM_STATE_ID,
    account: '77',
    pts: 40,
    qts: 0,
    date: 1,
    seq: 0,
  });
  const client = fakeClient([
    { className: 'updates.DifferenceTooLong', pts: 99 },
    { className: 'updates.DifferenceEmpty', date: 200, seq: 9 },
  ]);
  const { catchUp, resyncs } = catchUpWith(store);
  await catchUp.attach(client, { id: 77 });
  assert.equal(client.asked[0].request, 'GetDifference');
  assert.equal(client.asked[0].pts, 40, 'no GetState for a known account');
  assert.deepEqual(resyncs, ['difference-too-long']);
  assert.equal(catchUp.state().pts, 99);
  await catchUp.run('manual');
  assert.equal(catchUp.state().date, 200);
  await catchUp.stop();
});

test('catch-up: another account does not take the saved number', async () => {
  const store = createMemoryStore();
  await store.put({ id: TELEGRAM_STATE_ID, account: '1', pts: 40 });
  const client = fakeClient([{ pts: 5, qts: 0, date: 1, seq: 0 }]);
  const { catchUp } = catchUpWith(store);
  await catchUp.attach(client, { id: 2 });
  assert.equal(client.asked[0].request, 'GetState');
  assert.equal(catchUp.state().pts, 5);
  await catchUp.stop();
});

test('catch-up respects a Telegram wait without retry storms or false gateway errors', async () => {
  const store = createMemoryStore();
  const timers = manualTimers();
  const logs = [];
  let now = 0;
  const client = fakeClient([
    { pts: 10, qts: 0, date: 1, seq: 0 },
    Object.assign(new Error('FLOOD_WAIT_20'), {
      errorMessage: 'FLOOD_WAIT_20',
    }),
    { className: 'updates.DifferenceEmpty', date: 2, seq: 1 },
  ]);
  const catchUp = createTelegramCatchUp({
    store,
    timers,
    now: () => now,
    importer: async () => ({ Api: fakeApi() }),
    handle: async () => {},
    log: (entry) => logs.push(entry),
  });
  try {
    await catchUp.attach(client, { id: 77 });
    await catchUp.run('poll');
    assert.ok(timers.pending().includes(20000));
    await catchUp.run('poll');
    assert.equal(client.asked.length, 2, 'polling cannot bypass Telegram wait');
    assert.equal(logs.at(-1).event, 'telegram_catch_up_waits');
    assert.equal(logs.at(-1).level, 'warn');
    now = 20000;
    timers.fire();
    await settle();
    assert.equal(client.asked.length, 3);
  } finally {
    await catchUp.stop();
  }
});

test('catch-up: on reconnect, on a gap, and following our own sends', async () => {
  const store = createMemoryStore();
  const empty = { className: 'updates.DifferenceEmpty', date: 1, seq: 0 };
  const client = fakeClient([
    { pts: 10, qts: 0, date: 1, seq: 0 },
    empty,
    empty,
  ]);
  const { catchUp, timers } = catchUpWith(store);
  await catchUp.attach(client, { id: 1 });
  assert.equal(client.handlers.length, 1);
  const observe = client.handlers[0];

  // The connection dropped and came back: fetch what was missed.
  observe({ state: -1 });
  observe({ state: 1 });
  await settle();
  assert.equal(client.asked[1].request, 'GetDifference');

  // Our send's answer moves the counter (GramJS does not dispatch it).
  catchUp.observeResult({
    className: 'UpdateShortSentMessage',
    pts: 11,
    ptsCount: 1,
  });
  assert.equal(catchUp.state().pts, 11);

  // A gap that stays open for 0.7 s.
  observe(step(14));
  assert.ok(timers.pending().includes(700));
  timers.fire();
  await settle();
  assert.equal(client.asked.length, 3);
  await catchUp.stop();
});

test('connection states and read/draft updates become effects', () => {
  assert.equal(connectionStateOf({ state: 0 }), 0);
  assert.equal(connectionStateOf({ className: 'X', state: 1 }), null);
  assert.deepEqual(
    updateEffect({
      className: 'UpdateReadHistoryInbox',
      peer: { userId: 5 },
      maxId: 9,
    }),
    { kind: 'read-inbox', chat: '5', maxId: 9 }
  );
  assert.deepEqual(
    updateEffect({
      className: 'UpdateReadChannelInbox',
      channelId: 3,
      maxId: 4,
    })?.chat,
    '-1003'
  );
  assert.deepEqual(
    updateEffect({
      className: 'UpdateDraftMessage',
      peer: { userId: 5 },
      draft: { message: 'hi', date: 10 },
    }),
    { kind: 'draft', chat: '5', text: 'hi', date: 10 }
  );
  // A topic's draft is not the chat's.
  assert.equal(
    updateEffect({
      className: 'UpdateDraftMessage',
      peer: { userId: 5 },
      topMsgId: 3,
      draft: { message: 'x' },
    }),
    null
  );
});

test('a read on another device and a draft land on the chat read link', async () => {
  const store = createMemoryStore();
  const live = createTelegramLive({ store, now: () => 1000 });
  await live.handle(null, {
    className: 'UpdateReadHistoryInbox',
    peer: { userId: 5 },
    maxId: 9,
  });
  await live.handle(null, {
    className: 'UpdateReadHistoryInbox',
    peer: { userId: 5 },
    maxId: 7, // older: never backwards
  });
  await live.handle(null, {
    className: 'UpdateDraftMessage',
    peer: { userId: 5 },
    draft: { message: 'half-written', date: 10 },
  });
  const read = await store.get(readLinkId('5'));
  assert.equal(read.inboxMaxId, 9);
  assert.equal(read.unreadCount, 0);
  assert.equal(read.draft, 'half-written');
});

test('splitting never cuts an emoji in half', () => {
  const parts = splitMessage('aaa😀bbb', 4);
  assert.deepEqual(parts, ['aaa', '😀bb', 'b']);
  assert.equal(parts.join(''), 'aaa😀bbb');
});

const routeAccount = () => {
  const calls = [];
  return {
    calls,
    status: async () => ({ connected: true, at: 'x' }),
    sync: async () => ({ ok: true }),
    history: async () => ({ written: 0 }),
    markRead: async (body) => {
      calls.push(['read', body]);
      return { ok: true };
    },
    saveDraft: async (body) => {
      calls.push(['draft', body]);
      return { ok: true };
    },
    stop: async () => {},
    live: {},
  };
};

test('the server marks chats read and saves drafts on Telegram', async () => {
  const { startServer } = await import('../src/server/index.js');
  const account = routeAccount();
  const server = await startServer({
    store: createMemoryStore(),
    port: 0,
    enableSync: false,
    enableHandlers: false,
    automations: { scheduler: false },
    telegramAccount: account,
  });
  const post = async (path, body) => {
    const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    const read = await post('/api/telegram/read', { chat: '5', maxId: 9 });
    assert.equal(read.status, 200);
    const draft = await post('/api/telegram/draft', { chat: '5', text: 'hi' });
    assert.equal(draft.status, 200);
    const long = await post('/api/telegram/draft', {
      chat: '5',
      text: 'x'.repeat(20_001),
    });
    assert.equal(long.status, 400);
    assert.equal(long.body.code, 'too-long');
    assert.deepEqual(account.calls, [
      ['read', { chat: '5', maxId: 9 }],
      ['draft', { chat: '5', text: 'hi' }],
    ]);
  } finally {
    await server.close();
  }
});

// ---- the browser's outbox ------------------------------------------

const item = (clientId, fields = {}) => ({
  clientId,
  key: 'telegram:5',
  source: 'telegram',
  chat: '5',
  text: `text ${clientId}`,
  at: '2026-10-17T10:00:00.000Z',
  status: 'queued',
  attempts: 0,
  ...fields,
});

test('outbox: failures that pass are tried again, with growing waits', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 7, 20].map(retryDelay),
    [1000, 2000, 4000, 8000, 60_000, 60_000]
  );
  const now = 1_000_000;
  const net = afterFailure(item('a'), { code: 'network' }, now);
  assert.equal(net.status, 'waiting');
  assert.equal(net.retryAt, now + 1000);
  assert.ok(waitsForNetwork(net));
  const again = afterFailure(net, { code: 'network' }, now);
  assert.equal(again.retryAt, now + 2000);

  // Telegram's flood wait: exactly as long as asked, plus a second.
  const flood = afterFailure(
    item('b'),
    { code: 'flood-wait', retryAfter: 12 },
    now
  );
  assert.equal(flood.status, 'waiting');
  assert.equal(flood.retryAt, now + 13_000);
  // Hours: the user decides.
  assert.equal(
    afterFailure(item('c'), { code: 'flood-wait', retryAfter: 3600 }, now)
      .status,
    'failed'
  );

  // An unknown failure: a few tries, then the user decides.
  let tried = item('d');
  for (let i = 0; i < 3; i += 1) {
    tried = afterFailure(tried, { code: 'send-failed' }, now);
    assert.equal(tried.status, 'waiting');
  }
  assert.equal(
    afterFailure(tried, { code: 'send-failed' }, now).status,
    'failed'
  );

  // No right to write: no retry.
  const forbidden = afterFailure(item('e'), { code: 'write-forbidden' }, now);
  assert.equal(forbidden.status, 'failed');
  assert.equal(forbidden.code, 'write-forbidden');
});

test('outbox: one at a time, in order; a wait holds the chat', () => {
  const now = 5000;
  const items = [
    item('a', { status: 'waiting', retryAt: now + 3000 }),
    item('b'),
    item('c', { key: 'telegram:6' }),
  ];
  assert.deepEqual(nextToSend(items, 'telegram:5', now), { wait: 3000 });
  assert.equal(nextToSend(items, 'telegram:6', now).item.clientId, 'c');
  assert.equal(
    nextToSend(items, 'telegram:5', now + 3000).item.clientId,
    'a',
    'the waiting one goes first, then the rest'
  );
  const busy = [item('a', { status: 'sending' }), item('b')];
  assert.equal(nextToSend(busy, 'telegram:5', now), null);
  // A failed one does not block what was typed after it.
  const failedFirst = [item('a', { status: 'failed' }), item('b')];
  assert.equal(nextToSend(failedFirst, 'telegram:5', now).item.clientId, 'b');
});

test('outbox: a lasting failure fails the queue behind it; resend keeps order', () => {
  const items = [
    item('a', { status: 'failed', code: 'write-forbidden' }),
    item('b'),
    item('c'),
    item('x', { key: 'telegram:6' }),
  ];
  const after = cascade(items, items[0]);
  assert.deepEqual(
    after.map((p) => [p.clientId, p.status, p.code ?? null]),
    [
      ['a', 'failed', 'write-forbidden'],
      ['b', 'failed', 'after-failure'],
      ['c', 'failed', 'after-failure'],
      ['x', 'queued', null],
    ]
  );
  const again = requeueFailed(after, 'telegram:5');
  assert.deepEqual(
    again.map((p) => p.status),
    ['queued', 'queued', 'queued', 'queued']
  );
  assert.equal(nextToSend(again, 'telegram:5').item.clientId, 'a');
});

test('outbox: a reload resumes with the same ids; storage may be missing', () => {
  const saved = [
    item('a', { status: 'sending' }),
    item('b', { status: 'failed' }),
    { clientId: 'broken' },
    null,
  ];
  const restored = restoreOutbox(saved);
  assert.deepEqual(
    restored.map((p) => [p.clientId, p.status]),
    [
      ['a', 'queued'],
      ['b', 'failed'],
    ]
  );
  assert.deepEqual(restoreOutbox('nonsense'), []);

  const memory = new Map();
  const storage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
  assert.equal(writeSaved('k', [1, 2], storage), true);
  assert.deepEqual(readSaved('k', [], storage), [1, 2]);
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(writeSaved('k', [1], blocked), false);
  assert.deepEqual(readSaved('k', ['fallback'], blocked), ['fallback']);
  assert.deepEqual(keptDrafts({ a: 'hi', b: '  ', c: 3, '': 'x' }), {
    a: 'hi',
  });

  // Read receipts: on unless turned off.
  assert.equal(readReadReceipts(storage), true);
  writeReadReceipts(false, storage);
  assert.equal(readReadReceipts(storage), false);
  writeReadReceipts(true, storage);
  assert.equal(readReadReceipts(storage), true);
});

// ---- what the chat shows -------------------------------------------

const msg = (id, sender, fields = {}) => ({
  id: `msg:telegram:5:${id}`,
  source: 'telegram',
  chat: '5',
  sender,
  body: `m${id}`,
  timestamp: `2026-10-17T10:00:${String(id).padStart(2, '0')}.000Z`,
  ...fields,
});

test('unread counts follow Telegram and reset when read anywhere', () => {
  const read = {
    id: readLinkId('5'),
    source: 'telegram',
    chat: '5',
    inboxMaxId: 3,
    unreadCount: 2,
    unreadTopId: 4,
    draft: 'later',
  };
  const links = [
    msg(3, '5'),
    msg(4, '5'),
    msg(5, '5'), // arrived after the chat list: one more
    msg(6, 'me'), // ours never counts
    read,
  ];
  assert.equal(summarizeChats(links)[0].unread, 3);
  assert.equal(readInboxUpTo(links, 'telegram:5'), 3);
  assert.equal(cloudDraft(links, 'telegram:5'), 'later');
  assert.equal(cloudDraft([], 'telegram:5'), undefined);
  // Read on the phone up to 5.
  const after = { ...read, inboxMaxId: 5, unreadCount: 0, unreadTopId: 5 };
  assert.equal(unreadCount(links.slice(0, 4), after), 0);
  // No read link (another network): no count.
  assert.equal(unreadCount(links.slice(0, 4), null), 0);

  const messages = chatMessages(links, 'telegram:5');
  assert.equal(firstUnreadId(messages, 3), 'msg:telegram:5:4');
  assert.equal(firstUnreadId(messages, 0), null);
  assert.equal(firstUnreadId(messages, 6), null);
});

test('delivery: queued and waiting show a clock; waiting says so', () => {
  assert.equal(deliveryStatus({ sender: 'me', status: 'queued' }), 'sending');
  assert.equal(deliveryStatus({ sender: 'me', status: 'waiting' }), 'waiting');
  const shown = chatMessages([], 'telegram:5', {
    pending: [item('a', { status: 'waiting', retryAt: 9, code: 'network' })],
  });
  assert.equal(shown[0].delivery, 'waiting');
  assert.equal(shown[0].retryAt, 9);
});
