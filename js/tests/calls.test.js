// The recent calls list (R-Y163): the request built (no peer, the phone
// calls filter, `missed` for the tab), the calls shaped for the page,
// paging, the route's validation, and the pure helpers the page uses
// (kinds, durations, grouping, the in-chat call lines). Fake clients;
// nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCalls, CALLS_PAGE } from '../src/sources/telegram-calls.js';
import {
  callKind,
  callLine,
  formatCallDuration,
  groupCalls,
} from '../src/web/call-model.js';
import { serviceInfo } from '../src/web/message-parts.js';
import { callWhen } from '../src/web/chat-calls.js';
import { translate } from '../src/web/i18n.js';
import { postRoute } from './helpers/post-route.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: { Search: named('Search') },
  InputPeerEmpty: named('InputPeerEmpty'),
  InputMessagesFilterPhoneCalls: named('InputMessagesFilterPhoneCalls'),
};

const callMessage = (
  id,
  user,
  { out = false, reason, duration, video } = {}
) => ({
  id,
  date: 1_700_000_000 + id,
  out,
  peerId: { className: 'PeerUser', userId: BigInt(user) },
  action: {
    className: 'MessageActionPhoneCall',
    video,
    duration,
    ...(reason ? { reason: { className: reason } } : {}),
  },
});

const make = (answer) => {
  const log = [];
  const actions = createCalls(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
    },
    {
      userClient: async () => ({
        invoke: async (request) => {
          log.push(request);
          return answer(request);
        },
      }),
    }
  );
  return { actions, log };
};

const users = [
  { id: 42n, firstName: 'Ann', lastName: 'Lee' },
  { id: 43n, firstName: 'Bob' },
];

test('the list asks with no peer and the phone calls filter', async () => {
  const { actions, log } = make(() => ({ messages: [], users: [] }));
  assert.deepEqual(await actions.callsList(), {
    ok: true,
    calls: [],
    next: null,
  });
  await actions.callsList({ missed: true, offsetId: 900 });
  assert.equal(log[0].peer.className, 'InputPeerEmpty');
  assert.equal(log[0].q, '');
  assert.equal(log[0].filter.className, 'InputMessagesFilterPhoneCalls');
  assert.equal(log[0].filter.missed, undefined);
  assert.equal(log[0].offsetId, 0);
  assert.equal(log[1].filter.missed, true);
  assert.equal(log[1].offsetId, 900);
  assert.equal(log[1].limit, CALLS_PAGE);
});

test('calls are shaped: direction, video, missed, duration, names', async () => {
  const { actions } = make(() => ({
    messages: [
      callMessage(5, 42, { reason: 'PhoneCallDiscardReasonMissed' }),
      callMessage(4, 43, { out: true, duration: 65, video: true }),
      callMessage(3, 42, { reason: 'PhoneCallDiscardReasonBusy' }),
      callMessage(2, 42, {
        out: true,
        reason: 'PhoneCallDiscardReasonMissed',
      }),
      callMessage(1, 43, {
        reason: 'PhoneCallDiscardReasonHangup',
        duration: 9,
      }),
      { id: 9, peerId: { userId: 42n }, action: { className: 'Other' } },
    ],
    users,
  }));
  const { calls, next } = await actions.callsList({});
  assert.equal(next, null);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[0], {
    chat: '42',
    name: 'Ann Lee',
    id: 5,
    date: 1_700_000_005_000,
    out: false,
    video: false,
    missed: true,
    duration: 0,
  });
  assert.equal(calls[1].video, true);
  assert.equal(calls[1].duration, 65);
  assert.equal(calls[1].missed, false);
  assert.equal(calls[2].missed, true, 'busy, incoming');
  assert.equal(calls[3].missed, false, 'an outgoing one nobody took');
  assert.equal(calls[4].missed, false);
});

test('a full page has a next id, a short one does not', async () => {
  const full = Array.from({ length: CALLS_PAGE }, (_, i) =>
    callMessage(CALLS_PAGE - i, 42, { duration: 1 })
  );
  const { actions } = make(() => ({ messages: full, users }));
  assert.equal((await actions.callsList({})).next, 1);
  const short = make(() => ({ messages: full.slice(0, 3), users }));
  assert.equal((await short.actions.callsList({})).next, null);
});

test('Telegram errors become codes; no account is unsupported', async () => {
  const failing = createCalls(
    { importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }) },
    {
      userClient: async () => ({
        invoke: async () => {
          throw Object.assign(new Error('x'), { errorMessage: 'FLOOD_WAIT_5' });
        },
      }),
    }
  );
  assert.equal((await failing.callsList({})).code, 'flood');
  const none = createCalls({}, { userClient: async () => null });
  assert.deepEqual(await none.callsList({}), { ok: false, supported: false });
  assert.equal(
    (await failing.callsList({ offsetId: 'x' })).error,
    'bad request'
  );
});

test('the route validates strictly', async () => {
  const account = {
    callsList: async () => ({ ok: true, calls: [], next: null }),
  };
  for (const bad of [{ missed: 'yes' }, { offsetId: -1 }, { offsetId: 'a1' }]) {
    assert.equal(await postRoute('calls', bad, account), 400);
  }
  for (const good of [
    {},
    { missed: true },
    { offsetId: 12 },
    { offsetId: '12' },
  ]) {
    assert.equal(await postRoute('calls', good, account), 200);
  }
  assert.equal(await postRoute('calls', {}, {}), 400);
});

test('kinds, durations and grouping', () => {
  assert.equal(callKind(false, 'PhoneCallDiscardReasonMissed'), 'missed');
  assert.equal(callKind(false, 'PhoneCallDiscardReasonBusy'), 'missed');
  assert.equal(callKind(true, 'PhoneCallDiscardReasonMissed'), 'cancelled');
  assert.equal(callKind(true, 'PhoneCallDiscardReasonHangup'), 'outgoing');
  assert.equal(callKind(false, undefined), 'incoming');
  assert.equal(formatCallDuration(0), '');
  assert.equal(formatCallDuration(65), '1:05');
  assert.equal(formatCallDuration(3723), '1:02:03');
  const at = (day, hour) => new Date(2026, 5, day, hour).getTime();
  const call = (id, chat, date, extra = {}) => ({
    id,
    chat,
    date,
    out: false,
    video: false,
    missed: false,
    duration: 0,
    ...extra,
  });
  const rows = groupCalls([
    call(6, '42', at(10, 20)),
    call(5, '42', at(10, 12)),
    call(4, '42', at(10, 9)),
    call(3, '43', at(10, 8)),
    call(2, '42', at(10, 7)),
    call(1, '42', at(9, 23)),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.id, r.count]),
    [
      [6, 3],
      [3, 1],
      [2, 1],
      [1, 1],
    ]
  );
  const mixed = groupCalls([
    call(2, '42', at(10, 12), { missed: true }),
    call(1, '42', at(10, 11)),
  ]);
  assert.equal(mixed.length, 2, 'a missed call stays its own row');
});

test("the time is today's time, else the date", () => {
  const now = new Date(2026, 5, 10, 15).getTime();
  const today = callWhen(new Date(2026, 5, 10, 9, 5).getTime(), 'en', now);
  assert.match(today, /9:05/);
  const older = callWhen(new Date(2026, 4, 2, 9, 5).getTime(), 'en', now);
  assert.match(older, /May/);
  assert.doesNotMatch(older, /9:05/);
});

test('call messages in a chat read as in Desktop', () => {
  const line = (out, reason, extra = {}) =>
    serviceInfo({
      service: 'MessageActionPhoneCall',
      outgoing: out,
      raw: {
        action: { reason: reason && { className: reason }, ...extra },
      },
    });
  const text = (info) => translate('en', info.key);
  assert.equal(
    text(line(false, 'PhoneCallDiscardReasonHangup')),
    'Incoming call'
  );
  assert.equal(
    text(line(true, 'PhoneCallDiscardReasonHangup')),
    'Outgoing call'
  );
  assert.equal(
    text(line(false, 'PhoneCallDiscardReasonMissed')),
    'Missed call'
  );
  assert.equal(
    text(line(true, 'PhoneCallDiscardReasonMissed')),
    'Cancelled call'
  );
  assert.equal(
    text(line(true, 'PhoneCallDiscardReasonHangup', { video: true })),
    'Outgoing video call'
  );
  assert.equal(
    text(line(false, 'PhoneCallDiscardReasonBusy', { video: true })),
    'Missed video call'
  );
  assert.equal(line(true, undefined, { duration: 83 }).duration, 83);
  assert.equal(
    callLine({ raw: { out: true, action: {} } }).key,
    'chat.service.call.outgoing'
  );
  for (const locale of ['ru', 'hi', 'zh']) {
    assert.notEqual(
      translate(locale, 'chat.service.call.missed'),
      translate('en', 'chat.service.call.missed')
    );
  }
});
