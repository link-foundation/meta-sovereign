// A bot's request-peer buttons and a chat's recent places (R-Y208): the
// button's reading, the filtering of who may answer, the answer sent, the
// routes' validation, the service lines and the quick picks. Fake
// clients only; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRequestPeer,
  placeOf,
  satisfies,
  validPeers,
  validType,
} from '../src/sources/telegram-request-peer.js';
import { named, postRoute } from './helpers/telegram-route.js';
import { buttonOf, peerTypeOf } from '../src/web/bot-keyboard.js';
import { serviceInfo } from '../src/web/message-parts.js';
import { canRequestPeer, togglePicked } from '../src/web/chat-request-peer.js';
import { placeLabel } from '../src/web/chat-share.js';

const Api = {
  messages: {
    SendBotRequestedPeer: named('SendBotRequestedPeer'),
    GetRecentLocations: named('GetRecentLocations'),
  },
  contacts: { GetContacts: named('GetContacts') },
};

const entities = {
  ann: { className: 'User', id: 1n, firstName: 'Ann' },
  bot: { className: 'User', id: 2n, firstName: 'Helper', bot: true },
  prem: { className: 'User', id: 3n, firstName: 'Pia', premium: true },
  me: { className: 'User', id: 4n, firstName: 'Me', self: true },
  own: {
    className: 'Channel',
    id: 5n,
    title: 'My group',
    megagroup: true,
    creator: true,
    username: 'mygroup',
  },
  adm: {
    className: 'Channel',
    id: 6n,
    title: 'Admin group',
    megagroup: true,
    adminRights: { deleteMessages: true, banUsers: true },
  },
  plain: {
    className: 'Channel',
    id: 7n,
    title: 'Just member',
    megagroup: true,
  },
  forum: {
    className: 'Channel',
    id: 8n,
    title: 'A forum',
    megagroup: true,
    forum: true,
    creator: true,
  },
  news: {
    className: 'Channel',
    id: 9n,
    title: 'News',
    broadcast: true,
    creator: true,
    username: 'news',
  },
  basic: { className: 'Chat', id: 10n, title: 'Old group' },
};
const dialog = (entity, id) => ({ entity, id });

const make = ({
  dialogs = [],
  contacts = [],
  answer = {},
  fail = null,
} = {}) => {
  const log = [];
  const actions = createRequestPeer(
    {
      importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
      queue: { run: async (_k, _p, fn) => fn() },
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => ({
        getDialogs: async () => dialogs,
        getInputEntity: async (id) => ({ input: String(id) }),
        invoke: async (request) => {
          log.push(request);
          if (fail) {
            throw Object.assign(new Error(fail), { errorMessage: fail });
          }
          return request.className === 'GetContacts'
            ? { users: contacts }
            : answer;
        },
      }),
    }
  );
  return { ...actions, log };
};

test('users: bot and premium constraints, never ourselves', () => {
  const user = { kind: 'user' };
  assert.equal(satisfies(entities.ann, user), true);
  assert.equal(satisfies(entities.me, user), false);
  assert.equal(satisfies(entities.own, user), false);
  assert.equal(satisfies(entities.bot, { kind: 'user', bot: true }), true);
  assert.equal(satisfies(entities.ann, { kind: 'user', bot: true }), false);
  assert.equal(satisfies(entities.bot, { kind: 'user', bot: false }), false);
  assert.equal(satisfies(entities.prem, { kind: 'user', premium: true }), true);
  assert.equal(satisfies(entities.ann, { kind: 'user', premium: true }), false);
});

test('chats: creator, username, forum and admin rights', () => {
  const chat = { kind: 'chat' };
  assert.equal(satisfies(entities.plain, chat), true);
  assert.equal(satisfies(entities.news, chat), false);
  assert.equal(satisfies(entities.basic, chat), true);
  assert.equal(satisfies(entities.plain, { ...chat, creator: true }), false);
  assert.equal(satisfies(entities.own, { ...chat, creator: true }), true);
  assert.equal(satisfies(entities.own, { ...chat, hasUsername: true }), true);
  assert.equal(
    satisfies(entities.plain, { ...chat, hasUsername: true }),
    false
  );
  assert.equal(
    satisfies(entities.plain, { ...chat, hasUsername: false }),
    true
  );
  assert.equal(satisfies(entities.forum, { ...chat, forum: true }), true);
  assert.equal(satisfies(entities.own, { ...chat, forum: true }), false);
  const rights = { ...chat, userAdminRights: ['deleteMessages', 'banUsers'] };
  assert.equal(satisfies(entities.adm, rights), true);
  assert.equal(satisfies(entities.plain, rights), false);
  assert.equal(satisfies(entities.own, rights), true, 'a creator holds all');
  assert.equal(
    satisfies(entities.adm, { ...chat, userAdminRights: ['inviteUsers'] }),
    false
  );
  assert.equal(satisfies({ ...entities.own, left: true }, chat), false);
});

test('channels: only broadcast ones, with the same constraints', () => {
  const channel = { kind: 'broadcast' };
  assert.equal(satisfies(entities.news, channel), true);
  assert.equal(satisfies(entities.plain, channel), false);
  assert.equal(satisfies(entities.news, { ...channel, creator: true }), true);
  assert.equal(
    satisfies(entities.news, { ...channel, hasUsername: false }),
    false
  );
  assert.equal(satisfies(null, channel), false);
});

test('candidates: filtered on the server, contacts joined for users', async () => {
  const { requestPeerCandidates, log } = make({
    dialogs: [
      dialog(entities.ann, 1n),
      dialog(entities.own, -1005n),
      dialog(entities.news, -1009n),
    ],
    contacts: [entities.ann, entities.prem],
  });
  const users = await requestPeerCandidates({ type: { kind: 'user' } });
  assert.deepEqual(
    users.candidates.map((c) => [c.id, c.name]),
    [
      ['1', 'Ann'],
      ['3', 'Pia'],
    ]
  );
  const chats = await requestPeerCandidates({
    type: { kind: 'chat', creator: true },
  });
  assert.deepEqual(chats.candidates, [
    { id: '-1005', name: 'My group', username: 'mygroup' },
  ]);
  assert.equal(log.filter((r) => r.className === 'GetContacts').length, 1);
  assert.equal(
    (await requestPeerCandidates({ type: { kind: 'x' } })).ok,
    false
  );
  assert.equal((await requestPeerCandidates({})).ok, false);
});

test('type and peers validation', () => {
  assert.equal(validType({ kind: 'chat', forum: true }), true);
  assert.equal(validType({ kind: 'chat', forum: 'yes' }), false);
  assert.equal(validType({ kind: 'user', userAdminRights: 'x' }), false);
  assert.equal(validType({ kind: 'chat', userAdminRights: ['a b'] }), false);
  assert.equal(validPeers(['1', '-100']), true);
  assert.equal(validPeers(['1', '1']), false);
  assert.equal(validPeers([]), false);
  assert.equal(validPeers(['x']), false);
  assert.equal(
    validPeers(Array.from({ length: 11 }, (_, i) => String(i))),
    false
  );
});

test('sendRequestedPeers: the button answered with input peers', async () => {
  const { sendRequestedPeers, log } = make();
  const sent = await sendRequestedPeers({
    chat: '777',
    msgId: 4,
    buttonId: 5,
    peers: ['1', '-1005'],
  });
  assert.equal(sent.ok, true);
  const call = log[0];
  assert.equal(call.className, 'SendBotRequestedPeer');
  assert.deepEqual(call.peer, { chat: '777' });
  assert.equal(call.msgId, 4);
  assert.equal(call.buttonId, 5);
  assert.deepEqual(call.requestedPeers, [{ chat: '1' }, { chat: '-1005' }]);
  for (const bad of [
    {},
    { chat: '7', msgId: 0, buttonId: 1, peers: ['1'] },
    { chat: '7', msgId: 1, buttonId: 1.5, peers: ['1'] },
    { chat: '7', msgId: 1, buttonId: 1, peers: [] },
  ]) {
    assert.equal((await sendRequestedPeers(bad)).ok, false);
  }
  assert.equal(log.length, 1);
  const refused = await make({
    fail: 'REQUESTED_PEER_INVALID',
  }).sendRequestedPeers({
    chat: '7',
    msgId: 1,
    buttonId: 1,
    peers: ['1'],
  });
  assert.deepEqual([refused.ok, refused.code], [false, 'bad-peer']);
});

test('recentLocations: places, newest first as Telegram sent', async () => {
  const { recentLocations, log } = make({
    answer: {
      messages: [
        {
          id: 9,
          date: 100,
          media: {
            geo: { lat: 52.5, long: 13.4 },
            title: 'Cafe',
            address: 'Street 1',
          },
        },
        { id: 8, date: 90, media: { geo: { lat: 1, long: 2 } } },
        { id: 7, media: {} },
      ],
    },
  });
  const got = await recentLocations({ chat: '-5' });
  assert.deepEqual(got.places, [
    {
      id: 9,
      lat: 52.5,
      lon: 13.4,
      date: 100,
      title: 'Cafe',
      address: 'Street 1',
    },
    { id: 8, lat: 1, lon: 2, date: 90, title: null, address: null },
  ]);
  assert.equal(log[0].className, 'GetRecentLocations');
  assert.equal(log[0].limit, 20);
  assert.equal((await recentLocations({ chat: 'x' })).ok, false);
  assert.equal(placeOf({ media: {} }), null);
  assert.equal(
    placeLabel(got.places[0]) + placeLabel(got.places[1]),
    'Cafe1.00000, 2.00000'
  );
});

test('routes validate their bodies', async () => {
  const asked = [];
  const account = {
    requestPeerCandidates: async (a) => (asked.push(a), { ok: true }),
    sendRequestedPeers: async (a) => (asked.push(a), { ok: true }),
    recentLocations: async (a) => (asked.push(a), { ok: true }),
  };
  assert.equal(
    await postRoute(
      'request-peer-candidates',
      { type: { kind: 'user' } },
      account
    ),
    200
  );
  assert.equal(
    await postRoute(
      'request-peer-send',
      { chat: '7', msgId: 2, buttonId: 3, peers: ['1'] },
      account
    ),
    200
  );
  assert.equal(
    await postRoute('recent-locations', { chat: '-5' }, account),
    200
  );
  assert.equal(asked.length, 3);
  for (const [route, body] of [
    ['request-peer-candidates', {}],
    ['request-peer-candidates', { type: { kind: 'bad' } }],
    ['request-peer-send', { chat: '7', msgId: 2, buttonId: 3 }],
    ['request-peer-send', { chat: '7', msgId: '2', buttonId: 3, peers: ['1'] }],
    ['request-peer-send', { chat: 'q', msgId: 2, buttonId: 3, peers: ['1'] }],
    ['recent-locations', { chat: 'abc' }],
  ]) {
    assert.equal(await postRoute(route, body, account), 400, route);
  }
  assert.equal(await postRoute('recent-locations', { chat: '5' }, {}), 400);
  assert.equal(asked.length, 3);
});

test('the button is read with its type, quantity and requested details', () => {
  const raw = {
    className: 'KeyboardButtonRequestPeer',
    text: 'Pick',
    buttonId: 5,
    maxQuantity: 3,
    peerType: {
      className: 'RequestPeerTypeChat',
      creator: true,
      hasUsername: false,
      forum: undefined,
      userAdminRights: {
        className: 'ChatAdminRights',
        banUsers: true,
        flags: 1,
      },
    },
  };
  const button = buttonOf(raw);
  assert.equal(button.kind, 'peer');
  assert.equal(button.buttonId, 5);
  assert.equal(button.max, 3);
  assert.deepEqual(button.peerType, {
    kind: 'chat',
    hasUsername: false,
    creator: true,
    userAdminRights: ['banUsers'],
  });
  const input = buttonOf({
    className: 'InputKeyboardButtonRequestPeer',
    text: 'Who',
    buttonId: 1,
    nameRequested: true,
    photoRequested: true,
    peerType: { className: 'RequestPeerTypeUser', bot: false, premium: true },
  });
  assert.equal(input.kind, 'peer');
  assert.equal(input.max, 1);
  assert.deepEqual(input.details, { name: true, username: false, photo: true });
  assert.deepEqual(input.peerType, { kind: 'user', bot: false, premium: true });
  assert.equal(peerTypeOf({ className: 'RequestPeerTypeCreateBot' }), null);
  assert.equal(
    buttonOf({ className: 'KeyboardButtonRequestPhone', text: 'x' }).kind,
    'request'
  );
});

test('the picker answers only what it can; choices stay within the quantity', () => {
  const button = { kind: 'peer', buttonId: 5, peerType: { kind: 'user' } };
  assert.equal(canRequestPeer({ id: 'msg:telegram:7:4' }, button), true);
  assert.equal(canRequestPeer({}, button), false);
  assert.equal(canRequestPeer({ id: 'x' }, { ...button, kind: 'text' }), false);
  const one = togglePicked(new Set(['a']), 'b', 1);
  assert.deepEqual([...one], ['b']);
  let many = togglePicked(new Set(), 'a', 2);
  many = togglePicked(many, 'b', 2);
  assert.deepEqual([...togglePicked(many, 'c', 2)], ['a', 'b']);
  assert.deepEqual([...togglePicked(many, 'a', 2)], ['b']);
});

test('service lines: what was shared with the bot', () => {
  const link = (service, action, extra = {}) => ({
    service,
    senderName: 'Ann',
    raw: { action: { className: service, ...action } },
    ...extra,
  });
  const ours = serviceInfo(
    link('MessageActionRequestedPeer', { buttonId: 1, peers: [{ userId: 5 }] })
  );
  assert.equal(ours.key, 'chat.service.requestedPeerBare');
  const named_ = serviceInfo(
    link('MessageActionRequestedPeer', {
      peers: [{ title: 'Team' }, { firstName: 'Bo', lastName: 'Li' }],
    })
  );
  assert.equal(named_.key, 'chat.service.requestedPeer');
  assert.equal(named_.params.names, 'Team, Bo Li');
  const toMe = serviceInfo(
    link('MessageActionRequestedPeerSentMe', { peers: [{ title: 'Team' }] })
  );
  assert.equal(toMe.key, 'chat.service.requestedPeerSentMe');
  assert.equal(toMe.params.user, 'Ann');
  assert.equal(
    serviceInfo(link('MessageActionRequestedPeerSentMe', { peers: [] })).key,
    'chat.service.requestedPeerSentMeBare'
  );
});
