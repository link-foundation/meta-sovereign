import { readOperatorScope } from '../src/web/operator-prefs.js';
import { unreadCount } from '../src/web/chat-model.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  operatorQueue,
  operatorRevision,
  completeOperatorChat,
} from '../src/web/operator-model.js';
import {
  navigationCounts,
  missedCallCount,
} from '../src/web/navigation-counts.js';

const chat = (id, unread, extra = {}) => ({
  key: `telegram:${id}`,
  source: 'telegram',
  kind: 'private',
  chat: String(id),
  unread,
  last: {
    at: `2026-01-0${id}T00:00:00Z`,
    message: { id: `msg:telegram:${id}:20` },
  },
  ...extra,
});

test('operator queues positive unread counts once, including muted chats, and excludes zero-count marks', () => {
  const items = [
    chat(3, 0),
    chat(2, 4, { muted: true }),
    chat(1, 0, { marked: true }),
  ];
  assert.deepEqual(
    operatorQueue(items).map((c) => c.key),
    ['telegram:2']
  );
  const handled = new Map([['telegram:2', operatorRevision(items[1])]]);
  assert.equal(operatorQueue(items, handled).length, 0);
  assert.equal(
    operatorQueue(
      [
        {
          ...items[1],
          last: { ...items[1].last, message: { id: 'msg:telegram:2:21' } },
        },
      ],
      handled
    ).length,
    1,
    'a new message reenqueues a handled chat'
  );
  assert.deepEqual(navigationCounts(items, 2), {
    chat: 0,
    operator: 1,
    calls: 2,
  });
});

test('Operator defaults to private chats; configured types and badges share the filter', () => {
  const items = ['private', 'group', 'channel'].map((kind, i) =>
    chat(i + 1, 1, { kind })
  );
  assert.deepEqual(
    operatorQueue(items).map((c) => c.kind),
    ['private']
  );
  assert.equal(navigationCounts(items).operator, 1);
  const scope = { private: false, group: true, channel: true };
  assert.deepEqual(
    operatorQueue(items, new Map(), scope).map((c) => c.kind),
    ['group', 'channel']
  );
  assert.equal(navigationCounts(items, 0, scope).operator, 2);
  const storage = (text) => ({ getItem: () => text });
  assert.deepEqual(readOperatorScope(storage(null)), {
    private: true,
    group: false,
    channel: false,
  });
  assert.deepEqual(readOperatorScope(storage('{broken')), {
    private: true,
    group: false,
    channel: false,
  });
  assert.deepEqual(readOperatorScope(storage(JSON.stringify(scope))), scope);
  assert.deepEqual(
    readOperatorScope(storage('{"private":"false","group":true}')),
    { private: true, group: true, channel: false }
  );
});

test('Done acknowledges the displayed boundary and clears a manual mark explicitly', async () => {
  const calls = [];
  const api = {
    telegramRead: async (body) => {
      calls.push(body);
      return { ok: true };
    },
    telegramDialog: async (body) => {
      calls.push(body);
      return { ok: true };
    },
  };
  await completeOperatorChat(api, chat(1, 2, { marked: true }), [
    { id: 'msg:telegram:1:10' },
  ]);
  assert.deepEqual(calls, [
    { chat: '1', maxId: 20 },
    { chat: '1', action: 'unmark' },
  ]);
  await assert.rejects(
    completeOperatorChat(
      { telegramRead: async () => ({ error: 'offline' }) },
      chat(2, 1),
      []
    ),
    /offline/
  );
  await assert.rejects(
    completeOperatorChat(api, { ...chat(1, 1), last: {} }, []),
    /history-required/
  );
});

test('Done uses each other network’s read action and retains failures', async () => {
  let request;
  await completeOperatorChat(
    {
      messageAction: async (...args) => {
        request = args;
        return { ok: true };
      },
    },
    { ...chat(1, 1), source: 'email' },
    []
  );
  assert.deepEqual(request, ['read', { source: 'email', chat: '1' }]);
});

test('missed call badges use chat read markers and reviewed-call boundaries', () => {
  const links = [{ id: 'read:telegram:1', chat: '1', inboxMaxId: 10 }];
  const calls = [
    { chat: '1', id: 10, date: 100, missed: true },
    { chat: '1', id: 11, date: 100, missed: true },
    { chat: '1', id: 12, date: 100, missed: true },
    { chat: '1', id: 13, date: 200, missed: false },
    { chat: '2', id: 14, date: 200, missed: true },
  ];
  assert.equal(missedCallCount(calls, links, { at: 0, ids: [] }, 150), 3);
  assert.equal(
    missedCallCount(calls, links, { at: 100, ids: ['1:11'] }, 150),
    2,
    'a different call in the same second remains unseen'
  );
  assert.equal(
    missedCallCount(calls, links, { at: 200, ids: ['2:14'] }, 150),
    0
  );
});

test('forum topic totals override stale dialog counters without losing later live messages', () => {
  const read = {
    unreadCount: 6,
    inboxMaxId: 1550,
    unreadTopId: 1556,
    forumUnreadCount: 0,
    forumUnreadTopId: 1556,
    forumDialogUnreadCount: 6,
    forumReadInboxMaxId: 1550,
  };
  assert.equal(unreadCount([], read), 0);
  assert.equal(operatorQueue([chat(1, unreadCount([], read))]).length, 0);
  const live = { id: 'msg:telegram:1:1557', sender: 'other' };
  assert.equal(unreadCount([live], read), 1);
  assert.equal(
    unreadCount([live], { ...read, unreadCount: 7, unreadTopId: 1557 }),
    1
  );
  assert.equal(
    unreadCount([], {
      ...read,
      inboxMaxId: 1557,
      unreadCount: 0,
      unreadTopId: 1557,
    }),
    0
  );
});
