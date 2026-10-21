// The Send button's menu (R-Y102): "Send without sound" and "Schedule
// message" reach Telegram as `silent` and `schedule_date`; a scheduled
// message is not the chat's until Telegram sends it; the chat's
// scheduled ones are listed (soonest first), sent now, deleted or moved.
// Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { sendText } from '../src/sources/telegram-send.js';
import {
  createScheduled,
  validSchedule,
} from '../src/sources/telegram-scheduled.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { chatMessages } from '../src/web/chat-model.js';
import {
  MAX_AHEAD_MS,
  firstGuess,
  inputsOf,
  schedulable,
  timeOf,
} from '../src/web/chat-schedule.js';

class Fake {
  constructor(args) {
    Object.assign(this, args);
  }
}
const named = (name) =>
  class extends Fake {
    className = name;
  };
const Api = {
  messages: {
    SendMessage: named('SendMessage'),
    GetScheduledHistory: named('GetScheduledHistory'),
    SendScheduledMessages: named('SendScheduledMessages'),
    DeleteScheduledMessages: named('DeleteScheduledMessages'),
    EditMessage: named('EditMessage'),
  },
};

test('without sound and at a time: Telegram is told so (R-Y102)', async () => {
  const requests = [];
  const client = {
    getInputEntity: async (peer) => ({ peer }),
    invoke: async (request) => {
      requests.push(request);
      return { className: 'UpdateShortSentMessage', id: 5, date: 1 };
    },
  };
  const base = {
    client,
    Api,
    helpers: { readBigIntFromBuffer: (b) => b.toString('hex') },
    peer: '42',
  };
  await sendText({ ...base, text: 'shh', clientId: 'a', silent: true });
  await sendText({
    ...base,
    text: 'later',
    clientId: 'b',
    scheduleDate: 1_900_000_000,
  });
  await sendText({ ...base, text: 'now', clientId: 'c' });
  assert.deepEqual(
    requests.map((r) => [r.message, r.silent, r.scheduleDate]),
    [
      ['shh', true, undefined],
      ['later', undefined, 1_900_000_000],
      ['now', undefined, undefined],
    ]
  );
});

test('a time from ten seconds to a year ahead (R-Y102)', () => {
  const now = 1_800_000_000;
  assert.equal(validSchedule(now + 60, now), true);
  assert.equal(validSchedule(now + 5, now), false);
  assert.equal(validSchedule(now + 400 * 86_400, now), false);
  assert.equal(validSchedule('1800000060', now), false);
});

const setup = () => {
  const requests = [];
  const applied = [];
  let scheduled = [
    { id: 12, out: true, message: 'second', date: 1_900_000_200 },
    { id: 11, out: true, message: 'first', date: 1_900_000_100 },
  ];
  const client = {
    invoke: async (request) => {
      requests.push(request);
      if (request.className === 'GetScheduledHistory') {
        return { messages: scheduled };
      }
      if (request.className !== 'EditMessage') {
        scheduled = scheduled.filter((m) => !request.id.includes(m.id));
      }
      return { className: 'Updates', updates: [] };
    },
  };
  let clock = 0;
  const actions = createScheduled(
    {
      importer: async () => ({ Api }),
      connection: { withPeer: (_c, chat, use) => use(`peer:${chat}`) },
    },
    {
      userClient: async () => client,
      apply: async (_client, result) => applied.push(result),
      dialogOf: async (chat) => ({ id: chat, isUser: true }),
      tools: { toLinks: telegramDialogLinks },
    },
    { now: () => clock }
  );
  return {
    actions,
    requests,
    applied,
    tick: (ms) => {
      clock += ms;
    },
  };
};

test('the scheduled ones: listed soonest first, kept a while (R-Y102)', async () => {
  const { actions, requests, tick } = setup();
  const list = await actions.scheduledList({ chat: '42' });
  assert.equal(list.ok, true);
  assert.deepEqual(
    list.links.map((l) => [l.id, l.body, l.scheduled]),
    [
      ['sched:telegram:42:11', 'first', true],
      ['sched:telegram:42:12', 'second', true],
    ]
  );
  await actions.scheduledList({ chat: '42' });
  assert.equal(requests.length, 1, 'kept');
  tick(31_000);
  await actions.scheduledList({ chat: '42' });
  assert.equal(requests.length, 2, 'asked again later');
});

test('sent now, deleted, moved: each asks Telegram, then afresh (R-Y102)', async () => {
  const { actions, requests, applied } = setup();
  await actions.scheduledList({ chat: '42' });
  assert.equal(
    (
      await actions.scheduledReschedule({
        chat: '42',
        id: 11,
        date: 1_900_001_000,
      })
    ).ok,
    true
  );
  assert.equal(
    (await actions.scheduledSendNow({ chat: '42', ids: [11] })).ok,
    true
  );
  assert.equal(
    (await actions.scheduledDelete({ chat: '42', ids: [12] })).ok,
    true
  );
  assert.deepEqual(
    requests.slice(1).map((r) => [r.className, r.id, r.scheduleDate]),
    [
      ['EditMessage', 11, 1_900_001_000],
      ['SendScheduledMessages', [11], undefined],
      ['DeleteScheduledMessages', [12], undefined],
    ]
  );
  assert.equal(applied.length, 3, "Telegram's answers through the handler");
  const after = await actions.scheduledList({ chat: '42' });
  assert.deepEqual(after.links, [], 'not kept after a change');
});

const call = async (path, body, account) => {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = { 'content-type': 'application/json', host: '127.0.0.1:8787' };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = text;
    },
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return { status: res.status, payload: JSON.parse(res.body) };
};

test('the scheduled routes check what they are given (R-Y102)', async () => {
  const seen = [];
  const record = (name) => async (body) => {
    seen.push([name, body]);
    return { ok: true };
  };
  const account = {
    scheduledList: record('list'),
    scheduledSendNow: record('send'),
    scheduledDelete: record('delete'),
    scheduledReschedule: record('move'),
    sendFiles: record('files'),
  };
  const later = Math.floor(Date.now() / 1000) + 3600;
  const at = (name, body) => call(`/api/telegram/${name}`, body, account);
  assert.equal((await at('scheduled', { chat: '42' })).status, 200);
  assert.equal((await at('scheduled', { chat: 'x' })).status, 400);
  assert.equal(
    (await at('scheduled-send', { chat: '42', ids: [1] })).status,
    200
  );
  assert.equal(
    (await at('scheduled-delete', { chat: '42', ids: [] })).status,
    400
  );
  assert.equal(
    (await at('scheduled-reschedule', { chat: '42', id: 3, date: later }))
      .status,
    200
  );
  assert.equal(
    (await at('scheduled-reschedule', { chat: '42', id: 3, date: 5 })).status,
    400,
    'not in the past'
  );
  const token = 'a'.repeat(32);
  assert.equal(
    (await at('send-files', { chat: '42', tokens: [token], scheduleDate: 5 }))
      .status,
    400
  );
  await at('send-files', {
    chat: '42',
    tokens: [token],
    silent: true,
    scheduleDate: later,
  });
  assert.deepEqual(
    seen.map(([name]) => name),
    ['list', 'send', 'move', 'files']
  );
  assert.equal(seen[3][1].silent, true);
  assert.equal(seen[3][1].scheduleDate, later);
});

test('one being scheduled is not shown in the chat, unless it failed (R-Y102)', () => {
  const item = (clientId, extra) => ({
    key: 'telegram:42',
    clientId,
    source: 'telegram',
    chat: '42',
    text: clientId,
    at: '2026-10-22T10:00:00.000Z',
    status: 'sending',
    ...extra,
  });
  const shown = chatMessages([], 'telegram:42', {
    pending: [
      item('now'),
      item('later', { scheduleDate: 1_900_000_000 }),
      item('broken', { scheduleDate: 1_900_000_000, status: 'failed' }),
    ],
  });
  assert.deepEqual(
    shown.map((m) => m.body),
    ['now', 'broken']
  );
});

test('the time picker: inputs and back, a minute to a year ahead (R-Y102)', () => {
  const at = new Date(2026, 9, 23, 9, 5).getTime();
  const { day, time } = inputsOf(at);
  assert.deepEqual([day, time], ['2026-10-23', '09:05']);
  assert.equal(timeOf(day, time), at);
  assert.equal(timeOf('', '09:05'), null);
  const now = new Date(2026, 9, 22, 12, 0).getTime();
  assert.equal(schedulable(now + 30_000, now), false);
  assert.equal(schedulable(now + 120_000, now), true);
  assert.equal(schedulable(now + MAX_AHEAD_MS + 60_000, now), false);
  const guess = firstGuess(now + 60_000);
  assert.equal(guess % (5 * 60_000), 0);
  assert.ok(guess - now >= 3_600_000);
});
