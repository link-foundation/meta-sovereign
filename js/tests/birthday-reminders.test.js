import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  birthdayDay,
  birthdayGreeting,
  greetedToday,
  readBirthdayGreeting,
  reminderBirthdays,
} from '../src/web/birthday-reminders.js';
import { readPref, writePref } from '../src/web/chat-notify.js';
import {
  BIRTHDAY_TOMORROW_KEY,
  BIRTHDAY_HIDE_GREETED_KEY,
} from '../src/web/birthday-prefs.js';

const now = new Date(2026, 11, 31, 12);
const day = birthdayDay(now);
const message = (body = 'Happy birthday!', patch = {}) => ({
  id: 'msg:telegram:42:1',
  source: 'telegram',
  chat: '42',
  sender: 'me',
  body,
  timestamp: now.toISOString(),
  ...patch,
});

test('reminders show today by default, tomorrow opt-in, across the year boundary', () => {
  const list = [
    { chat: '43', day: 1, month: 1, days: 999 },
    { chat: '42', day: 31, month: 12, days: 999 },
    { chat: '44', day: 2, month: 1, days: 0 },
  ];
  assert.deepEqual(
    reminderBirthdays(list, false, now).map((one) => [one.chat, one.days]),
    [['42', 0]]
  );
  assert.deepEqual(
    reminderBirthdays(list, true, now).map((one) => [one.chat, one.days]),
    [
      ['42', 0],
      ['43', 1],
    ]
  );
});

test('birthday preferences default to today and hiding already congratulated people', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(readPref(BIRTHDAY_TOMORROW_KEY, false, storage), false);
  assert.equal(readPref(BIRTHDAY_HIDE_GREETED_KEY, true, storage), true);
  writePref(BIRTHDAY_TOMORROW_KEY, true, storage);
  writePref(BIRTHDAY_HIDE_GREETED_KEY, false, storage);
  assert.equal(readPref(BIRTHDAY_TOMORROW_KEY, false, storage), true);
  assert.equal(readPref(BIRTHDAY_HIDE_GREETED_KEY, true, storage), false);
});

test('recognizes explicit wishes in supported languages and brief birthday congratulations', () => {
  for (const text of [
    'Happy birthday 🙂',
    'Happy 30th birthday!',
    'Many happy returns!',
    'С днём рождения 🥳',
    'С днем рождения!',
    'С ДР!',
    'С днюхой!',
    'Поздравляю тебя! 🙂',
    '生日快乐！',
    'जन्मदिन की शुभकामनाएँ!',
    'Chúc mừng sinh nhật!',
  ]) {
    assert.equal(birthdayGreeting(message(text)), true, text);
  }
  assert.equal(
    birthdayGreeting(message('', { sticker: { emoji: '🎂' } })),
    true
  );
  assert.equal(birthdayGreeting(message('🎂🥳')), true);
});

test('ordinary messages, other occasions and incoming/forwarded wishes do not count', () => {
  for (const text of [
    'Hello!',
    'Поздравляю с новой работой!',
    'Happy New Year!',
    '🎉',
    'Thanks for your birthday wishes',
  ]) {
    assert.equal(birthdayGreeting(message(text)), false, text);
  }
  for (const patch of [
    { sender: '42' },
    { forwardedFrom: { sender: 'other' } },
    { raw: { fwdFrom: {} } },
    { deleted: true },
    { service: {} },
    { pending: true },
    { id: 'draft:42' },
  ]) {
    assert.equal(
      birthdayGreeting(message('Happy birthday!', patch)),
      false,
      JSON.stringify(patch)
    );
  }
});

test('only confirmed delivery counts, never local storage, uncertainty or scheduled work', () => {
  for (const status of [
    'queued',
    'sending',
    'waiting',
    'failed',
    'stored',
    'scheduled',
    'uncertain',
    'unknown',
  ]) {
    assert.equal(
      birthdayGreeting(message('Happy birthday!', { status })),
      false,
      status
    );
    assert.equal(
      birthdayGreeting(message('Happy birthday!', { delivery: status })),
      false,
      status
    );
  }
  for (const delivery of ['sent', 'delivered', 'read']) {
    assert.equal(
      birthdayGreeting(message('Happy birthday!', { delivery })),
      true
    );
  }
  assert.equal(
    birthdayGreeting(
      message('Happy birthday!', { sender: '7', raw: { out: true } })
    ),
    true
  );
});

test('uses the local calendar day with exclusive midnight boundary', () => {
  assert.equal(greetedToday(message(), day), true);
  assert.equal(
    greetedToday(
      message('Happy birthday!', {
        timestamp: new Date(day.start - 1).toISOString(),
      }),
      day
    ),
    false
  );
  assert.equal(
    greetedToday(
      message('Happy birthday!', {
        timestamp: new Date(day.end).toISOString(),
      }),
      day
    ),
    false
  );
  assert.equal(
    greetedToday(message('Happy birthday!', { timestamp: 'invalid' }), day),
    false
  );
});

test('finds earlier wishes after a full recent page using only that contact history', async () => {
  const calls = [];
  const api = {
    chatPage: async (request) => {
      calls.push(request);
      return request.before
        ? { messages: [message()], more: true }
        : {
            messages: [
              message('Later conversation', { id: 'msg:telegram:42:2' }),
            ],
            more: true,
          };
    },
  };
  assert.equal(await readBirthdayGreeting(api, '42', day), true);
  assert.deepEqual(
    calls.map(({ key, before, limit }) => [key, before, limit]),
    [
      ['telegram:42', null, 200],
      ['telegram:42', 'msg:telegram:42:2', 200],
    ]
  );
});

test('stops at yesterday and rejects missing history instead of claiming a greeting', async () => {
  let calls = 0;
  const api = {
    chatPage: async () => {
      calls += 1;
      return {
        messages: [
          message('Happy birthday!', {
            timestamp: new Date(day.start - 1).toISOString(),
          }),
        ],
        more: true,
      };
    },
  };
  assert.equal(await readBirthdayGreeting(api, '42', day), false);
  assert.equal(calls, 1);
  assert.equal(await readBirthdayGreeting(api, '42', day, () => true), false);
  assert.equal(calls, 1);
  await assert.rejects(
    readBirthdayGreeting({ chatPage: async () => null }, '42', day),
    /history unavailable/
  );
  assert.equal(
    await readBirthdayGreeting(
      {
        chatPage: async () => ({
          messages: [message('Happy birthday!', { chat: 'other' })],
          more: false,
        }),
      },
      '42',
      day
    ),
    false
  );
});
