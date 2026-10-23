// The bot and mini-app extras (R-Y194): popular apps, similar bots, a mini
// app's prepared message, a collectible's card. The source module (fake
// clients), the routes' validation, the inline send of an offered message
// and the page's pure helpers. Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  botOf,
  collectibleOk,
  createApps,
  peerTypesOf,
  previewOf,
} from '../src/sources/telegram-apps.js';
import { createInlineBots } from '../src/sources/telegram-inline-bots.js';
import { collectibleOf } from '../src/sources/telegram-usernames.js';
import {
  appTarget,
  collectibleItems,
  collectibleLabel,
  cryptoText,
  failureWord,
  fiatText,
  filterApps,
  learnUrl,
  mainAppRequest,
  mergeApps,
  peerAllowed,
  shareChats,
} from '../src/web/apps-model.js';
import { hasSimilarBots } from '../src/web/chat-similar-bots.js';
import { readBridgeMessage } from '../src/web/web-apps-model.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  bots: {
    GetPopularAppBots: named('GetPopularAppBots'),
    GetBotRecommendations: named('GetBotRecommendations'),
  },
  messages: {
    GetPreparedInlineMessage: named('GetPreparedInlineMessage'),
    SendInlineBotResult: named('SendInlineBotResult'),
  },
  fragment: { GetCollectibleInfo: named('GetCollectibleInfo') },
  InputUser: named('InputUser'),
  InputCollectibleUsername: named('InputCollectibleUsername'),
  InputCollectiblePhone: named('InputCollectiblePhone'),
  InputReplyToMessage: named('InputReplyToMessage'),
};

const user = (id, extra = {}) => ({
  className: 'User',
  id: BigInt(id),
  firstName: `Bot ${id}`,
  username: `bot_${id}`,
  bot: true,
  ...extra,
});

const make = (answer, extra = {}) => {
  const log = [];
  const offered = [];
  const remembered = [];
  const client = fakeClient(answer, log);
  const actions = createApps(
    {
      importer: async () => ({ Api, helpers }),
      connection: {
        withPeer: async (_c, chat, use) =>
          use({ userId: BigInt(chat), accessHash: 5n }),
      },
      peers: { remember: async (chat) => remembered.push(chat) },
      ...extra,
    },
    {
      userClient: async () => client,
      offer: (o) => offered.push(o),
    }
  );
  return { actions, log, offered, remembered };
};

test('a bot is listed with its monthly users and main app', () => {
  assert.deepEqual(
    botOf(user(7, { botActiveUsers: 1234, botHasMainApp: true })),
    {
      chat: '7',
      name: 'Bot 7',
      username: 'bot_7',
      users: 1234,
      mainApp: true,
    }
  );
  assert.equal(botOf(user(7)).users, null);
  assert.equal(botOf({ className: 'Channel' }), null);
});

test('peer types become words, each once', () => {
  assert.deepEqual(
    peerTypesOf([
      { className: 'InlineQueryPeerTypePM' },
      { className: 'InlineQueryPeerTypeChat' },
      { className: 'InlineQueryPeerTypeMegagroup' },
      { className: 'InlineQueryPeerTypeBroadcast' },
      { className: 'InlineQueryPeerTypeSameBotPM' },
      { className: 'Other' },
    ]),
    ['users', 'groups', 'channels', 'same-bot']
  );
  assert.deepEqual(peerTypesOf(undefined), []);
  assert.deepEqual(
    previewOf({ type: 'article', title: 'T', description: 'D', x: 1 }),
    { type: 'article', title: 'T', description: 'D' }
  );
});

test('popular apps are asked a page at a time and kept', async () => {
  const { actions, log, remembered } = make(() => ({
    className: 'PopularAppBots',
    nextOffset: '20',
    users: [user(1, { botActiveUsers: 50 }), user(2), { className: 'Chat' }],
  }));
  const first = await actions.appsPopular({ limit: 20 });
  assert.equal(first.ok, true);
  assert.deepEqual(
    first.apps.map((a) => a.chat),
    ['1', '2']
  );
  assert.equal(first.next, '20');
  assert.equal(log[0].className, 'GetPopularAppBots');
  assert.equal(log[0].offset, '');
  assert.equal(log[0].limit, 20);
  assert.deepEqual(remembered, ['1', '2']);
  await actions.appsPopular({ limit: 20 });
  assert.equal(log.length, 1);
  await actions.appsPopular({ offset: '20', limit: 20 });
  assert.equal(log[1].offset, '20');
  assert.deepEqual(await actions.appsPopular({ limit: 0 }), {
    ok: false,
    error: 'bad request',
    code: 'bad-request',
  });
  assert.equal((await actions.appsPopular({ limit: 99 })).ok, false);
});

test('the last page has no next offset', async () => {
  const { actions } = make(() => ({ users: [user(3)] }));
  assert.equal((await actions.appsPopular()).next, null);
});

test('similar bots are the ones Telegram recommends', async () => {
  const { actions, log } = make(() => ({ users: [user(4), user(5)] }));
  const answer = await actions.botSimilar({ chat: '9' });
  assert.deepEqual(
    answer.bots.map((b) => b.chat),
    ['4', '5']
  );
  assert.equal(log[0].className, 'GetBotRecommendations');
  assert.equal(log[0].bot.className, 'InputUser');
  assert.equal(log[0].bot.userId, 9n);
  assert.equal((await actions.botSimilar({ chat: 'x' })).ok, false);
  await actions.botSimilar({ chat: '9' });
  assert.equal(log.length, 1);
});

test('a prepared message is read and offered to the send', async () => {
  const { actions, log, offered } = make(() => ({
    queryId: 321n,
    result: { id: 'r1', type: 'article', title: 'Hello', description: 'Hi' },
    peerTypes: [
      { className: 'InlineQueryPeerTypePM' },
      { className: 'InlineQueryPeerTypeBroadcast' },
    ],
  }));
  const answer = await actions.preparedMessage({ bot: '9', id: 'abc_1' });
  assert.deepEqual(answer, {
    ok: true,
    queryId: '321',
    id: 'r1',
    preview: { type: 'article', title: 'Hello', description: 'Hi' },
    peerTypes: ['users', 'channels'],
    bot: '9',
  });
  assert.equal(log[0].className, 'GetPreparedInlineMessage');
  assert.equal(log[0].id, 'abc_1');
  assert.deepEqual(offered, [{ queryId: '321', id: 'r1' }]);
  assert.equal((await actions.preparedMessage({ bot: '9', id: '' })).ok, false);
});

test('an expired prepared message is a code', async () => {
  const { actions, offered } = make(() => telegramError('MESSAGE_EXPIRED'));
  assert.deepEqual(await actions.preparedMessage({ bot: '9', id: 'a' }), {
    ok: false,
    error: 'MESSAGE_EXPIRED',
    code: 'expired',
  });
  assert.deepEqual(offered, []);
  const empty = make(() => ({}));
  assert.equal(
    (await empty.actions.preparedMessage({ bot: '9', id: 'a' })).code,
    'expired'
  );
});

test('collectible info for a username and a phone', async () => {
  const { actions, log } = make(() => ({
    purchaseDate: 1_700_000_000,
    currency: 'USD',
    amount: 1250n,
    cryptoCurrency: 'TON',
    cryptoAmount: 5_500_000_000n,
    url: 'https://fragment.com/username/durov',
  }));
  const answer = await actions.collectibleInfo({
    kind: 'username',
    value: 'durov',
  });
  assert.deepEqual(answer, {
    ok: true,
    date: 1_700_000_000,
    price: { amount: '1250', currency: 'USD' },
    crypto: { amount: '5500000000', currency: 'TON' },
    url: 'https://fragment.com/username/durov',
  });
  assert.equal(log[0].collectible.className, 'InputCollectibleUsername');
  assert.equal(log[0].collectible.username, 'durov');
  await actions.collectibleInfo({ kind: 'phone', value: '+88800000000' });
  assert.equal(log[1].collectible.className, 'InputCollectiblePhone');
  assert.equal(log[1].collectible.phone, '+88800000000');
  assert.equal((await actions.collectibleInfo({ kind: 'x' })).ok, false);
});

test('Telegram errors and no account', async () => {
  const { actions } = make(() => telegramError('USERNAME_INVALID'));
  assert.equal(
    (await actions.collectibleInfo({ kind: 'username', value: 'abcde' })).code,
    'not-collectible'
  );
  const none = createApps(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => null }
  );
  assert.deepEqual(await none.appsPopular(), { ok: false, supported: false });
});

test('collectible requests are checked', () => {
  assert.equal(collectibleOk('username', 'durov'), true);
  assert.equal(collectibleOk('username', 'a b'), false);
  assert.equal(collectibleOk('phone', '+88800000000'), true);
  assert.equal(collectibleOk('phone', 'abc'), false);
  assert.equal(collectibleOk('other', 'durov'), false);
});

test('chat info marks collectible usernames and numbers', () => {
  assert.deepEqual(
    collectibleOf({
      usernames: [
        { username: 'plain', editable: true, active: true },
        { username: 'rare', editable: false, active: true },
        { username: 'off', editable: false, active: false },
      ],
      phone: '88801234567',
    }),
    { collectible: { usernames: ['rare'], phone: '+88801234567' } }
  );
  assert.deepEqual(collectibleOf({ phone: '79001234567' }), {});
  assert.deepEqual(collectibleOf({}), {});
});

// --------------------------------------------------------- inline send

test('an offered prepared message goes to the chat picked, once offered', async () => {
  const log = [];
  const client = fakeClient(() => ({ className: 'Updates' }), log);
  const actions = createInlineBots(
    {
      importer: async () => ({
        Api,
        helpers: {
          ...helpers,
          readBigIntFromBuffer: (buf) => BigInt(`0x${buf.toString('hex')}`),
        },
      }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => client,
      apply: async () => {},
      lists: { remember: () => [], onAgain: () => {} },
      now: () => 0,
    }
  );
  const send = { chat: '42', queryId: '321', id: 'r1' };
  assert.equal((await actions.inlineSend(send)).code, 'expired');
  actions.inlineOffer({ queryId: '321', id: 'r1' });
  assert.equal((await actions.inlineSend(send)).ok, true);
  assert.equal(log.at(-1).className, 'SendInlineBotResult');
  assert.equal(log.at(-1).id, 'r1');
  assert.equal(
    (await actions.inlineSend({ ...send, chat: '43' })).ok,
    true,
    'any chat'
  );
  assert.equal(
    (await actions.inlineSend({ ...send, id: 'other' })).code,
    'expired'
  );
});

// -------------------------------------------------------------- routes

test('the routes validate before the account is asked', async () => {
  const calls = [];
  const account = {
    appsPopular: async (o) => (calls.push(['popular', o]), { ok: true }),
    botSimilar: async (o) => (calls.push(['similar', o]), { ok: true }),
    preparedMessage: async (o) => (calls.push(['prepared', o]), { ok: true }),
    collectibleInfo: async (o) => (
      calls.push(['collectible', o]),
      { ok: true }
    ),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('apps-popular', {}), 200);
  assert.equal(await status('apps-popular', { offset: '20', limit: 10 }), 200);
  assert.equal(await status('apps-popular', { limit: 0 }), 400);
  assert.equal(await status('apps-popular', { limit: 51 }), 400);
  assert.equal(await status('apps-popular', { limit: '5' }), 400);
  assert.equal(await status('apps-popular', { offset: 5 }), 400);
  assert.equal(await status('bot-similar', { chat: '7' }), 200);
  assert.equal(await status('bot-similar', { chat: '-100123' }), 400);
  assert.equal(await status('bot-similar', {}), 400);
  assert.equal(
    await status('prepared-message', { bot: '7', id: 'a_b-1' }),
    200
  );
  assert.equal(await status('prepared-message', { bot: '7', id: 'a b' }), 400);
  assert.equal(await status('prepared-message', { bot: 'x', id: 'a' }), 400);
  assert.equal(
    await status('collectible-info', { kind: 'username', value: 'durov' }),
    200
  );
  assert.equal(
    await status('collectible-info', { kind: 'phone', value: '+88800000000' }),
    200
  );
  assert.equal(
    await status('collectible-info', { kind: 'username', value: '1' }),
    400
  );
  assert.equal(await status('collectible-info', { kind: 'nope' }), 400);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['popular', 'popular', 'similar', 'prepared', 'collectible', 'collectible']
  );
  assert.deepEqual(calls[1][1], { offset: '20', limit: 10 });
});

test('the routes need the account to support them', async () => {
  assert.equal((await post('apps-popular', {}, {})).status, 400);
});

// ------------------------------------------------------------ page side

test('the apps list narrows by name or username and merges pages', () => {
  const apps = [
    { chat: '1', name: 'Pizza Shop', username: 'pizza_bot' },
    { chat: '2', name: 'Weather', username: 'rain_bot' },
  ];
  assert.deepEqual(filterApps(apps, '  PIZ '), [apps[0]], 'name, case folded');
  assert.deepEqual(filterApps(apps, '@rain'), [apps[1]], 'username');
  assert.equal(filterApps(apps, '').length, 2);
  assert.equal(filterApps(apps, 'zzz').length, 0);
  assert.deepEqual(
    mergeApps(apps, [apps[1], { chat: '3', name: 'C', username: 'c_bot' }]).map(
      (a) => a.chat
    ),
    ['1', '2', '3']
  );
  assert.deepEqual(appTarget(apps[0]), {
    source: 'telegram',
    chat: '1',
    name: 'Pizza Shop',
    kind: 'user',
  });
});

test('only an app with a main app can be launched', () => {
  assert.deepEqual(
    mainAppRequest({
      chat: '1',
      name: 'Pizza',
      username: 'pizza_bot',
      mainApp: true,
    }),
    { kind: 'main', username: 'pizza_bot', chat: '1', name: 'Pizza' }
  );
  assert.equal(
    mainAppRequest({ chat: '1', username: 'pizza_bot', mainApp: false }),
    null
  );
  assert.equal(mainAppRequest({ chat: '1', mainApp: true }), null);
  assert.equal(mainAppRequest(null), null);
});

test('a prepared message goes only to the kinds of chat allowed', () => {
  const chats = [
    { key: 'telegram:1', source: 'telegram', chat: '1', kind: 'private' },
    { key: 'telegram:9', source: 'telegram', chat: '9', kind: 'private' },
    { key: 'telegram:-2', source: 'telegram', chat: '-2', kind: 'group' },
    { key: 'telegram:-100', source: 'telegram', chat: '-100', kind: 'channel' },
    {
      key: 'telegram:-3',
      source: 'telegram',
      chat: '-3',
      kind: 'group',
      archived: true,
    },
    { key: 'other:5', source: 'other', chat: '5', kind: 'private' },
  ];
  const keys = (types, bot) => shareChats(chats, types, bot).map((c) => c.key);
  assert.deepEqual(keys(['users'], '9'), ['telegram:1', 'telegram:9']);
  assert.deepEqual(keys(['groups'], '9'), ['telegram:-2']);
  assert.deepEqual(keys(['channels'], '9'), ['telegram:-100']);
  assert.deepEqual(keys(['same-bot'], '9'), ['telegram:9']);
  assert.deepEqual(keys([], '9'), []);
  assert.equal(peerAllowed(['users'], null, '9'), false);
  assert.equal(failureWord('expired'), 'MESSAGE_EXPIRED');
  assert.equal(failureWord('whatever'), 'UNKNOWN_ERROR');
});

test('the bridge hears the prepared-message event with a valid id only', () => {
  const frame = {};
  const origin = 'https://app.example';
  const read = (data) =>
    readBridgeMessage(
      {
        source: frame,
        origin,
        data: JSON.stringify({
          eventType: 'web_app_send_prepared_message',
          eventData: data,
        }),
      },
      { frame, origin }
    );
  assert.deepEqual(read({ id: 'abc_1-X' }), {
    type: 'web_app_send_prepared_message',
    data: { id: 'abc_1-X' },
  });
  assert.equal(read({ id: '' }), null);
  assert.equal(read({ id: 5 }), null);
  assert.equal(read({ id: 'a b' }), null);
  assert.equal(read({}), null);
});

test('similar bots are offered for Telegram bots only', () => {
  const api = { telegramBotSimilar: () => {} };
  const chat = { source: 'telegram', chat: '77' };
  assert.equal(hasSimilarBots(chat, { bot: true }, api), true);
  assert.equal(hasSimilarBots(chat, { bot: false }, api), false);
  assert.equal(hasSimilarBots(chat, null, api), false);
  assert.equal(
    hasSimilarBots({ ...chat, chat: '-100' }, { bot: true }, api),
    false
  );
  assert.equal(hasSimilarBots(chat, { bot: true }, {}), false);
});

test('the card: links, money and crypto', () => {
  assert.equal(learnUrl('https://fragment.com/x'), 'https://fragment.com/x');
  assert.equal(learnUrl('http://fragment.com/x'), 'http://fragment.com/x');
  assert.equal(learnUrl('javascript:alert(1)'), null);
  assert.equal(learnUrl('tg://resolve?domain=x'), null);
  assert.equal(learnUrl(''), null);
  assert.equal(fiatText('1250', 'USD', 'en'), '$12.50');
  assert.equal(fiatText('500', 'JPY', 'en'), '¥500');
  assert.equal(cryptoText('5500000000', 'TON', 'en'), '5.5 TON');
  assert.equal(collectibleLabel('username', 'durov'), '@durov');
  assert.equal(collectibleLabel('phone', '+88800000000'), '+88800000000');
  assert.deepEqual(
    collectibleItems({
      collectible: { usernames: ['a_name', 'b_name'], phone: '+88800000000' },
    }),
    [
      { kind: 'username', value: 'a_name' },
      { kind: 'username', value: 'b_name' },
      { kind: 'phone', value: '+88800000000' },
    ]
  );
  assert.deepEqual(collectibleItems({}), []);
});
