// Bot login links and attachment-menu bots (R-Y201): the server's
// requests (fake client), the routes' validation, the buttons read and the
// page's pure helpers. Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBotLogin,
  authOut,
  domainsOf,
  webUrl,
} from '../src/sources/telegram-bot-login.js';
import { createWebApps } from '../src/sources/telegram-web-apps.js';
import { buttonOf } from '../src/web/bot-keyboard.js';
import {
  isLoginLink,
  requestBody,
  setLoginDomains,
  writeAllowedOf,
} from '../src/web/chat-bot-login.js';
import {
  botsFor,
  parseAttachLink,
  peerTypeOf,
} from '../src/web/chat-attach-bots.js';
import {
  named,
  telegramError,
  fakeClient,
  helpers,
  post,
} from './helpers/telegram-fakes.mjs';

const Api = {
  messages: {
    RequestUrlAuth: named('RequestUrlAuth'),
    AcceptUrlAuth: named('AcceptUrlAuth'),
    GetAttachMenuBots: named('GetAttachMenuBots'),
    GetAttachMenuBot: named('GetAttachMenuBot'),
    ToggleBotInAttachMenu: named('ToggleBotInAttachMenu'),
    RequestWebView: named('RequestWebView'),
  },
  help: { GetAppConfig: named('GetAppConfig') },
  contacts: { ResolveUsername: named('ResolveUsername') },
  InputUser: named('InputUser'),
};

const make = (answer) => {
  const log = [];
  const client = fakeClient(answer, log);
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: {
      withPeer: async (_c, chat, use) =>
        use({ chat, userId: BigInt(chat), accessHash: 77n }),
    },
  };
  const context = { userClient: async () => client };
  return {
    log,
    actions: createBotLogin(env, context),
    apps: createWebApps(env, context),
  };
};

const bot = { id: 7n, firstName: 'Pizza', username: 'pizza_bot' };
const request = (extra = {}) => ({
  className: 'UrlAuthResultRequest',
  domain: 'site.example',
  bot,
  requestWriteAccess: true,
  ...extra,
});

// ------------------------------------------------------------ server

test('a login button asks Telegram with its message and button', async () => {
  const { actions, log } = make(() => request());
  const answer = await actions.botUrlAuth({
    chat: '5',
    id: 12,
    buttonId: 3,
    original: 'https://site.example/login',
  });
  assert.deepEqual(answer, {
    ok: true,
    status: 'request',
    domain: 'site.example',
    bot: { id: '7', name: 'Pizza', username: 'pizza_bot' },
    requestWriteAccess: true,
  });
  assert.equal(log.length, 1);
  assert.equal(log[0].className, 'RequestUrlAuth');
  assert.equal(log[0].msgId, 12);
  assert.equal(log[0].buttonId, 3);
  assert.equal(log[0].peer.chat, '5');
  assert.equal(log[0].url, undefined);
});

test('a default or accepted answer is just an address to open', async () => {
  const dflt = make(() => ({ className: 'UrlAuthResultDefault' }));
  assert.deepEqual(
    await dflt.actions.botUrlAuth({
      chat: '5',
      id: 1,
      buttonId: 0,
      original: 'https://site.example/x',
    }),
    { ok: true, status: 'default', url: 'https://site.example/x' }
  );
  const accepted = make(() => ({
    className: 'UrlAuthResultAccepted',
    url: 'https://site.example/in?t=1',
  }));
  assert.deepEqual(await accepted.actions.botUrlAuth({ url: 'https://a.b/' }), {
    ok: true,
    status: 'accepted',
    url: 'https://site.example/in?t=1',
  });
  // An address that is not a web one is never handed to the page.
  const bad = make(() => ({
    className: 'UrlAuthResultAccepted',
    url: 'javascript:alert(1)',
  }));
  assert.equal(
    (await bad.actions.botUrlAuth({ url: 'https://a.b/' })).ok,
    false
  );
});

test('a plain link is asked by its address, not a peer', async () => {
  const { actions, log } = make(() => request({ requestWriteAccess: false }));
  await actions.botUrlAuth({ url: 'https://site.example/a?b=1' });
  assert.equal(log[0].url, 'https://site.example/a?b=1');
  assert.equal(log[0].peer, undefined);
});

test('accepting sends write_allowed only when allowed', async () => {
  const one = make(() => ({
    className: 'UrlAuthResultAccepted',
    url: 'https://site.example/in',
  }));
  const yes = await one.actions.botUrlAccept({
    chat: '5',
    id: 12,
    buttonId: 3,
    writeAllowed: true,
  });
  assert.deepEqual(yes, {
    ok: true,
    status: 'accepted',
    url: 'https://site.example/in',
  });
  assert.equal(one.log[0].className, 'AcceptUrlAuth');
  assert.equal(one.log[0].writeAllowed, true);
  await one.actions.botUrlAccept({
    url: 'https://site.example/',
    writeAllowed: false,
  });
  assert.equal(one.log[1].writeAllowed, undefined);
  assert.equal(one.log[1].url, 'https://site.example/');
  // A flag that is not a boolean is refused before Telegram is asked.
  assert.equal(
    (await one.actions.botUrlAccept({ url: 'https://a.b/' })).code,
    'bad-request'
  );
  assert.equal(one.log.length, 2);
});

test('bad requests are refused before Telegram is asked', async () => {
  const { actions, log } = make(() => request());
  for (const bad of [
    {},
    { url: 'ftp://x.example/' },
    { url: 'https://u:p@x.example/' },
    { chat: 'x', id: 1, buttonId: 1 },
    { chat: '5', id: 1 },
  ]) {
    assert.equal((await actions.botUrlAuth(bad)).code, 'bad-request');
  }
  assert.equal(log.length, 0);
});

test("Telegram's errors become codes", async () => {
  const { actions } = make(() => telegramError('URL_EXPIRED'));
  assert.equal(
    (await actions.botUrlAuth({ url: 'https://a.b/' })).code,
    'expired'
  );
});

test('no account: not supported', async () => {
  const actions = createBotLogin(
    { importer: async () => ({ Api, helpers }), connection: {} },
    { userClient: async () => null }
  );
  assert.deepEqual(await actions.attachMenuBots(), {
    ok: false,
    supported: false,
  });
});

test('the login domains come from the app config', async () => {
  const config = {
    config: {
      value: [
        { key: 'other', value: { value: 1 } },
        {
          key: 'url_auth_domains',
          value: {
            value: [{ value: 'Site.Example' }, { value: 'bad domain!' }],
          },
        },
      ],
    },
  };
  assert.deepEqual(domainsOf(config), ['site.example']);
  assert.deepEqual(domainsOf({}), []);
  const { actions, log } = make(() => config);
  assert.deepEqual(await actions.urlAuthDomains(), {
    ok: true,
    domains: ['site.example'],
  });
  assert.equal(log[0].className, 'GetAppConfig');
});

const types = [
  { className: 'AttachMenuPeerTypePM' },
  { className: 'AttachMenuPeerTypeChat' },
];
const menuBot = {
  botId: 8n,
  shortName: 'Notes',
  peerTypes: types,
  requestWriteAccess: true,
  inactive: false,
};

test('the attachment menu lists its bots with their names', async () => {
  const { actions, log } = make(() => ({
    className: 'AttachMenuBots',
    bots: [menuBot],
    users: [
      { id: 8n, firstName: 'Notes', lastName: 'Bot', username: 'nb_bot' },
    ],
  }));
  const answer = await actions.attachMenuBots();
  assert.deepEqual(answer, {
    ok: true,
    bots: [
      {
        id: '8',
        shortName: 'Notes',
        name: 'Notes Bot',
        peerTypes: ['pm', 'chat'],
        inactive: false,
        requestWriteAccess: true,
      },
    ],
  });
  assert.equal(log[0].className, 'GetAttachMenuBots');
});

test('one bot is read by id or by username', async () => {
  const { actions, log } = make((req) =>
    req.className === 'ResolveUsername'
      ? { users: [{ id: 8n, accessHash: 5n, bot: true, username: 'nb_bot' }] }
      : {
          className: 'AttachMenuBotsBot',
          bot: { ...menuBot, inactive: true },
          users: [{ id: 8n, firstName: 'Notes', username: 'nb_bot' }],
        }
  );
  const byId = await actions.attachMenuBot({ bot: '8' });
  assert.equal(byId.ok, true);
  assert.equal(byId.bot.inactive, true);
  assert.equal(byId.bot.username, 'nb_bot');
  const byName = await actions.attachMenuBot({ username: 'nb_bot' });
  assert.equal(byName.bot.id, '8');
  assert.equal(log.at(-1).className, 'GetAttachMenuBot');
  assert.equal((await actions.attachMenuBot({})).code, 'bad-request');
  assert.equal(
    (await actions.attachMenuBot({ username: 'x' })).code,
    'bad-request'
  );
});

test('adding and removing a bot toggles it in the menu', async () => {
  const { actions, log } = make(() => true);
  await actions.attachMenuToggle({
    bot: '8',
    enabled: true,
    writeAllowed: true,
  });
  assert.equal(log[0].className, 'ToggleBotInAttachMenu');
  assert.equal(log[0].enabled, true);
  assert.equal(log[0].writeAllowed, true);
  await actions.attachMenuToggle({ bot: '8', enabled: false });
  assert.equal(log[1].enabled, false);
  assert.equal(log[1].writeAllowed, undefined);
  assert.equal(
    (await actions.attachMenuToggle({ bot: '8', enabled: 'yes' })).code,
    'bad-request'
  );
  assert.equal(log.length, 2);
});

test("an attachment-menu bot's app opens without the bot menu flag", async () => {
  const { apps, log } = make(() => ({
    className: 'WebViewResultUrl',
    url: 'https://app.example/a',
    queryId: 9n,
  }));
  const answer = await apps.webAppOpen({
    kind: 'attach',
    chat: '5',
    bot: '8',
    startParam: 'go',
  });
  assert.equal(answer.ok, true);
  assert.equal(log[0].className, 'RequestWebView');
  assert.equal(log[0].fromBotMenu, undefined);
  assert.equal(log[0].url, undefined);
  assert.equal(log[0].startParam, 'go');
  assert.equal(log[0].bot.userId, 8n);
});

test('helpers on addresses', () => {
  assert.equal(webUrl('https://a.example/x'), 'https://a.example/x');
  assert.equal(webUrl('http://a.example/'), 'http://a.example/');
  assert.equal(webUrl('javascript:1'), null);
  assert.equal(authOut({ className: 'UrlAuthResultDefault' }, null).ok, false);
});

// ------------------------------------------------------------ routes

test('the routes validate before the account is asked', async () => {
  const calls = [];
  const rec = (name) => async (o) => (calls.push([name, o]), { ok: true });
  const account = {
    botUrlAuth: rec('auth'),
    botUrlAccept: rec('accept'),
    urlAuthDomains: rec('domains'),
    attachMenuBots: rec('bots'),
    attachMenuBot: rec('bot'),
    attachMenuToggle: rec('toggle'),
    webAppOpen: rec('open'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(
    await status('bot-url-auth', { chat: '5', id: 1, buttonId: 0 }),
    200
  );
  assert.equal(await status('bot-url-auth', { url: 'https://a.b/' }), 200);
  assert.equal(await status('bot-url-auth', { url: 'file:///etc' }), 400);
  assert.equal(await status('bot-url-auth', {}), 400);
  assert.equal(
    await status('bot-url-auth', {
      chat: '5',
      id: 1,
      buttonId: 0,
      original: 'javascript:1',
    }),
    400
  );
  assert.equal(
    await status('bot-url-accept', { url: 'https://a.b/', writeAllowed: true }),
    200
  );
  assert.equal(await status('bot-url-accept', { url: 'https://a.b/' }), 400);
  assert.equal(await status('url-auth-domains', {}), 200);
  assert.equal(await status('attach-menu-bots', {}), 200);
  assert.equal(await status('attach-menu-bot', { bot: '8' }), 200);
  assert.equal(await status('attach-menu-bot', { username: 'nb_bot' }), 200);
  assert.equal(
    await status('attach-menu-bot', { bot: '8', username: 'nb_bot' }),
    400
  );
  assert.equal(await status('attach-menu-bot', {}), 400);
  assert.equal(
    await status('attach-menu-toggle', { bot: '8', enabled: true }),
    200
  );
  assert.equal(
    await status('attach-menu-toggle', { bot: '8', enabled: 1 }),
    400
  );
  assert.equal(
    await status('attach-menu-toggle', {
      bot: '8',
      enabled: true,
      writeAllowed: 'x',
    }),
    400
  );
  assert.equal(
    await status('web-app-open', { kind: 'attach', chat: '5', bot: '8' }),
    200
  );
  assert.equal(
    await status('web-app-open', { kind: 'inline', chat: '5', bot: '8' }),
    400
  );
  assert.equal(calls.length, 9);
  assert.deepEqual(calls[0][1], { chat: '5', id: 1, buttonId: 0 });
});

// -------------------------------------------------------------- page

test('a login button is read with its id', () => {
  assert.deepEqual(
    buttonOf({
      className: 'KeyboardButtonUrlAuth',
      text: 'Log in',
      url: 'https://site.example/l',
      buttonId: 4,
    }),
    {
      kind: 'login',
      text: 'Log in',
      tone: null,
      url: 'https://site.example/l',
      buttonId: 4,
    }
  );
  assert.equal(
    buttonOf({ className: 'KeyboardButtonUrl', text: 'x', url: 'https://a.b/' })
      .kind,
    'url'
  );
});

test('only https links of a login domain ask', () => {
  setLoginDomains(['Site.Example']);
  assert.equal(isLoginLink('https://site.example/a'), true);
  assert.equal(isLoginLink('https://www.site.example/a'), true);
  assert.equal(isLoginLink('http://site.example/a'), false);
  assert.equal(isLoginLink('https://notsite.example/a'), false);
  assert.equal(isLoginLink('https://u:p@site.example/'), false);
  assert.equal(isLoginLink('nonsense'), false);
  setLoginDomains([]);
  assert.equal(isLoginLink('https://site.example/a'), false);
});

test('the request and the write flag', () => {
  assert.deepEqual(requestBody({ url: 'https://a.b/' }), {
    url: 'https://a.b/',
  });
  assert.deepEqual(
    requestBody({ chat: '5', id: 1, buttonId: 2, original: 'https://a.b/' }),
    { chat: '5', id: 1, buttonId: 2, original: 'https://a.b/' }
  );
  const ask = { requestWriteAccess: true };
  assert.equal(writeAllowedOf({ login: true, write: true, ...ask }), true);
  assert.equal(writeAllowedOf({ login: false, write: true, ...ask }), false);
  assert.equal(writeAllowed2(), false);
});

const writeAllowed2 = () =>
  writeAllowedOf({ login: true, write: true, requestWriteAccess: false });

test('links that name an attachment-menu bot', () => {
  assert.deepEqual(parseAttachLink('https://t.me/nb_bot?startattach=a-1'), {
    username: 'nb_bot',
    startParam: 'a-1',
  });
  assert.deepEqual(parseAttachLink('https://t.me/nb_bot?startattach'), {
    username: 'nb_bot',
    startParam: '',
  });
  assert.deepEqual(
    parseAttachLink('tg://resolve?domain=nb_bot&startattach=x'),
    {
      username: 'nb_bot',
      startParam: 'x',
    }
  );
  assert.equal(parseAttachLink('https://t.me/nb_bot'), null);
  assert.equal(parseAttachLink('https://t.me/nb_bot?startattach=a b!'), null);
  assert.equal(
    parseAttachLink('https://evil.example/nb_bot?startattach'),
    null
  );
  assert.equal(parseAttachLink('http://t.me/nb_bot?startattach'), null);
});

test('the menu offers the bots that suit the chat', () => {
  const list = [
    { id: '8', peerTypes: ['pm', 'chat'], inactive: false },
    { id: '9', peerTypes: ['broadcast'], inactive: false },
    { id: '10', peerTypes: ['pm'], inactive: true },
    { id: '11', peerTypes: ['sameBotPm', 'botPm'], inactive: false },
  ];
  const person = { current: { chat: '5', personal: true }, info: {} };
  const group = { current: { chat: '-5', personal: false }, info: {} };
  const channel = {
    current: { chat: '-100', personal: false, kind: 'channel' },
    info: {},
  };
  const botChat = {
    current: { chat: '11', personal: true },
    info: { bot: true },
  };
  assert.deepEqual(
    botsFor(list, person).map((b) => b.id),
    ['8']
  );
  assert.deepEqual(
    botsFor(list, group).map((b) => b.id),
    ['8']
  );
  assert.deepEqual(
    botsFor(list, channel).map((b) => b.id),
    ['9']
  );
  assert.deepEqual(
    botsFor(list, botChat).map((b) => b.id),
    ['11']
  );
  assert.equal(peerTypeOf(botChat, '12'), 'botPm');
  assert.equal(peerTypeOf({ info: {} }, '1'), null);
  assert.deepEqual(botsFor(null, person), []);
});
