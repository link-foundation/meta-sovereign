// A bot's mini apps (R-Y168): the addresses that may be opened, the links
// that name an app, the theme told to the app, what a message from the
// app's frame must look like to be believed, the panel each event
// changes, the timer that keeps the query alive, the server's requests
// (fake client), and the routes' validation. No network.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  appUrl,
  buttonShown,
  hexOf,
  initialPanel,
  originOf,
  outgoing,
  panelAfter,
  parseAppLink,
  PROLONG_MS,
  readBridgeMessage,
  startProlong,
  themeParamsOf,
  tgLinkOf,
  viewportOf,
} from '../src/web/web-apps-model.js';
import { buttonOf } from '../src/web/bot-keyboard.js';
import { serverBody } from '../src/web/chat-web-apps.js';
import { createWebApps } from '../src/sources/telegram-web-apps.js';
import {
  named,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

test('only https addresses without credentials open', () => {
  assert.equal(
    appUrl('https://app.example/x?a=1#f'),
    'https://app.example/x?a=1#f'
  );
  assert.equal(appUrl('http://app.example/'), null);
  assert.equal(appUrl('javascript:alert(1)'), null);
  assert.equal(appUrl('https://user:pw@app.example/'), null);
  assert.equal(appUrl('data:text/html,hi'), null);
  assert.equal(appUrl(`https://a.example/${'x'.repeat(2100)}`), null);
  assert.equal(appUrl(''), null);
  assert.equal(
    originOf('https://app.example:8443/x'),
    'https://app.example:8443'
  );
  assert.equal(originOf('http://app.example/'), null);
});

test('links that name an app', () => {
  assert.deepEqual(parseAppLink('https://t.me/pizza_bot/menu?startapp=a-1'), {
    kind: 'app',
    username: 'pizza_bot',
    shortName: 'menu',
    startParam: 'a-1',
  });
  assert.deepEqual(parseAppLink('https://t.me/pizza_bot?startapp=x'), {
    kind: 'main',
    username: 'pizza_bot',
    shortName: null,
    startParam: 'x',
  });
  assert.equal(parseAppLink('https://t.me/pizza_bot/menu').startParam, null);
  assert.equal(
    parseAppLink('tg://resolve?domain=pizza_bot&appname=menu&startapp=q')
      .shortName,
    'menu'
  );
  // Not apps: plain bot links, message links, other paths.
  assert.equal(parseAppLink('https://t.me/pizza_bot'), null);
  assert.equal(parseAppLink('https://t.me/pizza_bot/123'), null);
  assert.equal(parseAppLink('https://t.me/joinchat/abcdef'), null);
  assert.equal(parseAppLink('https://t.me/c/123/menu'), null);
  assert.equal(parseAppLink('https://t.me/pizza_bot/menu/more'), null);
  assert.equal(parseAppLink('https://evil.example/pizza_bot/menu'), null);
  assert.equal(parseAppLink('http://t.me/pizza_bot/menu'), null);
  assert.equal(parseAppLink('https://t.me/pizza_bot?startapp=a b'), null);
  assert.equal(parseAppLink('not a url'), null);
});

test('a tg link path becomes a t.me address only when it is one', () => {
  assert.equal(
    tgLinkOf('/pizza_bot?start=1'),
    'https://t.me/pizza_bot?start=1'
  );
  assert.equal(tgLinkOf('//evil.example/x'), null);
  assert.equal(tgLinkOf('pizza_bot'), null);
  assert.equal(tgLinkOf('/a\\b'), null);
  assert.equal(tgLinkOf('/a\nb'), null);
});

test('colours are read as #rrggbb and the theme falls back', () => {
  assert.equal(hexOf('#abc'), '#aabbcc');
  assert.equal(hexOf('#112233ff'), '#112233');
  assert.equal(hexOf('rgb(1, 2, 255)'), '#0102ff');
  assert.equal(hexOf('rgba(0 0 0 / 0.5)'), '#000000');
  assert.equal(hexOf('rgb(1, 2, 999)'), null);
  assert.equal(hexOf('red'), null);
  const theme = themeParamsOf((name) =>
    name === '--text' ? ' #ffffff ' : name === '--bg' ? 'color-mix(a)' : ''
  );
  assert.equal(theme.text_color, '#ffffff');
  assert.equal(theme.secondary_bg_color, '#0e1116');
  assert.equal(theme.button_text_color, '#ffffff');
  assert.ok(Object.values(theme).every((v) => /^#[0-9a-f]{6}$/.test(v)));
  assert.ok(Object.keys(theme).includes('destructive_text_color'));
});

test('viewport and outgoing messages have the documented shapes', () => {
  assert.deepEqual(
    viewportOf({ width: 383.6, height: 500.2, expanded: false }),
    {
      height: 500,
      width: 384,
      is_expanded: false,
      is_state_stable: true,
    }
  );
  assert.deepEqual(JSON.parse(outgoing('popup_closed', { button_id: 'a' })), {
    eventType: 'popup_closed',
    eventData: { button_id: 'a' },
  });
  assert.deepEqual(JSON.parse(outgoing('main_button_pressed')), {
    eventType: 'main_button_pressed',
    eventData: {},
  });
});

const frame = {};
const ORIGIN = 'https://app.example';
const say = (eventType, eventData, extra = {}) => ({
  source: frame,
  origin: ORIGIN,
  data: JSON.stringify({ eventType, eventData }),
  ...extra,
});
const read = (event) => readBridgeMessage(event, { frame, origin: ORIGIN });

test('official SDK no-argument events accept eventData empty strings without accepting bad action payloads', () => {
  for (const type of [
    'web_app_ready',
    'web_app_close',
    'web_app_request_theme',
    'web_app_request_viewport',
  ]) {
    assert.equal(read(say(type, '')).type, type);
  }
  assert.equal(read(say('web_app_data_send', '')), null);
  assert.equal(
    read(say('web_app_ready', '', { origin: 'https://evil.example' })),
    null
  );
  assert.equal(read(say('web_app_ready', '', { source: {} })), null);
});

test('a message is believed only from the frame and its origin', () => {
  assert.deepEqual(read(say('web_app_ready')), {
    type: 'web_app_ready',
    data: {},
  });
  assert.equal(read(say('web_app_ready', {}, { source: {} })), null);
  assert.equal(read(say('web_app_ready', {}, { source: null })), null);
  assert.equal(
    read(say('web_app_ready', {}, { origin: 'https://evil.example' })),
    null
  );
  assert.equal(
    readBridgeMessage(say('web_app_ready'), { frame: null, origin: ORIGIN }),
    null
  );
  assert.equal(
    readBridgeMessage(say('web_app_ready'), { frame, origin: null }),
    null
  );
});

test('bodies that are not documented events are ignored', () => {
  assert.equal(read({ source: frame, origin: ORIGIN, data: 'nope' }), null);
  assert.equal(read({ source: frame, origin: ORIGIN, data: '[]' }), null);
  assert.equal(read({ source: frame, origin: ORIGIN, data: 42 }), null);
  assert.equal(
    read({ source: frame, origin: ORIGIN, data: 'x'.repeat(30_000) }),
    null
  );
  assert.equal(
    read(say('web_app_trigger_haptic_feedback', { type: 'impact' })),
    null
  );
  assert.equal(read(say('constructor', {})), null);
  assert.equal(read(say('web_app_ready', 'text')), null);
  assert.equal(read(say('web_app_ready', [1])), null);
  assert.equal(read(say(5, {})), null);
  // An object body is read as well as JSON text.
  assert.equal(
    read({
      source: frame,
      origin: ORIGIN,
      data: { eventType: 'web_app_expand' },
    }).type,
    'web_app_expand'
  );
});

test('links the app asks to open are checked', () => {
  assert.equal(
    read(say('web_app_open_link', { url: 'https://x.example/a' })).data.url,
    'https://x.example/a'
  );
  assert.equal(
    read(say('web_app_open_link', { url: 'javascript:alert(1)' })),
    null
  );
  assert.equal(
    read(say('web_app_open_link', { url: 'http://x.example' })),
    null
  );
  assert.equal(read(say('web_app_open_link', {})), null);
  assert.equal(
    read(say('web_app_open_tg_link', { path_full: '/bot?start=1' })).data.url,
    'https://t.me/bot?start=1'
  );
  assert.equal(
    read(say('web_app_open_tg_link', { path_full: '//evil.example' })),
    null
  );
});

test('buttons are read with their limits', () => {
  const main = read(
    say('web_app_setup_main_button', {
      is_visible: true,
      is_active: false,
      is_progress_visible: true,
      text: '  Pay  ',
      color: '#ff0000',
      text_color: 'url(x)',
    })
  ).data;
  assert.deepEqual(main, {
    visible: true,
    active: false,
    progress: true,
    text: 'Pay',
    color: '#ff0000',
    textColor: null,
  });
  const second = read(
    say('web_app_setup_secondary_button', {
      is_visible: true,
      text: 'No',
      position: 'top',
    })
  ).data;
  assert.equal(second.position, 'top');
  assert.equal(second.active, true);
  assert.equal(
    read(say('web_app_setup_secondary_button', { text: 'No', position: 'x' }))
      .data.position,
    'left'
  );
  assert.equal(
    read(
      say('web_app_setup_main_button', {
        is_visible: true,
        text: 'x'.repeat(65),
      })
    ).data.text,
    ''
  );
  assert.equal(buttonShown(main), true);
  assert.equal(buttonShown({ visible: true, text: '' }), false);
});

test('popups: counts, lengths and types', () => {
  const ok = read(
    say('web_app_open_popup', {
      title: 'T',
      message: 'Sure?',
      buttons: [
        { id: 'y', type: 'destructive', text: 'Yes' },
        { type: 'cancel' },
      ],
    })
  ).data;
  assert.equal(ok.buttons.length, 2);
  assert.equal(ok.buttons[1].id, '');
  // No buttons given: one Close.
  assert.deepEqual(
    read(say('web_app_open_popup', { message: 'Hi' })).data.buttons,
    [{ id: '', type: 'close', text: null }]
  );
  const popup = (extra) =>
    read(say('web_app_open_popup', { message: 'm', ...extra }));
  assert.equal(popup({ message: '' }), null);
  assert.equal(popup({ message: 'x'.repeat(257) }), null);
  assert.equal(popup({ title: 'x'.repeat(65) }), null);
  assert.equal(popup({ buttons: [] }), null);
  assert.equal(popup({ buttons: Array(4).fill({ type: 'close' }) }), null);
  assert.equal(popup({ buttons: [{ type: 'default' }] }), null);
  assert.equal(popup({ buttons: [{ type: 'weird', text: 'x' }] }), null);
  assert.equal(popup({ buttons: ['x'] }), null);
});

test('data sent by a keyboard app is bounded in bytes', () => {
  assert.equal(
    read(say('web_app_data_send', { data: 'abc' })).data.data,
    'abc'
  );
  assert.equal(read(say('web_app_data_send', { data: '' })), null);
  assert.equal(read(say('web_app_data_send', { data: 5 })), null);
  assert.equal(
    read(say('web_app_data_send', { data: 'я'.repeat(2049) })),
    null
  );
  assert.ok(read(say('web_app_data_send', { data: 'я'.repeat(2048) })));
});

test('the panel follows what the app asks', () => {
  let panel = initialPanel();
  const act = (type, data) => {
    panel = panelAfter(panel, read(say(type, data)));
  };
  assert.equal(panel.ready, false);
  act('web_app_ready');
  act('web_app_expand');
  act('web_app_setup_back_button', { is_visible: true });
  act('web_app_setup_closing_behavior', { need_confirmation: true });
  act('web_app_set_header_color', { color_key: 'secondary_bg_color' });
  act('web_app_set_background_color', { color: '#102030' });
  act('web_app_setup_main_button', { is_visible: true, text: 'Go' });
  assert.equal(panel.ready, true);
  assert.equal(panel.expanded, true);
  assert.equal(panel.back, true);
  assert.equal(panel.confirmClose, true);
  assert.equal(panel.header, 'secondary_bg_color');
  assert.equal(panel.background, '#102030');
  assert.equal(panel.main.text, 'Go');
  act('web_app_set_header_color', { color: '#abcdef' });
  assert.equal(panel.header, '#abcdef');
  assert.equal(
    read(say('web_app_set_header_color', { color_key: 'other' })),
    null
  );
  // Events that only ask for an answer do not change it.
  const before = panel;
  act('web_app_request_theme');
  assert.equal(panel, before);
});

test('a web-app button is read as simple or not', () => {
  const web = buttonOf({
    className: 'KeyboardButtonWebView',
    text: 'Open',
    url: 'https://a.example/',
  });
  const simple = buttonOf({
    className: 'KeyboardButtonSimpleWebView',
    text: 'Open',
    url: 'https://a.example/',
  });
  assert.equal(web.kind, 'app');
  assert.equal(web.simple, false);
  assert.equal(simple.simple, true);
});

test('the request body for the server keeps known fields and the colours', () => {
  const body = serverBody(
    {
      kind: 'app',
      username: 'b_bot',
      shortName: 'menu',
      startParam: 'x',
      name: 'Bot',
      href: 'https://t.me/x',
      bot: null,
    },
    { bg_color: '#000000' }
  );
  assert.deepEqual(body, {
    kind: 'app',
    username: 'b_bot',
    shortName: 'menu',
    startParam: 'x',
    theme: { bg_color: '#000000' },
  });
});

test('the query is prolonged every 60 seconds until stopped', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    let calls = 0;
    const stop = startProlong(() => {
      calls += 1;
      return Promise.reject(new Error('gone'));
    });
    mock.timers.tick(PROLONG_MS - 1);
    assert.equal(calls, 0);
    mock.timers.tick(1);
    assert.equal(calls, 1);
    mock.timers.tick(PROLONG_MS * 2);
    assert.equal(calls, 3);
    stop();
    mock.timers.tick(PROLONG_MS * 5);
    assert.equal(calls, 3);
    // A call that throws does not end the timer.
    const stopThrowing = startProlong(() => {
      throw new Error('boom');
    }, 10);
    mock.timers.tick(30);
    stopThrowing();
  } finally {
    mock.timers.reset();
  }
  assert.equal(PROLONG_MS, 60_000);
});

// ------------------------------------------------------------- server

const Api = {
  InputUser: named('InputUser'),
  DataJSON: named('DataJSON'),
  InputBotAppShortName: named('InputBotAppShortName'),
  InputBotAppID: named('InputBotAppID'),
  contacts: { ResolveUsername: named('ResolveUsername') },
  messages: {
    RequestWebView: named('RequestWebView'),
    RequestSimpleWebView: named('RequestSimpleWebView'),
    RequestMainWebView: named('RequestMainWebView'),
    GetBotApp: named('GetBotApp'),
    RequestAppWebView: named('RequestAppWebView'),
    ProlongWebView: named('ProlongWebView'),
    SendWebViewData: named('SendWebViewData'),
  },
};
const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: (b) => b.readBigUInt64BE(0),
};
const bot = {
  id: 7n,
  accessHash: 99n,
  username: 'pizza_bot',
  firstName: 'Pizza',
  bot: true,
};

const make = (answer) => {
  const log = [];
  const applied = [];
  const client = fakeClient(answer, log);
  const actions = createWebApps(
    {
      importer: async () => ({ Api, helpers }),
      connection: {
        withPeer: async (_c, chat, use) =>
          use({ chat, userId: BigInt(chat), accessHash: 77n }),
      },
    },
    {
      userClient: async () => client,
      apply: async (_c, result) => applied.push(result),
    }
  );
  return { actions, log, applied };
};

const THEME = { bg_color: '#112233', text_color: '#ffffff' };

test('the menu button asks for a web view from the bot menu', async () => {
  const { actions, log } = make(() => ({
    className: 'WebViewResultUrl',
    url: 'https://app.example/menu#tgWebAppData=x',
    queryId: 55n,
    fullsize: true,
  }));
  const answer = await actions.webAppOpen({
    kind: 'menu',
    chat: '7',
    bot: '7',
    url: 'https://app.example/menu',
    theme: THEME,
  });
  assert.deepEqual(answer, {
    ok: true,
    url: 'https://app.example/menu#tgWebAppData=x',
    queryId: '55',
    fullsize: true,
  });
  const [request] = log;
  assert.equal(request.className, 'RequestWebView');
  assert.equal(request.fromBotMenu, true);
  assert.equal(request.url, 'https://app.example/menu');
  assert.equal(request.platform, 'weba');
  assert.deepEqual(JSON.parse(request.themeParams.data), THEME);
  assert.equal(request.bot.className, 'InputUser');
  assert.equal(request.bot.userId, 7n);
});

test('an inline keyboard button is a web view, not from the menu', async () => {
  const { actions, log } = make(() => ({
    url: 'https://app.example/i',
    queryId: 1n,
  }));
  const answer = await actions.webAppOpen({
    kind: 'inline',
    chat: '-5',
    bot: '7',
    url: 'https://app.example/i',
  });
  assert.equal(answer.ok, true);
  assert.equal(log[0].fromBotMenu, undefined);
  assert.equal(log[0].themeParams, undefined);
});

test('a reply keyboard button is a simple web view; its data is sent', async () => {
  const { actions, log, applied } = make((request) =>
    request.className === 'RequestSimpleWebView'
      ? { url: 'https://app.example/s' }
      : { className: 'Updates' }
  );
  const answer = await actions.webAppOpen({
    kind: 'simple',
    bot: '7',
    url: 'https://app.example/s',
  });
  assert.deepEqual(answer, {
    ok: true,
    url: 'https://app.example/s',
    queryId: null,
    fullsize: false,
  });
  assert.equal(log[0].className, 'RequestSimpleWebView');
  const sent = await actions.webAppSendData({
    bot: '7',
    text: ' Pick ',
    data: '{"a":1}',
  });
  assert.deepEqual(sent, { ok: true });
  assert.equal(log[1].className, 'SendWebViewData');
  assert.equal(log[1].buttonText, 'Pick');
  assert.equal(log[1].data, '{"a":1}');
  assert.equal(typeof log[1].randomId, 'bigint');
  assert.equal(applied.length, 1);
});

test('a t.me app link: bot resolved, app found, view requested', async () => {
  const { actions, log } = make((request) => {
    switch (request.className) {
      case 'ResolveUsername':
        return { users: [{ id: 1n, bot: false }, bot] };
      case 'GetBotApp':
        return {
          app: {
            className: 'BotApp',
            id: 3n,
            accessHash: 4n,
            title: 'Menu app',
          },
        };
      default:
        return { url: 'https://app.example/a' };
    }
  });
  const answer = await actions.webAppOpen({
    kind: 'app',
    username: 'pizza_bot',
    shortName: 'menu',
    startParam: 'p1',
  });
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.bot, {
    id: '7',
    name: 'Pizza',
    username: 'pizza_bot',
    title: 'Menu app',
  });
  assert.deepEqual(
    log.map((r) => r.className),
    ['ResolveUsername', 'GetBotApp', 'RequestAppWebView']
  );
  assert.equal(log[1].app.shortName, 'menu');
  assert.equal(log[2].app.className, 'InputBotAppID');
  assert.equal(log[2].app.id, 3n);
  assert.equal(log[2].startParam, 'p1');
  assert.equal(log[2].peer.userId, 7n);
});

test('a t.me main app link asks for the main web view', async () => {
  const { actions, log } = make((request) =>
    request.className === 'ResolveUsername'
      ? { users: [bot] }
      : { url: 'https://app.example/m' }
  );
  const answer = await actions.webAppOpen({
    kind: 'main',
    username: 'pizza_bot',
    startParam: 'z',
  });
  assert.equal(answer.ok, true);
  assert.equal(log[1].className, 'RequestMainWebView');
  assert.equal(log[1].startParam, 'z');
});

test('missing bots and apps are answered, not thrown', async () => {
  const none = make(() => ({ users: [] }));
  assert.equal(
    (await none.actions.webAppOpen({ kind: 'main', username: 'pizza_bot' }))
      .code,
    'no-bot'
  );
  const noApp = make((request) =>
    request.className === 'ResolveUsername'
      ? { users: [bot] }
      : { app: { className: 'BotAppNotModified' } }
  );
  assert.equal(
    (
      await noApp.actions.webAppOpen({
        kind: 'app',
        username: 'pizza_bot',
        shortName: 'menu',
      })
    ).code,
    'no-app'
  );
  const refused = make(() => telegramError('BOT_APP_INVALID'));
  assert.equal(
    (await refused.actions.webAppOpen({ kind: 'menu', chat: '7', bot: '7' }))
      .code,
    'no-app'
  );
});

test('an address Telegram answers that is not https opens nothing', async () => {
  for (const url of ['http://app.example/', 'javascript:alert(1)', undefined]) {
    const { actions } = make(() => ({ url }));
    const answer = await actions.webAppOpen({
      kind: 'menu',
      chat: '7',
      bot: '7',
    });
    assert.equal(answer.ok, false);
    assert.equal(answer.code, 'bad-url');
  }
});

test('requests that are not valid are refused before Telegram is asked', async () => {
  const { actions, log } = make(() => ({}));
  const refuse = async (o) =>
    assert.equal(
      (await actions.webAppOpen(o)).code,
      'bad-request',
      JSON.stringify(o)
    );
  await refuse({ kind: 'nope', chat: '7', bot: '7' });
  await refuse({ kind: 'inline', chat: '7', bot: '7' });
  await refuse({
    kind: 'inline',
    chat: '7',
    bot: '7',
    url: 'http://a.example/',
  });
  await refuse({ kind: 'menu', chat: '7', bot: '7', url: 'http://a.example/' });
  await refuse({ kind: 'menu', chat: 'x', bot: '7' });
  await refuse({ kind: 'simple', bot: 'x', url: 'https://a.example/' });
  await refuse({ kind: 'app', username: 'pizza_bot' });
  await refuse({ kind: 'app', username: 'no', shortName: 'menu' });
  await refuse({ kind: 'main', username: 'pizza_bot', startParam: 'a b' });
  assert.equal(
    (await actions.webAppSendData({ bot: '7', text: 'x', data: '' })).code,
    'bad-request'
  );
  assert.equal(
    (await actions.webAppSendData({ bot: '7', text: '', data: 'x' })).code,
    'bad-request'
  );
  assert.equal(
    (
      await actions.webAppSendData({
        bot: '7',
        text: 'x',
        data: 'я'.repeat(2049),
      })
    ).code,
    'bad-request'
  );
  assert.equal(
    (await actions.webAppProlong({ chat: '7', bot: '7', queryId: 'x' })).code,
    'bad-request'
  );
  assert.equal(log.length, 0);
});

test('prolonging is silent and names the query', async () => {
  const { actions, log } = make(() => true);
  assert.deepEqual(
    await actions.webAppProlong({ chat: '7', bot: '7', queryId: '55' }),
    { ok: true }
  );
  assert.equal(log[0].className, 'ProlongWebView');
  assert.equal(log[0].silent, true);
  assert.equal(log[0].queryId, 55n);
});

test('no account: not supported', async () => {
  const actions = createWebApps(
    { importer: async () => ({ Api, helpers }), connection: {} },
    { userClient: async () => null }
  );
  assert.deepEqual(
    await actions.webAppProlong({ chat: '7', bot: '7', queryId: '5' }),
    {
      ok: false,
      supported: false,
    }
  );
});

// ------------------------------------------------------------- routes

test('the routes validate before the account is asked', async () => {
  const calls = [];
  const account = {
    webAppOpen: async (o) => (calls.push(['open', o]), { ok: true }),
    webAppProlong: async (o) => (calls.push(['prolong', o]), { ok: true }),
    webAppSendData: async (o) => (calls.push(['data', o]), { ok: true }),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(
    await status('web-app-open', {
      kind: 'menu',
      chat: '7',
      bot: '7',
      url: 'https://a.example/',
      theme: THEME,
    }),
    200
  );
  assert.equal(
    await status('web-app-open', { kind: 'menu', chat: '7', bot: '7' }),
    200
  );
  assert.equal(
    await status('web-app-open', {
      kind: 'main',
      username: 'pizza_bot',
      startParam: 'x',
    }),
    200
  );
  assert.equal(
    await status('web-app-open', {
      kind: 'app',
      username: 'pizza_bot',
      shortName: 'menu',
    }),
    200
  );
  assert.equal(
    await status('web-app-open', {
      kind: 'simple',
      bot: '7',
      url: 'https://a.example/',
    }),
    200
  );
  // Refused.
  assert.equal(
    await status('web-app-open', {
      kind: 'menu',
      chat: '7',
      bot: '7',
      url: 'http://a.example/',
    }),
    400
  );
  assert.equal(
    await status('web-app-open', { kind: 'inline', chat: '7', bot: '7' }),
    400
  );
  assert.equal(
    await status('web-app-open', {
      kind: 'menu',
      chat: '7',
      bot: '7',
      theme: { bg: 'red' },
    }),
    400
  );
  assert.equal(
    await status('web-app-open', {
      kind: 'menu',
      chat: '7',
      bot: '7',
      theme: [],
    }),
    400
  );
  assert.equal(
    await status('web-app-open', { kind: 'bad', chat: '7', bot: '7' }),
    400
  );
  assert.equal(
    await status('web-app-open', { kind: 'main', username: 'x' }),
    400
  );
  assert.equal(
    await status('web-app-open', { kind: 'app', username: 'pizza_bot' }),
    400
  );
  assert.equal(
    await status('web-app-open', {
      kind: 'main',
      username: 'pizza_bot',
      startParam: '<x>',
    }),
    400
  );
  assert.equal(await status('web-app-open', {}), 400);
  assert.equal(
    await status('web-app-prolong', { chat: '7', bot: '7', queryId: '55' }),
    200
  );
  assert.equal(await status('web-app-prolong', { chat: '7', bot: '7' }), 400);
  assert.equal(
    await status('web-app-prolong', { chat: 'x', bot: '7', queryId: '5' }),
    400
  );
  assert.equal(
    await status('web-app-data', { bot: '7', text: 'Pick', data: 'x' }),
    200
  );
  assert.equal(
    await status('web-app-data', { bot: '7', text: 'Pick', data: '' }),
    400
  );
  assert.equal(
    await status('web-app-data', {
      bot: '7',
      text: 'Pick',
      data: 'я'.repeat(2049),
    }),
    400
  );
  assert.equal(
    await status('web-app-data', { bot: '7', text: 'x'.repeat(65), data: 'x' }),
    400
  );
  assert.equal(
    await status('web-app-data', { bot: 'x', text: 'Pick', data: 'x' }),
    400
  );
  assert.equal(calls.filter(([k]) => k === 'open').length, 5);
  assert.equal(calls.length, 5 + 1 + 1);
  // Only known fields reach the account.
  assert.deepEqual(Object.keys(calls[0][1]).sort(), [
    'bot',
    'chat',
    'kind',
    'theme',
    'url',
  ]);
});
