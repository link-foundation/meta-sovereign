// The chat screen holds the chat list and a window of the open chat,
// read by page from the server's store (R-Y25 .. R-Y29): the server's
// chat index, the window model, the tabs and the scroll bookkeeping.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import { createChatIndex } from '../src/server/chat-index.js';
import {
  chatKind,
  filterChats,
  summarizeChats,
} from '../src/web/chat-model.js';
import {
  createRefill,
  hasOlder,
  historyComplete,
  isStalled,
  mergePage,
  STALL_MS,
  windowMessages,
} from '../src/web/chat-window.js';
import { addedAfter, followMove } from '../src/web/chat-view.js';

const msg = (chat, n, extra = {}) => ({
  id: `msg:telegram:${chat}:${n}`,
  tokens: [],
  source: 'telegram',
  chat,
  sender: '42',
  body: `m${n}`,
  timestamp: new Date(Date.UTC(2026, 9, 17, 10, 0, n)).toISOString(),
  ...extra,
});

test('the chat index gives each chat’s newest message and pages back', async () => {
  const store = createMemoryStore();
  for (let n = 1; n <= 7; n += 1) {
    await store.put(msg('42', n));
  }
  await store.put(msg('9', 3));
  const index = createChatIndex(store);
  await index.ready();
  const heads = await index.heads();
  assert.deepEqual(heads.map((h) => h.id).sort(), [
    'msg:telegram:42:7',
    'msg:telegram:9:3',
  ]);
  const newest = await index.page('telegram:42', { limit: 3 });
  assert.deepEqual(
    newest.messages.map((m) => m.body),
    ['m5', 'm6', 'm7']
  );
  assert.equal(newest.more, true);
  const older = await index.page('telegram:42', {
    before: 'msg:telegram:42:5',
    limit: 3,
  });
  assert.deepEqual(
    older.messages.map((m) => m.body),
    ['m2', 'm3', 'm4']
  );
  const first = await index.page('telegram:42', {
    before: 'msg:telegram:42:2',
    limit: 3,
  });
  assert.deepEqual(
    first.messages.map((m) => m.body),
    ['m1']
  );
  assert.equal(first.more, false);
  assert.equal(index.count('telegram:42'), 7);
  index.close();
});

test('history read ahead is quiet; a new message is not', async () => {
  const store = createMemoryStore();
  await store.put(msg('42', 5));
  const index = createChatIndex(store);
  await index.ready();
  const events = [];
  index.subscribe((event) => events.push(event));
  await store.put(msg('42', 2));
  await store.put(msg('42', 6));
  const quiet = events.filter((e) => e.link?.id?.startsWith('msg:'));
  assert.deepEqual(
    quiet.map((e) => [e.link.body, Boolean(e.quiet)]),
    [
      ['m2', true],
      ['m6', false],
    ]
  );
  const [head] = await index.heads();
  assert.equal(head.body, 'm6');
  index.close();
});

test('tabs: private, groups and channels, newest first under each', () => {
  assert.equal(chatKind('personal_chat'), 'private');
  assert.equal(chatKind('bot_chat'), 'private');
  assert.equal(chatKind('group'), 'group');
  assert.equal(chatKind('private_supergroup'), 'group');
  assert.equal(chatKind('channel'), 'channel');
  assert.equal(chatKind('public_channel'), 'channel');
  assert.equal(chatKind(null, 1), 'private');
  assert.equal(chatKind(null, 3), 'group');
  const chats = summarizeChats([
    msg('1', 1, { chatType: 'personal_chat' }),
    msg('2', 3, { chatType: 'group' }),
    msg('3', 2, { chatType: 'channel' }),
    msg('4', 4, { chatType: 'personal_chat' }),
  ]);
  assert.deepEqual(
    filterChats(chats, 'all').map((c) => c.chat),
    ['4', '2', '3', '1']
  );
  assert.deepEqual(
    filterChats(chats, 'private').map((c) => c.chat),
    ['4', '1']
  );
  assert.deepEqual(
    filterChats(chats, 'group').map((c) => c.chat),
    ['2']
  );
  assert.deepEqual(
    filterChats(chats, 'channel').map((c) => c.chat),
    ['3']
  );
  assert.equal(filterChats(chats, 'nonsense').length, 4);
});

test('a window grows back by page; `more` follows the oldest page', () => {
  const newest = mergePage(undefined, {
    messages: [msg('42', 5), msg('42', 6)],
    more: true,
  });
  assert.equal(newest.server, true);
  assert.equal(newest.more, true);
  const older = mergePage(newest, {
    messages: [msg('42', 3), msg('42', 4)],
    more: false,
  });
  assert.deepEqual(
    older.messages.map((m) => m.body),
    ['m3', 'm4', 'm5', 'm6']
  );
  assert.equal(older.more, false);
  // The newest page again (a reopen) does not undo how far back it is.
  const again = mergePage(older, {
    messages: [msg('42', 6), msg('42', 7)],
    more: true,
  });
  assert.equal(again.more, false);
  assert.equal(again.messages.length, 5);
});

test('the open chat shows its window, without an older stray above a gap', () => {
  const window = mergePage(undefined, {
    messages: [msg('42', 5), msg('42', 6)],
    more: true,
  });
  // The page holds the head and an old message that was edited.
  const links = [msg('42', 1, { body: 'edited' }), msg('42', 7)];
  const shown = windowMessages(links, 'telegram:42', window);
  assert.deepEqual(
    shown.map((m) => m.body),
    ['m5', 'm6', 'm7']
  );
  // Without a server, what the page holds.
  assert.equal(
    windowMessages(links, 'telegram:42', { server: false }).length,
    2
  );
});

test('older messages come from the store, then from Telegram', () => {
  const links = [{ id: 'history:telegram:42', chat: '42', complete: true }];
  assert.equal(historyComplete(links, '42'), true);
  assert.equal(historyComplete(links, '7'), false);
  const window = { server: true, more: false };
  assert.equal(hasOlder(window, { telegram: true, complete: false }), true);
  assert.equal(hasOlder(window, { telegram: true, complete: true }), false);
  assert.equal(hasOlder({ ...window, more: true }, { telegram: false }), true);
  assert.equal(hasOlder({ server: false }, { telegram: true }), false);
});

test('older messages above are not counted as new ones below', () => {
  const ids = (list) => list.map((id) => ({ id }));
  assert.equal(addedAfter(ids(['a', 'b', 'c']), 'c'), 0);
  assert.equal(addedAfter(ids(['x', 'y', 'a', 'b', 'c']), 'c'), 0);
  assert.equal(addedAfter(ids(['a', 'b', 'c', 'd']), 'b'), 2);
  assert.equal(addedAfter(ids(['a']), null), 1);
  // A queued message that became its link keeps its `clientId`.
  assert.equal(addedAfter([{ id: 'msg:1', clientId: 'q1' }], 'q1'), 0);
  // The last one was deleted: nothing new came below.
  const known = new Set(['a', 'b', 'c']);
  assert.equal(addedAfter(ids(['a', 'b']), 'c', known), 0);
  assert.equal(addedAfter(ids(['a', 'b', 'd']), 'c', known), 1);
  assert.equal(
    followMove({ opened: true, line: false, near: false, added: 3 }),
    'end'
  );
  assert.equal(
    followMove({ opened: true, line: true, near: false, added: 3 }),
    'line'
  );
  assert.equal(
    followMove({ opened: false, line: false, near: false, added: 2 }),
    'count'
  );
  assert.equal(
    followMove({ opened: false, line: false, near: false, added: 0 }),
    null
  );
  assert.equal(
    followMove({
      opened: false,
      line: false,
      near: false,
      added: 0,
      sent: true,
    }),
    'end',
    'a confirmed draft send follows even when the echo already arrived'
  );
});

test('the server serves chat heads, pages and links without messages', async () => {
  const { startServer } = await import('../src/server/index.js');
  const store = createMemoryStore();
  for (let n = 1; n <= 4; n += 1) {
    await store.put(msg('42', n));
  }
  await store.put({ id: 'person:telegram:42', tokens: [], name: 'Alice' });
  const handle = await startServer({
    port: 0,
    store,
    telegramAccount: false,
  });
  const base = `http://127.0.0.1:${handle.port}`;
  try {
    const heads = await (await fetch(`${base}/api/chat/heads`)).json();
    assert.deepEqual(
      heads.map((h) => h.id),
      ['msg:telegram:42:4']
    );
    const page = await (
      await fetch(
        `${base}/api/chat/messages?key=telegram:42&before=msg:telegram:42:4&limit=2`
      )
    ).json();
    assert.deepEqual(
      page.messages.map((m) => m.body),
      ['m2', 'm3']
    );
    assert.equal(page.more, true);
    const links = await (await fetch(`${base}/links?except=msg:`)).json();
    assert.deepEqual(
      links.map((l) => l.id),
      ['person:telegram:42']
    );
  } finally {
    await handle.close();
  }
});

test('a newest page that did not come is asked again while the chat is open', async () => {
  const answers = [null, 'busy', { messages: [] }];
  const asked = [];
  const timers = [];
  let open = 'telegram:1';
  const { refill } = createRefill({
    newest: async (target) => {
      asked.push(target);
      const answer = answers.shift();
      if (answer === 'busy') {
        throw new Error(answer);
      }
      return answer;
    },
    isOpen: (target) => open === target,
    setTimer: (fn, ms) => timers.push([fn, ms]),
    clearTimer: () => {},
  });
  await refill('telegram:1');
  assert.deepEqual(
    timers.map(([, ms]) => ms),
    [2000]
  );
  await timers.shift()[0]();
  assert.deepEqual(
    timers.map(([, ms]) => ms),
    [5000],
    'a failure too'
  );
  await timers.shift()[0]();
  assert.equal(asked.length, 3);
  assert.equal(timers.length, 0, 'the page came: no more tries');

  answers.push(null);
  await refill('telegram:1');
  open = 'telegram:2';
  await timers.shift()[0]();
  assert.equal(asked.length, 4, 'a chat no longer open is not asked again');
});

test('a page that brought nothing older waits before the next ask', () => {
  // Telegram not connected yet answers no messages and no "complete":
  // the chat must not ask again at once, hundreds of times a second.
  const now = 1_000_000;
  assert.equal(isStalled({ stalledAt: 0 }, now), false);
  assert.equal(isStalled({ stalledAt: now - 100 }, now), true);
  assert.equal(isStalled({ stalledAt: now - STALL_MS }, now), false);
  assert.ok(STALL_MS >= 1000);
});
