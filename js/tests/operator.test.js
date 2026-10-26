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
  chat: String(id),
  unread,
  last: {
    at: `2026-01-0${id}T00:00:00Z`,
    message: { id: `msg:telegram:${id}:20` },
  },
  ...extra,
});

test('operator queues unread conversations once, includes manual marks and muted chats', () => {
  const items = [
    chat(3, 0),
    chat(2, 4, { muted: true }),
    chat(1, 0, { marked: true }),
  ];
  assert.deepEqual(
    operatorQueue(items).map((c) => c.key),
    ['telegram:1', 'telegram:2']
  );
  const handled = new Map([['telegram:2', operatorRevision(items[1])]]);
  assert.equal(operatorQueue(items, handled).length, 1);
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
    chat: 5,
    operator: 2,
    calls: 2,
  });
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
