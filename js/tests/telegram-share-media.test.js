// Sharing a place and a contact (R-Y142): the requests built for a place, a
// live place, stopping it and a contact (picked: its phone read server-side;
// typed: validated), Telegram's errors, the routes refusing bad bodies, and
// the page's pure helpers. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createShareMedia,
  cleanPhone,
  validPoint,
} from '../src/sources/telegram-share-media.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { named, postRoute } from './helpers/telegram-route.js';
import {
  filterContacts,
  parseCoordinate,
  placeBody,
  positionErrorKey,
  typedContactBody,
} from '../src/web/chat-share.js';
import { canStopLive, liveLines } from '../src/web/live-place.js';

const Api = {
  InputGeoPoint: named('InputGeoPoint'),
  InputMediaGeoPoint: named('InputMediaGeoPoint'),
  InputMediaGeoLive: named('InputMediaGeoLive'),
  InputMediaContact: named('InputMediaContact'),
  InputReplyToMessage: named('InputReplyToMessage'),
  contacts: { GetContacts: named('contacts.GetContacts') },
  messages: {
    SendMedia: named('messages.SendMedia'),
    EditMessage: named('messages.EditMessage'),
  },
};
const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: (b) => b.readBigInt64LE(0),
};

const setup = ({ fail = null, users = [] } = {}) => {
  const asked = [];
  const applied = [];
  const changed = [];
  const client = {
    invoke: async (request) => {
      asked.push(request);
      if (request.className === 'contacts.GetContacts') {
        return { users };
      }
      if (fail) {
        throw fail;
      }
      return { className: 'Updates' };
    },
  };
  const store = createMemoryStore();
  const env = {
    store,
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
    queue: { run: (_key, _priority, task) => task() },
    actions: { scheduledChanged: (chat) => changed.push(chat) },
  };
  const actions = createShareMedia(env, {
    userClient: async () => client,
    apply: async (_client, result) => applied.push(result),
  });
  return { actions, asked, applied, changed, store };
};

test('a place is sent as an InputGeoPoint with its accuracy', async () => {
  const { actions, asked, applied } = setup();
  const done = await actions.sendLocation({
    chat: '42',
    lat: 52.52,
    lon: 13.405,
    accuracy: 35,
    replyTo: 9,
    silent: true,
    clientId: 'c1',
  });
  assert.deepEqual(done, { ok: true, chat: '42' });
  const [request] = asked;
  assert.equal(request.className, 'messages.SendMedia');
  assert.equal(request.message, '');
  assert.equal(request.silent, true);
  assert.equal(request.replyTo.replyToMsgId, 9);
  assert.equal(request.media.className, 'InputMediaGeoPoint');
  const point = request.media.geoPoint;
  assert.equal(point.className, 'InputGeoPoint');
  assert.deepEqual(
    [point.lat, point.long, point.accuracyRadius],
    [52.52, 13.405, 35]
  );
  assert.equal(applied.length, 1);
});

test('a place without accuracy sends none; a live place sends its period', async () => {
  const { actions, asked } = setup();
  await actions.sendLocation({ chat: '42', lat: -33.5, lon: 151.2 });
  assert.equal(asked[0].media.geoPoint.accuracyRadius, undefined);
  await actions.sendLocation({
    chat: '42',
    lat: 1,
    lon: 2,
    live: 3600,
    scheduleDate: 1_900_000_000,
  });
  assert.equal(asked[1].media.className, 'InputMediaGeoLive');
  assert.equal(asked[1].media.period, 3600);
  assert.equal(asked[1].scheduleDate, 1_900_000_000);
});

test('an invalid place, period or accuracy asks Telegram nothing', async () => {
  const { actions, asked } = setup();
  const bads = [
    { chat: '42', lat: 91, lon: 0 },
    { chat: '42', lat: 0, lon: -181 },
    { chat: '42', lat: Number.NaN, lon: 0 },
    { chat: '42', lat: 1, lon: 1, live: 60 },
    { chat: '42', lat: 1, lon: 1, accuracy: 5000 },
    { chat: 'x', lat: 1, lon: 1 },
  ];
  for (const bad of bads) {
    const answer = await actions.sendLocation(bad);
    assert.equal(answer.ok, false, JSON.stringify(bad));
  }
  assert.equal(asked.length, 0);
});

test('stopping a live location edits it with `stopped` and its stored point', async () => {
  const { actions, asked, store } = setup();
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
  const done = await actions.stopLiveLocation({ chat: '42', id: 7 });
  assert.deepEqual(done, { ok: true });
  const [request] = asked;
  assert.equal(request.className, 'messages.EditMessage');
  assert.equal(request.id, 7);
  assert.equal(request.media.className, 'InputMediaGeoLive');
  assert.equal(request.media.stopped, true);
  assert.equal(request.media.geoPoint.lat, 10.5);
  assert.equal(request.media.geoPoint.long, 20.25);
  // A message that is not a live location is refused without asking.
  const other = await actions.stopLiveLocation({ chat: '42', id: 8 });
  assert.equal(other.ok, false);
  assert.equal(asked.length, 1);
});

test("a picked contact: the phone comes from the account's contacts", async () => {
  const { actions, asked } = setup({
    users: [
      { id: 5n, firstName: 'Ann', lastName: 'Lee', phone: '491701234567' },
      { id: 6n, firstName: 'No', phone: '' },
    ],
  });
  const done = await actions.sendContact({ chat: '42', contact: '5' });
  assert.deepEqual(done, { ok: true, chat: '42' });
  const media = asked.find((r) => r.className === 'messages.SendMedia').media;
  assert.equal(media.className, 'InputMediaContact');
  assert.deepEqual(
    [media.phoneNumber, media.firstName, media.lastName, media.vcard],
    ['+491701234567', 'Ann', 'Lee', '']
  );
  // Without a phone, or unknown: not sent.
  const noPhone = await actions.sendContact({ chat: '42', contact: '6' });
  assert.equal(noPhone.code, 'no-phone');
  const unknown = await actions.sendContact({ chat: '42', contact: '99' });
  assert.equal(unknown.code, 'no-phone');
  assert.equal(
    asked.filter((r) => r.className === 'messages.SendMedia').length,
    1
  );
});

test('a typed contact is validated and normalised', async () => {
  const { actions, asked } = setup();
  const done = await actions.sendContact({
    chat: '42',
    firstName: ' Bob ',
    lastName: '',
    phone: '+1 (555) 010-9999',
  });
  assert.equal(done.ok, true);
  assert.equal(asked[0].media.phoneNumber, '+15550109999');
  assert.equal(asked[0].media.firstName, 'Bob');
  for (const bad of [
    { firstName: '', phone: '+15550109999' },
    { firstName: 'Bob', phone: 'call me' },
    { firstName: 'Bob', phone: '12' },
  ]) {
    assert.equal((await actions.sendContact({ chat: '42', ...bad })).ok, false);
  }
  assert.equal(asked.length, 1);
});

test("Telegram's errors become codes", async () => {
  const flood = Object.assign(new Error('FLOOD_WAIT_7'), { seconds: 7 });
  const { actions } = setup({ fail: flood });
  await assert.rejects(
    actions.sendLocation({ chat: '42', lat: 1, lon: 1 }),
    (error) => error.code === 'flood-wait' && error.retryAfter === 7
  );
  const { actions: forbidden } = setup({
    fail: new Error('CHAT_WRITE_FORBIDDEN'),
  });
  await assert.rejects(
    forbidden.sendContact({ chat: '42', firstName: 'A', phone: '+12345678' }),
    (error) => error.code === 'write-forbidden'
  );
});

test('the routes pass good bodies and refuse bad ones', async () => {
  const seen = [];
  const account = {
    sendLocation: async (r) => (seen.push(['loc', r]), { ok: true }),
    stopLiveLocation: async (r) => (seen.push(['stop', r]), { ok: true }),
    sendContact: async (r) => (seen.push(['contact', r]), { ok: true }),
  };
  assert.equal(
    await postRoute(
      'send-location',
      { chat: '42', lat: 1.5, lon: 2.5, live: 900, accuracy: 20, replyTo: 3 },
      account
    ),
    200
  );
  assert.deepEqual(seen[0][1], {
    chat: '42',
    lat: 1.5,
    lon: 2.5,
    accuracy: 20,
    live: 900,
    replyTo: 3,
  });
  for (const bad of [
    { chat: '42', lat: '1', lon: 2 },
    { chat: '42', lat: 95, lon: 2 },
    { chat: '42', lat: 1, lon: 2, live: 61 },
    { chat: '42', lat: 1, lon: 2, accuracy: 1.5 },
    { chat: '42', lat: 1, lon: 2, replyTo: 0 },
    { chat: 'abc', lat: 1, lon: 2 },
    { lat: 1, lon: 2 },
  ]) {
    assert.equal(
      await postRoute('send-location', bad, account),
      400,
      JSON.stringify(bad)
    );
  }
  assert.equal(
    await postRoute('stop-live-location', { chat: '42', id: 7 }, account),
    200
  );
  assert.equal(
    await postRoute('stop-live-location', { chat: '42', id: '7' }, account),
    400
  );
  assert.equal(
    await postRoute('send-contact', { chat: '42', contact: '5' }, account),
    200
  );
  assert.equal(
    await postRoute(
      'send-contact',
      { chat: '42', firstName: 'Bob', phone: '+12345678' },
      account
    ),
    200
  );
  assert.deepEqual(seen.at(-1)[1], {
    chat: '42',
    firstName: 'Bob',
    lastName: '',
    phone: '+12345678',
  });
  for (const bad of [
    { chat: '42' },
    { chat: '42', contact: 'x' },
    { chat: '42', contact: '5', phone: '+12345678' },
    { chat: '42', firstName: 'Bob', phone: 'nope' },
    { chat: '42', firstName: '', phone: '+12345678' },
  ]) {
    assert.equal(
      await postRoute('send-contact', bad, account),
      400,
      JSON.stringify(bad)
    );
  }
  // An account without the action: refused.
  assert.equal(
    await postRoute('send-location', { chat: '42', lat: 1, lon: 2 }, {}),
    400
  );
});

test('pure helpers: points, phones, coordinates, bodies, contacts', () => {
  assert.deepEqual(validPoint(10, 20), { lat: 10, lon: 20 });
  assert.equal(validPoint(90.1, 0), null);
  assert.equal(cleanPhone('+49 (170) 123-4567'), '+491701234567');
  assert.equal(cleanPhone('abc'), null);
  assert.equal(parseCoordinate('52,52', 90), 52.52);
  assert.equal(parseCoordinate('-181', 180), null);
  assert.equal(parseCoordinate('', 90), null);
  assert.equal(parseCoordinate('1e3', 90), null);
  assert.deepEqual(
    placeBody({ lat: '1.5', lon: '2.5', accuracy: 12.4, live: 900 }),
    {
      lat: 1.5,
      lon: 2.5,
      accuracy: 12,
      live: 900,
    }
  );
  assert.deepEqual(placeBody({ lat: '1', lon: '2' }), { lat: 1, lon: 2 });
  assert.equal(placeBody({ lat: '100', lon: '2' }), null);
  assert.equal(placeBody({ lat: '1', lon: 'x' }), null);
  assert.equal(typedContactBody({ firstName: '', phone: '+12345678' }), null);
  assert.deepEqual(typedContactBody({ firstName: 'A', phone: '+12345678' }), {
    firstName: 'A',
    lastName: '',
    phone: '+12345678',
  });
  const list = [
    { id: '1', name: 'Ann Lee', username: 'annl' },
    { id: '2', name: 'Bob', username: null },
  ];
  assert.deepEqual(
    filterContacts(list, 'lee ann').map((c) => c.id),
    ['1']
  );
  assert.deepEqual(
    filterContacts(list, 'ANNL').map((c) => c.id),
    ['1']
  );
  assert.equal(filterContacts(list, '').length, 2);
  assert.equal(positionErrorKey({ code: 1 }), 'chat.share.denied');
  assert.equal(positionErrorKey({ code: 3 }), 'chat.share.timeout');
  assert.equal(positionErrorKey({ code: 2 }), 'chat.share.unavailable');
});

test('a live place: its lines and who may stop it', () => {
  const t = (key, values = {}) => `${key}:${JSON.stringify(values)}`;
  const now = 1_000_000;
  const lines = liveLines(
    t,
    { live: true, updated: now - 300, until: now + 600 },
    now
  );
  assert.equal(lines[0], 'chat.media.liveMinutes:{"count":5}');
  assert.ok(lines[1].startsWith('chat.media.liveUntil'));
  assert.equal(
    liveLines(t, { live: true, updated: now, until: now - 1 }, now)[1],
    'chat.media.liveEnded:{}'
  );
  const own = {
    source: 'telegram',
    raw: {
      out: true,
      date: now - 100,
      media: { className: 'MessageMediaGeoLive', period: 900 },
    },
  };
  assert.equal(canStopLive(own, now), true);
  assert.equal(canStopLive(own, now + 5000), false);
  assert.equal(
    canStopLive({ ...own, raw: { ...own.raw, out: false } }, now),
    false
  );
});
