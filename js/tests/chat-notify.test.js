// Notifications of new messages (R-Y134): what is news, what a
// notification says, the title's unread count, the kept choices.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRESH_MS,
  freshChats,
  notificationOf,
  readPref,
  titled,
  unreadTotal,
  writePref,
} from '../src/web/chat-notify.js';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const t = (key) => key;
const chat = (key, id, more = {}) => ({
  key,
  source: 'telegram',
  chat: key.split(':')[1],
  name: `Chat ${key}`,
  personal: false,
  unread: 1,
  muted: false,
  ...more,
  last: {
    body: 'hello',
    mine: false,
    at: new Date(NOW - 1000).toISOString(),
    senderName: 'Ann',
    message: { id, body: 'hello', senderName: 'Ann', sender: '5' },
    ...more.last,
  },
});

test('nothing is news on the first look', () => {
  const { seen, fresh } = freshChats(null, [chat('telegram:1', 'a')], {
    now: NOW,
  });
  assert.equal(fresh.length, 0);
  assert.equal(seen.get('telegram:1'), 'a');
});

test('a new incoming message in a chat that is not muted is news', () => {
  const first = freshChats(null, [chat('telegram:1', 'a')], { now: NOW });
  const { fresh } = freshChats(first.seen, [chat('telegram:1', 'b')], {
    now: NOW,
  });
  assert.deepEqual(
    fresh.map((c) => c.key),
    ['telegram:1']
  );
  // The same message again is not.
  const again = freshChats(first.seen, [chat('telegram:1', 'a')], {
    now: NOW,
  });
  assert.equal(again.fresh.length, 0);
});

test('a chat that first shows with a new message is news', () => {
  const first = freshChats(null, [chat('telegram:1', 'a')], { now: NOW });
  const { fresh } = freshChats(
    first.seen,
    [chat('telegram:1', 'a'), chat('telegram:2', 'x')],
    { now: NOW }
  );
  assert.deepEqual(
    fresh.map((c) => c.key),
    ['telegram:2']
  );
});

test('muted, mine, read, old and the open chat are not news', () => {
  const seen = new Map([['telegram:1', 'a']]);
  const cases = [
    chat('telegram:1', 'b', { muted: true }),
    chat('telegram:1', 'b', { last: { mine: true } }),
    chat('telegram:1', 'b', { unread: 0 }),
    chat('telegram:1', 'b', {
      last: { at: new Date(NOW - FRESH_MS - 1).toISOString() },
    }),
  ];
  for (const one of cases) {
    assert.equal(freshChats(seen, [one], { now: NOW }).fresh.length, 0);
  }
  const open = freshChats(seen, [chat('telegram:1', 'b')], {
    now: NOW,
    open: 'telegram:1',
  });
  assert.equal(open.fresh.length, 0);
  assert.equal(open.seen.get('telegram:1'), 'b');
});

test('a notification names the chat, the sender and the text', () => {
  const group = chat('telegram:-1', 'a', { kind: 'group' });
  const said = notificationOf(t, group);
  assert.equal(said.title, 'Chat telegram:-1');
  assert.match(said.body, /hello$/);
  assert.match(said.body, /^Ann: /);
  const person = notificationOf(t, chat('telegram:5', 'a', { personal: true }));
  assert.equal(person.body, 'hello');
  assert.deepEqual(notificationOf(t, group, false), {
    title: 'appName',
    body: 'chat.notify.hidden',
  });
});

test('the title counts unread messages of chats that are not muted', () => {
  const chats = [
    chat('telegram:1', 'a', { unread: 3 }),
    chat('telegram:2', 'b', { unread: 4, muted: true }),
    chat('telegram:3', 'c', { unread: 0 }),
  ];
  assert.equal(unreadTotal(chats), 3);
  assert.equal(titled('meta-sovereign', 3), '(3) meta-sovereign');
  assert.equal(titled('meta-sovereign', 0), 'meta-sovereign');
  assert.equal(titled('x', 120), '(99+) x');
});

test('choices are kept as on or off, with a fallback', () => {
  const kept = new Map();
  const storage = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => kept.set(k, v),
  };
  assert.equal(readPref('k', true, storage), true);
  assert.equal(readPref('k', false, storage), false);
  writePref('k', false, storage);
  assert.equal(readPref('k', true, storage), false);
  writePref('k', true, storage);
  assert.equal(readPref('k', false, storage), true);
  const broken = {
    getItem: () => {
      throw new Error('private');
    },
  };
  assert.equal(readPref('k', true, broken), true);
});
