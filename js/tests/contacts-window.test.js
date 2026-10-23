// The Contacts window and read times in private chats (R-Y189): the
// statuses and read-time source, Telegram's errors as codes, the routes,
// and the page's pure helpers (sorting, search, status lines, read-time
// lines with a fixed `now`). Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createContactsActions,
  readFailure,
} from '../src/sources/telegram-contacts.js';
import { named, postRoute } from './helpers/telegram-route.js';
import {
  filterContacts,
  mergeStatuses,
  seenAt,
  sortContacts,
  statusLine,
} from '../src/web/chat-contacts-window.js';
import { hasReadTime, readTimeLine } from '../src/web/chat-read-time.js';
import { menuItems } from '../src/web/chat-selection.js';
import { translate } from '../src/web/i18n.js';

const Api = {
  contacts: { GetStatuses: named('GetStatuses') },
  messages: { GetOutboxReadDate: named('GetOutboxReadDate') },
};

const make = (answer) => {
  const log = [];
  const actions = createContactsActions(
    {
      importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
      queue: { run: async (_k, _p, fn) => fn() },
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => ({
        invoke: async (request) => {
          log.push(request);
          const next = answer(request);
          if (next instanceof Error) {
            throw next;
          }
          return next;
        },
      }),
    }
  );
  return { ...actions, log };
};

const refusal = (name) =>
  Object.assign(new Error(name), { errorMessage: name });

test('Api constructors used exist in layer 225', () => {
  const tl = readFileSync(
    new URL('../src/sources/telegram-api/layer-225.tl', import.meta.url),
    'utf8'
  );
  assert.match(tl, /^contacts\.getStatuses#/m);
  assert.match(
    tl,
    /^messages\.getOutboxReadDate#\w+ peer:InputPeer msg_id:int/m
  );
});

test('statuses: online, a time, and the coarse ones', async () => {
  const { contactStatuses, log } = make(() => [
    { userId: 1n, status: { className: 'UserStatusOnline' } },
    { userId: 2n, status: { className: 'UserStatusOffline', wasOnline: 100 } },
    { userId: 3n, status: { className: 'UserStatusLastWeek' } },
    { userId: 4n, status: { className: 'UserStatusEmpty' } },
  ]);
  const got = await contactStatuses();
  assert.equal(log[0].className, 'GetStatuses');
  assert.deepEqual(got.statuses, [
    { id: '1', online: true },
    { id: '2', online: false, lastSeen: new Date(100_000).toISOString() },
    { id: '3', online: false, lastSeen: 'week' },
    { id: '4', online: false },
  ]);
});

test('read time: the date in ms, asked with the message id', async () => {
  const { messageReadTime, log } = make(() => ({ date: 1700 }));
  const got = await messageReadTime({ chat: '5', id: 9 });
  assert.deepEqual(got, { ok: true, read: true, date: 1_700_000 });
  assert.equal(log[0].className, 'GetOutboxReadDate');
  assert.equal(log[0].msgId, 9);
  assert.deepEqual(log[0].peer, { chat: '5' });
});

test('read time: privacy and age keep "read" with a code', async () => {
  for (const [name, code] of [
    ['YOUR_PRIVACY_RESTRICTED', 'your-privacy'],
    ['USER_PRIVACY_RESTRICTED', 'peer-privacy'],
    ['MESSAGE_TOO_OLD', 'too-old'],
  ]) {
    const { messageReadTime } = make(() => refusal(name));
    assert.deepEqual(await messageReadTime({ chat: '5', id: 9 }), {
      ok: true,
      read: true,
      date: null,
      code,
    });
  }
  const unread = make(() => refusal('MESSAGE_NOT_READ_YET'));
  assert.deepEqual(await unread.messageReadTime({ chat: '5', id: 9 }), {
    ok: true,
    read: false,
  });
  assert.equal(readFailure(refusal('BOOM')).ok, false);
  const bad = make(() => ({}));
  assert.equal((await bad.messageReadTime({ chat: 'x', id: 9 })).ok, false);
  assert.equal(bad.log.length, 0);
});

test('routes: validated before the account is asked', async () => {
  const calls = [];
  const account = {
    contactStatuses: async () => (calls.push('s'), { ok: true }),
    messageReadTime: async (b) => (calls.push(b), { ok: true }),
  };
  assert.equal(await postRoute('contact-statuses', {}, account), 200);
  assert.equal(
    await postRoute('message-read-time', { chat: '5', id: 9 }, account),
    200
  );
  for (const body of [
    { chat: '-5', id: 9 },
    { chat: '5', id: 0 },
    { chat: '5', id: '9' },
    { id: 9 },
  ]) {
    assert.equal(await postRoute('message-read-time', body, account), 400);
  }
  assert.deepEqual(calls, ['s', { chat: '5', id: 9 }]);
  assert.equal(
    await postRoute('message-read-time', { chat: '5', id: 9 }, {}),
    400
  );
});

// Local noon, so the day arithmetic holds in any time zone.
const NOW = new Date(2026, 2, 10, 12, 0).getTime();
const pad = (n) => String(n).padStart(2, '0');
const people = [
  {
    id: '1',
    name: 'Zed',
    online: false,
    lastSeen: 'week',
    phone: '+1 555 0101',
  },
  {
    id: '2',
    name: 'Amy',
    online: false,
    lastSeen: new Date(NOW - 3600_000).toISOString(),
    username: 'amy_x',
  },
  { id: '3', name: 'Cat', online: true },
  { id: '4', name: 'Bob', online: false, lastSeen: 'recently' },
  { id: '5', name: 'Dan', online: false },
];

test('sorting: online first, then the latest seen; or by name', () => {
  assert.deepEqual(
    sortContacts(people, 'seen', NOW).map((c) => c.name),
    ['Cat', 'Amy', 'Bob', 'Zed', 'Dan']
  );
  assert.deepEqual(
    sortContacts(people, 'name', NOW).map((c) => c.name),
    ['Amy', 'Bob', 'Cat', 'Dan', 'Zed']
  );
  assert.equal(people[0].name, 'Zed', 'the input is not changed');
  assert.equal(seenAt({ online: true }, NOW), NOW);
  assert.equal(seenAt({}, NOW), -Infinity);
});

test('search: name, username and phone', () => {
  assert.deepEqual(
    filterContacts(people, 'AM').map((c) => c.id),
    ['2']
  );
  assert.deepEqual(
    filterContacts(people, '@amy_x').map((c) => c.id),
    ['2']
  );
  assert.deepEqual(
    filterContacts(people, '555-0101').map((c) => c.id),
    ['1']
  );
  assert.equal(filterContacts(people, '  ').length, 5);
  assert.equal(filterContacts(people, 'nobody').length, 0);
});

test('fresh statuses replace the old ones', () => {
  const next = mergeStatuses(people, [
    { id: '1', online: true },
    { id: '3', online: false, lastSeen: 'month' },
  ]);
  assert.equal(next[0].online, true);
  assert.equal(next[0].lastSeen, undefined);
  assert.deepEqual([next[2].online, next[2].lastSeen], [false, 'month']);
  assert.equal(next[1], people[1]);
});

test('status lines read like the chat info', () => {
  const t = (key, vars) => translate('en', key, vars);
  const when = (iso) => `at ${dates.time(Date.parse(iso))}`;
  assert.equal(statusLine(t, people[2], when), 'online');
  assert.equal(statusLine(t, people[0], when), 'last seen within a week');
  assert.equal(statusLine(t, people[3], when), 'last seen recently');
  assert.equal(statusLine(t, people[4], when), 'last seen a long time ago');
  assert.equal(statusLine(t, people[1], when), 'last seen at 11:00');
});

const dates = {
  time: (ms) =>
    `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`,
  dateTime: (ms) =>
    `${new Date(ms).getFullYear()}-${pad(new Date(ms).getMonth() + 1)}-${pad(new Date(ms).getDate())}`,
};

test('read-time lines: today, yesterday, earlier, hidden, unread', () => {
  const at = (ms) => ({ read: true, date: ms });
  const today = readTimeLine(at(NOW - 3600_000), NOW, dates);
  assert.equal(today.key, 'chat.readTime.today');
  assert.equal(today.params.time, '11:00');
  const yesterday = readTimeLine(at(NOW - 86_400_000), NOW, dates);
  assert.equal(yesterday.key, 'chat.readTime.yesterday');
  const older = readTimeLine(at(NOW - 4 * 86_400_000), NOW, dates);
  assert.equal(older.key, 'chat.readTime.on');
  assert.equal(older.params.date, '2026-03-06');
  const hidden = readTimeLine(
    { read: true, date: null, code: 'peer-privacy' },
    NOW,
    dates
  );
  assert.deepEqual(hidden, { key: 'chat.readTime.plain', hidden: true });
  assert.equal(
    readTimeLine({ read: true, date: null, code: 'too-old' }, NOW, dates)
      .hidden,
    false
  );
  assert.equal(readTimeLine({ read: false }, NOW, dates), null);
  assert.equal(readTimeLine(null, NOW, dates), null);
  const t = (key, vars) => translate('en', key, vars);
  assert.equal(t(today.key, today.params), 'Read at 11:00');
  assert.equal(t(yesterday.key, yesterday.params), 'Read yesterday at 12:00');
});

test('the menu offers the read time in a private chat only', () => {
  const mine = {
    id: 'msg:telegram:5:9',
    source: 'telegram',
    chat: '5',
    sender: 'me',
    body: 'hi',
    timestamp: new Date(NOW).toISOString(),
  };
  const priv = { chat: '5', personal: true, kind: 'private' };
  assert.equal(hasReadTime(mine, priv), true);
  assert.equal(hasReadTime(mine, priv, { bot: true }), false);
  assert.equal(hasReadTime(mine, { ...priv, kind: 'group' }), false);
  assert.equal(hasReadTime({ ...mine, sender: '5' }, priv), false);
  assert.equal(hasReadTime({ ...mine, pending: true }, priv), false);
  assert.ok(
    menuItems({ message: mine, chat: priv, now: NOW }).includes('readTime')
  );
  assert.ok(
    !menuItems({
      message: mine,
      chat: { ...priv, kind: 'group' },
      now: NOW,
    }).includes('readTime')
  );
});
