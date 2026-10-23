// Sending and scheduling extras and the live location viewer (R-Y197):
// "Send when online" (schedule_date 0x7FFFFFFE) and its "When online"
// line, Saved Messages' reminders, reordering the pinned Saved Messages
// chats, a live place's time left and heading, who shares in a chat, the
// proximity radius on an edit and the "within N m" service line. Fake
// clients; nothing reaches a network. Dates are fixed: every function
// that takes `now` gets it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  WHEN_ONLINE as SERVER_WHEN_ONLINE,
  validSchedule,
} from '../src/sources/telegram-scheduled.js';
import { createAccountExtras } from '../src/sources/telegram-account-extras.js';
import { createShareMedia } from '../src/sources/telegram-share-media.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  WHEN_ONLINE,
  canSendWhenOnline,
  isReminderChat,
  isWhenOnline,
  linkWhenOnline,
  sendMenuItems,
} from '../src/web/chat-schedule.js';
import { reorderPinned, shiftPinned } from '../src/web/chat-saved.js';
import {
  activeShares,
  distanceParts,
  headingDegrees,
  leftLine,
  shareOf,
  timeLeft,
} from '../src/web/live-place.js';
import { serviceInfo } from '../src/web/message-parts.js';
import { fakeClient, helpers, named, post } from './helpers/telegram-fakes.mjs';
import { postRoute } from './helpers/telegram-route.js';

const NOW = Date.parse('2026-03-10T12:00:00Z') / 1000;
const t = (key, params = {}) => `${key}:${JSON.stringify(params)}`;

test("the sentinel is Telegram clients' 0x7FFFFFFE and is a valid schedule", () => {
  assert.equal(WHEN_ONLINE, 0x7ffffffe);
  assert.equal(SERVER_WHEN_ONLINE, WHEN_ONLINE);
  assert.equal(isWhenOnline(2147483646), true);
  assert.equal(isWhenOnline(2147483647), false);
  assert.equal(validSchedule(WHEN_ONLINE, NOW), true);
  // Anything else far ahead is still refused.
  assert.equal(validSchedule(NOW + 400 * 86_400, NOW), false);
  assert.equal(validSchedule(WHEN_ONLINE - 1, NOW), false);
});

test('a scheduled link at the sentinel reads "When online"', () => {
  const at = new Date(WHEN_ONLINE * 1000).toISOString();
  assert.equal(linkWhenOnline({ timestamp: at }), true);
  const soon = new Date((NOW + 3600) * 1000).toISOString();
  assert.equal(linkWhenOnline({ timestamp: soon }), false);
  assert.equal(linkWhenOnline({}), false);
});

const stateOf = (extra = {}) => ({
  current: { source: 'telegram', kind: 'private', chat: '42' },
  telegram: { kind: 'user' },
  info: { kind: 'user', online: false, lastSeen: 'recently' },
  ...extra,
});
const api = { telegramScheduled: () => {} };

test('"Send when online" is offered for a visible last seen only', () => {
  assert.equal(canSendWhenOnline(stateOf(), api), true);
  assert.equal(
    canSendWhenOnline(stateOf({ info: { kind: 'user', online: true } }), api),
    true
  );
  // Hidden: no online, no last seen.
  assert.equal(
    canSendWhenOnline(stateOf({ info: { kind: 'user', online: false } }), api),
    false
  );
  const none = { kind: 'user', online: false, bot: true, lastSeen: 'week' };
  assert.equal(canSendWhenOnline(stateOf({ info: none }), api), false);
  const self = { kind: 'user', self: true, lastSeen: 'week' };
  assert.equal(canSendWhenOnline(stateOf({ info: self }), api), false);
  const group = { source: 'telegram', kind: 'group', chat: '-100' };
  assert.equal(canSendWhenOnline(stateOf({ current: group }), api), false);
  assert.equal(canSendWhenOnline(stateOf(), {}), false);
});

test('the Send menu: reminders in Saved Messages, "when online" for a person', () => {
  assert.deepEqual(sendMenuItems({ state: stateOf(), api, effects: true }), [
    'sendSilent',
    'schedule',
    'sendWhenOnline',
    'sendEffect',
  ]);
  const saved = stateOf({ info: { kind: 'user', self: true } });
  assert.equal(isReminderChat(saved), true);
  assert.equal(isReminderChat(stateOf()), false);
  assert.deepEqual(sendMenuItems({ state: saved, api, effects: false }), [
    'sendSilent',
    'scheduleReminder',
  ]);
  assert.deepEqual(
    sendMenuItems({ state: stateOf(), api: {}, effects: false }),
    []
  );
});

test('the pinned Saved Messages chats are reordered in the page', () => {
  const items = [
    { peer: '1', pinned: true },
    { peer: '2', pinned: true },
    { peer: '3', pinned: true },
    { peer: '9', pinned: false },
  ];
  const peers = (list) => list.map((d) => d.peer);
  assert.deepEqual(peers(reorderPinned(items, '3', '1')), ['3', '1', '2', '9']);
  assert.deepEqual(peers(reorderPinned(items, '1', '3')), ['2', '3', '1', '9']);
  assert.equal(reorderPinned(items, '1', '1'), items, 'same place');
  assert.equal(reorderPinned(items, '9', '1'), items, 'not pinned');
  assert.deepEqual(peers(shiftPinned(items, '2', -1)), ['2', '1', '3', '9']);
  assert.deepEqual(peers(shiftPinned(items, '2', 1)), ['1', '3', '2', '9']);
  assert.equal(shiftPinned(items, '1', -1), items, 'already first');
  assert.equal(shiftPinned(items, '3', 1), items, 'already last');
});

const Api = {
  InputDialogPeer: named('InputDialogPeer'),
  messages: {
    ReorderPinnedSavedDialogs: named('ReorderPinnedSavedDialogs'),
  },
};

const makeExtras = () => {
  const log = [];
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const actions = createAccountExtras(env, {
    userClient: async () => fakeClient(() => true, log),
  });
  return { actions, log };
};

test('savedReorder sends the order, without force, and only valid lists', async () => {
  const { actions, log } = makeExtras();
  for (const bad of [undefined, [], ['x'], ['1', '1'], [1], 'no']) {
    assert.equal(
      (await actions.savedReorder({ peers: bad })).code,
      'bad-request'
    );
  }
  assert.equal(log.length, 0, 'nothing asked for a bad list');
  assert.deepEqual(await actions.savedReorder({ peers: ['7', '-1005', '3'] }), {
    ok: true,
  });
  const [request] = log;
  assert.equal(request.className, 'ReorderPinnedSavedDialogs');
  assert.equal(request.force, undefined, 'others stay pinned');
  assert.deepEqual(
    request.order.map((o) => [o.className, o.peer.chat]),
    [
      ['InputDialogPeer', '7'],
      ['InputDialogPeer', '-1005'],
      ['InputDialogPeer', '3'],
    ]
  );
});

test('the saved-reorder route validates, then asks', async () => {
  const seen = [];
  const account = { savedReorder: async (r) => (seen.push(r), { ok: true }) };
  const status = async (body) =>
    (await post('saved-reorder', body, account)).status;
  assert.equal(await status({ peers: ['1', '2'] }), 200);
  assert.deepEqual(seen, [{ peers: ['1', '2'] }]);
  for (const bad of [
    {},
    { peers: [] },
    { peers: ['1', '1'] },
    { peers: ['a'] },
    { peers: [1] },
  ]) {
    assert.equal(await status(bad), 400);
  }
  assert.equal(seen.length, 1);
});

test('the layer has what the extras use', () => {
  const tl = readFileSync(
    new URL('../src/sources/telegram-api/layer-232.tl', import.meta.url),
    'utf8'
  );
  assert.ok(tl.includes('\nmessages.reorderPinnedSavedDialogs#'));
  assert.ok(tl.includes('proximity_notification_radius:flags.3?int'));
  assert.ok(tl.includes('\nmessageActionGeoProximityReached#'));
});

// ---- the live place -------------------------------------------------------

const liveMessage = (extra = {}, media = {}) => ({
  id: 'msg:telegram:42:5',
  sender: '42',
  senderName: 'Dave',
  raw: {
    id: 5,
    date: NOW - 600,
    editDate: NOW - 60,
    media: {
      className: 'MessageMediaGeoLive',
      geo: { lat: 10.5, long: 20.25, accessHash: { value: '123' } },
      period: 3600,
      heading: 90,
      ...media,
    },
    ...extra,
  },
});

test('time left is formatted at a fixed now', () => {
  const media = (until) => ({ live: true, until });
  assert.deepEqual(timeLeft(media(NOW + 5 * 60), NOW), {
    unit: 'min',
    count: 5,
  });
  assert.deepEqual(
    timeLeft(media(NOW + 90), NOW),
    { unit: 'min', count: 2 },
    'rounds up'
  );
  assert.deepEqual(timeLeft(media(NOW + 1), NOW), { unit: 'min', count: 1 });
  assert.deepEqual(timeLeft(media(NOW + 3600), NOW), { unit: 'h', count: 1 });
  assert.deepEqual(timeLeft(media(NOW + 5400), NOW), { unit: 'h', count: 2 });
  assert.equal(timeLeft(media(NOW - 1), NOW), null, 'ended');
  assert.equal(timeLeft({ live: true }, NOW), null, 'no end');
  assert.equal(
    timeLeft({ live: true, until: 0x7fffffff }, NOW),
    null,
    'until stopped'
  );
  assert.equal(
    leftLine(t, media(NOW + 600), NOW),
    'chat.media.liveLeftMin:{"count":10}'
  );
  assert.equal(
    leftLine(t, media(NOW + 7200), NOW),
    'chat.media.liveLeftH:{"count":2}'
  );
  assert.equal(leftLine(t, media(NOW - 5), NOW), null);
});

test('the heading arrow takes 1..360 degrees', () => {
  assert.equal(headingDegrees({ heading: 90 }), 90);
  assert.equal(headingDegrees({ heading: 360 }), 0, 'north');
  assert.equal(headingDegrees({ heading: 0 }), null, 'unset');
  assert.equal(headingDegrees({}), null);
  assert.equal(headingDegrees({ heading: 'x' }), null);
});

test('a share is the live place of a message, while it lasts', () => {
  const share = shareOf(liveMessage(), NOW);
  assert.equal(share.who, '42');
  assert.equal(share.name, 'Dave');
  assert.equal(share.own, false);
  assert.deepEqual([share.lat, share.lon, share.hash], [10.5, 20.25, '123']);
  assert.equal(share.until, NOW - 600 + 3600);
  assert.equal(share.updated, NOW - 60);
  assert.equal(share.heading, 90);
  // Ended, stopped here, pending or not a live place: none.
  assert.equal(shareOf(liveMessage({ date: NOW - 4000 }), NOW), null);
  assert.equal(
    shareOf(liveMessage(), NOW, () => true),
    null
  );
  assert.equal(shareOf({ ...liveMessage(), pending: true }, NOW), null);
  assert.equal(
    shareOf(liveMessage({ media: { className: 'MessageMediaGeo' } }), NOW),
    null
  );
  assert.equal(shareOf(liveMessage({}, { geo: {} }), NOW), null);
  // Shared until stopped.
  assert.equal(
    shareOf(liveMessage({ date: NOW - 99999 }, { period: 0x7fffffff }), NOW)
      .until,
    0
  );
});

test('the shares of a chat: the newest of each person, ours first', () => {
  const older = liveMessage({ date: NOW - 900, editDate: NOW - 500 });
  older.id = 'msg:telegram:42:3';
  const newer = liveMessage();
  const mine = liveMessage({ out: true, editDate: NOW - 300 });
  mine.id = 'msg:telegram:42:8';
  const other = {
    ...liveMessage({ editDate: NOW - 10 }),
    sender: '77',
    senderName: 'Eve',
  };
  other.id = 'msg:telegram:42:9';
  const ended = liveMessage({ date: NOW - 9000 });
  ended.id = 'msg:telegram:42:1';
  const shares = activeShares([older, newer, mine, other, ended], NOW);
  assert.deepEqual(
    shares.map((s) => [s.who, s.id]),
    [
      ['me', 'msg:telegram:42:8'],
      ['77', 'msg:telegram:42:9'],
      ['42', 'msg:telegram:42:5'],
    ]
  );
  assert.deepEqual(activeShares(undefined, NOW), []);
  assert.equal(activeShares([mine], NOW, () => true).length, 0);
});

test('the proximity service line names who is near, in m or km', () => {
  const link = (extra) => ({
    service: 'MessageActionGeoProximityReached',
    sender: '42',
    senderName: 'Dave',
    chatName: 'Dave',
    raw: { action: { distance: 150 } },
    ...extra,
  });
  assert.deepEqual(distanceParts(150), { unit: 'm', value: 150 });
  assert.deepEqual(distanceParts(1234), { unit: 'km', value: 1.2 });
  const theirs = serviceInfo(link());
  assert.equal(theirs.key, 'chat.service.proximity');
  assert.deepEqual(theirs.params, { user: 'Dave', distance: 150 });
  assert.equal(theirs.user, null, 'the line has no name prefix');
  const far = serviceInfo(link({ raw: { action: { distance: 2500 } } }));
  assert.equal(far.key, 'chat.service.proximityKm');
  assert.equal(far.params.distance, 2.5);
  const ours = serviceInfo(link({ sender: 'me', senderName: null }));
  assert.equal(ours.key, 'chat.service.proximitySelf');
  assert.equal(ours.params.user, 'Dave');
});

// ---- the proximity radius on an edit ------------------------------------

const Share = {
  InputGeoPoint: named('InputGeoPoint'),
  InputMediaGeoLive: named('InputMediaGeoLive'),
  messages: { EditMessage: named('messages.EditMessage') },
};

const makeShare = async () => {
  const asked = [];
  const store = createMemoryStore();
  await store.put({
    id: 'msg:telegram:42:7',
    source: 'telegram',
    raw: {
      id: 7,
      media: {
        className: 'MessageMediaGeoLive',
        geo: { lat: 10.5, long: 20.25 },
      },
    },
  });
  const client = {
    invoke: async (request) => (asked.push(request), { className: 'Updates' }),
  };
  const env = {
    store,
    importer: async () => ({ Api: Share, helpers }),
    connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
    queue: { run: (_key, _priority, task) => task() },
    actions: { scheduledChanged() {} },
  };
  const actions = createShareMedia(env, {
    userClient: async () => client,
    apply: async () => {},
  });
  return { actions, asked };
};

test('updateLiveLocation carries the proximity radius', async () => {
  const { actions, asked } = await makeShare();
  const place = { chat: '42', id: 7, lat: 10.5, lon: 20.25 };
  assert.equal(
    (await actions.updateLiveLocation({ ...place, proximity: 150 })).ok,
    true
  );
  assert.equal(asked[0].media.proximityNotificationRadius, 150);
  await actions.updateLiveLocation(place);
  assert.equal(asked[1].media.proximityNotificationRadius, undefined);
  for (const proximity of [-1, 1.5, 100_001, 'x']) {
    assert.equal(
      (await actions.updateLiveLocation({ ...place, proximity })).ok,
      false
    );
  }
  assert.equal(asked.length, 2, 'a bad radius asks nothing');
});

test('the update route validates the radius and passes it on', async () => {
  const seen = [];
  const account = {
    updateLiveLocation: async (r) => (seen.push(r), { ok: true }),
  };
  const move = { chat: '42', id: 7, lat: 1.5, lon: 2.5, proximity: 100 };
  assert.equal(await postRoute('update-live-location', move, account), 200);
  assert.equal(seen[0].proximity, 100);
  for (const proximity of [0, -5, 1.5, 100_001, '5']) {
    assert.equal(
      await postRoute('update-live-location', { ...move, proximity }, account),
      400
    );
  }
  assert.equal(seen.length, 1);
});

test('the send routes take the sentinel as a schedule date', async () => {
  const seen = [];
  const account = { sendLocation: async (r) => (seen.push(r), { ok: true }) };
  const place = { chat: '42', lat: 1, lon: 2, scheduleDate: WHEN_ONLINE };
  assert.equal(await postRoute('send-location', place, account), 200);
  assert.equal(seen[0].scheduleDate, WHEN_ONLINE);
  assert.equal(
    await postRoute(
      'send-location',
      { ...place, scheduleDate: WHEN_ONLINE + 1 },
      account
    ),
    400
  );
});
