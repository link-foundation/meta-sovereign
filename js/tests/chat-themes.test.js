// Chat themes and several usernames (R-Y170): the two source modules with a
// fake client, the route validation and the page's pure helpers (Telegram's
// colour ints as CSS, the username order). Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createChatThemes,
  themeOf,
  themePage,
} from '../src/sources/telegram-chat-themes.js';
import {
  createUsernames,
  usernamesOf,
  validOrder,
} from '../src/sources/telegram-usernames.js';
import {
  cssColour,
  previewOf,
  readableOn,
  settingsFor,
  themeVars,
  whiteTextFill,
} from '../src/web/chat-theme-model.js';
import {
  activeOrder,
  arranged,
  hasExtra,
  linkOf,
  movedActive,
  toggledName,
} from '../src/web/usernames-model.js';
import { named, postRoute } from './helpers/telegram-route.js';

const API = {
  InputChatThemeEmpty: named('InputChatThemeEmpty'),
  InputChatTheme: named('InputChatTheme'),
  account: Object.fromEntries(
    ['GetChatThemes', 'ToggleUsername', 'ReorderUsernames'].map((n) => [
      n,
      named(`account.${n}`),
    ])
  ),
  messages: { SetChatTheme: named('messages.SetChatTheme') },
  channels: Object.fromEntries(
    ['ToggleUsername', 'ReorderUsernames'].map((n) => [
      n,
      named(`channels.${n}`),
    ])
  ),
};

const makeEnv = (answers) => {
  const log = [];
  const env = {
    queue: { run: async (_k, _p, fn) => fn() },
    importer: async () => ({ Api: API, helpers: { returnBigInt: BigInt } }),
    connection: {
      withPeer: async (_client, chat, fn) => fn({ peerOf: chat }),
    },
  };
  const userClient = async () => ({
    invoke: async (request) => {
      log.push(request);
      const answer = answers[request.className];
      if (answer instanceof Error) {
        throw answer;
      }
      return typeof answer === 'function' ? answer(request) : (answer ?? true);
    },
  });
  return { env, userClient, log };
};

const settings = (base, accent, extra = {}) => ({
  className: 'ThemeSettings',
  baseTheme: { className: base },
  accentColor: accent,
  ...extra,
});
const theme = (emoticon, list) => ({
  className: 'Theme',
  emoticon,
  title: `T ${emoticon}`,
  settings: list,
});
const LIST = {
  className: 'account.Themes',
  hash: 99n,
  themes: [
    theme('A', [
      settings('BaseThemeDay', 0xff8800, { outboxAccentColor: 0x112233 }),
      settings('BaseThemeNight', 0x00aaff, {
        messageColors: [0x334455, 0x556677],
      }),
    ]),
    theme('B', [settings('BaseThemeClassic', 0xcc2266)]),
    { className: 'Theme', title: 'no emoticon', settings: [] },
  ],
};

test('themePage: light and dark colours by the base theme, none without an emoticon', () => {
  const page = themePage(LIST.themes[0]);
  assert.equal(page.emoticon, 'A');
  assert.deepEqual(page.light, {
    base: 'day',
    accent: 0xff8800,
    outgoing: 0x112233,
    messages: [],
  });
  assert.equal(page.dark.base, 'night');
  assert.deepEqual(page.dark.messages, [0x334455, 0x556677]);
  const lone = themePage(LIST.themes[1]);
  assert.equal(lone.light.accent, 0xcc2266);
  assert.equal(lone.dark, null);
  assert.equal(themePage(LIST.themes[2]), null);
  assert.equal(themePage(null), null);
});

test('themeOf: the emoticon of a user full info theme', () => {
  assert.equal(
    themeOf({ theme: { className: 'ChatTheme', emoticon: 'A' } }),
    'A'
  );
  assert.equal(themeOf({ theme: { className: 'ChatThemeUniqueGift' } }), '');
  assert.equal(themeOf({}), '');
});

test('chatThemes: listed, kept, asked again with the hash it gave', async () => {
  let answer = LIST;
  const { env, userClient, log } = makeEnv({
    'account.GetChatThemes': () => answer,
  });
  const actions = createChatThemes(env, { userClient });
  const first = await actions.chatThemes();
  assert.deepEqual(
    first.themes.map((th) => th.emoticon),
    ['A', 'B']
  );
  assert.equal(log[0].hash, 0n);
  await actions.chatThemes();
  assert.equal(log.length, 1, 'kept');
  answer = { className: 'account.ThemesNotModified' };
  const again = await actions.chatThemes({ fresh: true });
  assert.equal(log[1].hash, 99n);
  assert.deepEqual(again, first);
});

test('setChatTheme: one write for a listed theme, none for ""; others refused', async () => {
  const { env, userClient, log } = makeEnv({
    'account.GetChatThemes': LIST,
    'messages.SetChatTheme': { className: 'Updates' },
  });
  const actions = createChatThemes(env, { userClient });
  assert.equal(
    (await actions.setChatTheme({ chat: '42', emoticon: 'X' })).code,
    'invalid'
  );
  assert.equal(
    (await actions.setChatTheme({ chat: '-100123', emoticon: 'A' })).code,
    'bad-request'
  );
  assert.equal(
    log.filter((r) => r.className === 'messages.SetChatTheme').length,
    0
  );
  assert.deepEqual(await actions.setChatTheme({ chat: '42', emoticon: 'A' }), {
    ok: true,
  });
  const sent = log.find((r) => r.className === 'messages.SetChatTheme');
  assert.deepEqual(sent.peer, { peerOf: '42' });
  assert.equal(sent.theme.className, 'InputChatTheme');
  assert.equal(sent.theme.emoticon, 'A');
  await actions.setChatTheme({ chat: '42', emoticon: '' });
  assert.equal(log.at(-1).theme.className, 'InputChatThemeEmpty');
});

test('setChatTheme: Telegram refusals become codes', async () => {
  const error = Object.assign(new Error('x'), {
    errorMessage: 'THEME_INVALID',
  });
  const { env, userClient } = makeEnv({
    'account.GetChatThemes': LIST,
    'messages.SetChatTheme': error,
  });
  const actions = createChatThemes(env, { userClient });
  const answer = await actions.setChatTheme({ chat: '42', emoticon: 'A' });
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'invalid');
});

test('usernamesOf keeps the fields; validOrder wants distinct names', () => {
  assert.deepEqual(
    usernamesOf([
      { username: 'a', editable: true, active: true },
      { username: '' },
      null,
      { username: 'b' },
    ]),
    [
      { username: 'a', editable: true, active: true },
      { username: 'b', editable: false, active: false },
    ]
  );
  assert.equal(validOrder(['a', 'b']), true);
  assert.equal(validOrder(['a', 'a']), false);
  assert.equal(validOrder([]), false);
  assert.equal(validOrder(['a b']), false);
  assert.equal(validOrder('a'), false);
});

test('toggleUsername and reorderUsernames: the user or a channel, nothing else', async () => {
  const { env, userClient, log } = makeEnv({});
  const actions = createUsernames(env, { userClient });
  assert.deepEqual(
    await actions.toggleUsername({ username: 'gold', active: true }),
    { ok: true }
  );
  assert.equal(log.at(-1).className, 'account.ToggleUsername');
  assert.equal(log.at(-1).active, true);
  await actions.toggleUsername({
    username: 'gold',
    active: false,
    chat: '-100777',
  });
  assert.equal(log.at(-1).className, 'channels.ToggleUsername');
  assert.deepEqual(log.at(-1).channel, { peerOf: '-100777' });
  await actions.reorderUsernames({ order: ['b', 'a'] });
  assert.equal(log.at(-1).className, 'account.ReorderUsernames');
  assert.deepEqual(log.at(-1).order, ['b', 'a']);
  await actions.reorderUsernames({ order: ['b', 'a'], chat: '-100777' });
  assert.equal(log.at(-1).className, 'channels.ReorderUsernames');
  const sent = log.length;
  assert.equal(
    (await actions.toggleUsername({ username: 'x y', active: true })).ok,
    false
  );
  assert.equal(
    (await actions.toggleUsername({ username: 'x', active: true, chat: '42' }))
      .ok,
    false
  );
  assert.equal(
    (await actions.reorderUsernames({ order: ['a', 'a'] })).ok,
    false
  );
  assert.equal(log.length, sent, 'refused before Telegram is asked');
});

test('usernames: Telegram refusals become codes; "not modified" is fine', async () => {
  const fail = (m) => Object.assign(new Error(m), { errorMessage: m });
  const { env, userClient } = makeEnv({
    'account.ToggleUsername': fail('USERNAMES_ACTIVE_TOO_MUCH'),
    'account.ReorderUsernames': fail('USERNAME_NOT_MODIFIED'),
  });
  const actions = createUsernames(env, { userClient });
  assert.equal(
    (await actions.toggleUsername({ username: 'a', active: true })).code,
    'too-many'
  );
  assert.deepEqual(await actions.reorderUsernames({ order: ['a'] }), {
    ok: true,
  });
});

test('routes validate their bodies before the account is asked', async () => {
  const calls = [];
  const account = {
    chatThemes: async (a) => (
      calls.push(['themes', a]),
      { ok: true, themes: [] }
    ),
    setChatTheme: async (a) => (calls.push(['set', a]), { ok: true }),
    toggleUsername: async (a) => (calls.push(['toggle', a]), { ok: true }),
    reorderUsernames: async (a) => (calls.push(['reorder', a]), { ok: true }),
  };
  assert.equal(await postRoute('chat-themes', {}, account), 200);
  assert.equal(await postRoute('chat-themes', { fresh: 'yes' }, account), 400);
  assert.equal(
    await postRoute('chat-theme-set', { chat: '42', emoticon: 'A' }, account),
    200
  );
  assert.equal(
    await postRoute(
      'chat-theme-set',
      { chat: '-100123', emoticon: 'A' },
      account
    ),
    400
  );
  assert.equal(await postRoute('chat-theme-set', { chat: '42' }, account), 400);
  assert.equal(
    await postRoute(
      'username-toggle',
      { username: 'a', active: true },
      account
    ),
    200
  );
  assert.equal(
    await postRoute('username-toggle', { username: 'a', active: 1 }, account),
    400
  );
  assert.equal(
    await postRoute(
      'username-toggle',
      { username: 'a', active: true, chat: '5' },
      account
    ),
    400
  );
  assert.equal(
    await postRoute(
      'usernames-reorder',
      { order: ['a', 'b'], chat: '-100123' },
      account
    ),
    200
  );
  assert.equal(
    await postRoute('usernames-reorder', { order: [] }, account),
    400
  );
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[3], [
    'reorder',
    { order: ['a', 'b'], chat: '-100123' },
  ]);
});

test('cssColour: Telegram ints as #rrggbb, signed or with alpha', () => {
  assert.equal(cssColour(0xff8800), '#ff8800');
  assert.equal(cssColour(0x0000ff), '#0000ff');
  assert.equal(cssColour(0), '#000000');
  assert.equal(cssColour(-1), '#ffffff');
  assert.equal(cssColour(-16744448), '#008000');
  assert.equal(cssColour(0xff112233), '#112233');
});

test('readableOn: dark text on light colours, white on dark', () => {
  assert.equal(readableOn(0xffffff), '#101418');
  assert.equal(readableOn(0x000000), '#ffffff');
  assert.equal(readableOn(0x2b5278), '#ffffff');
  assert.equal(readableOn(0xeffdde), '#101418');
});

test('themeVars: accent and outgoing bubble for the mode, the other when missing', () => {
  const page = themePage(LIST.themes[0]);
  assert.deepEqual(themeVars(page, false), {
    '--chat-accent': '#ff8800',
    '--chat-accent-fill': whiteTextFill(0xff8800),
    '--bubble-out': '#112233',
    '--bubble-out-text': '#ffffff',
  });
  assert.deepEqual(themeVars(page, true), {
    '--chat-accent': '#00aaff',
    '--chat-accent-fill': whiteTextFill(0x00aaff),
    '--bubble-out': '#334455',
    '--bubble-out-text': '#ffffff',
  });
  const lone = themePage(LIST.themes[1]);
  assert.equal(settingsFor(lone, true), lone.light);
  assert.deepEqual(themeVars(lone, true), {
    '--chat-accent': '#cc2266',
    '--chat-accent-fill': '#cc2266',
  });
  assert.deepEqual(themeVars({ light: null, dark: null }, false), {});
  assert.deepEqual(themeVars(null, false), {});
});

test('bright theme fills retain readable white labels while accent text keeps its colour', () => {
  for (const accent of [
    0xffffff, 0xffff00, 0x00ff00, 0x00ffff, 0xff8800, 0x00aaff, 0xff00ff,
    0x000000,
  ]) {
    const theme = { dark: { accent } };
    const vars = themeVars(theme, true);
    assert.equal(vars['--chat-accent'], cssColour(accent));
    const rgb = vars['--chat-accent-fill']
      .slice(1)
      .match(/../g)
      .map((c) => Number.parseInt(c, 16) / 255);
    const linear = rgb.map((c) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    );
    const l = linear.reduce(
      (sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i],
      0
    );
    assert.ok(
      1.05 / (l + 0.05) >= 4.5,
      `${cssColour(accent)}: readable filled label`
    );
  }
  assert.equal(readableOn(0xff8800), '#101418');
});

test('previewOf: accent, bubble and text, or null', () => {
  assert.deepEqual(previewOf(themePage(LIST.themes[0]), false), {
    accent: '#ff8800',
    bubble: '#112233',
    text: '#ffffff',
  });
  assert.deepEqual(previewOf(themePage(LIST.themes[1]), false), {
    accent: '#cc2266',
    bubble: '#cc2266',
    text: '#ffffff',
  });
  assert.equal(previewOf(null, false), null);
});

const U = (username, active, editable = false) => ({
  username,
  active,
  editable,
});

test('usernames model: active first, moves among the active, toggles', () => {
  const list = [U('me', true, true), U('x', false), U('a', true), U('b', true)];
  assert.deepEqual(
    arranged(list).map((u) => u.username),
    ['me', 'a', 'b', 'x']
  );
  assert.deepEqual(activeOrder(list), ['me', 'a', 'b']);
  assert.deepEqual(
    movedActive(list, 2, 0).map((u) => u.username),
    ['b', 'me', 'a', 'x']
  );
  assert.deepEqual(
    movedActive(list, 1, 99).map((u) => u.username),
    ['me', 'b', 'a', 'x'],
    'clamped to the active ones'
  );
  assert.deepEqual(
    movedActive(list, 3, 0).map((u) => u.username),
    ['me', 'a', 'b', 'x'],
    'an inactive one does not move'
  );
  assert.deepEqual(
    toggledName(list, 'x', true).map((u) => [u.username, u.active]),
    [
      ['me', true],
      ['a', true],
      ['b', true],
      ['x', true],
    ]
  );
  assert.deepEqual(
    toggledName(list, 'me', false).map((u) => u.username),
    ['a', 'b', 'x', 'me']
  );
});

test('usernames model: links and when the editor is worth showing', () => {
  assert.equal(linkOf('gold'), 'https://t.me/gold');
  assert.equal(hasExtra([U('me', true, true)]), false);
  assert.equal(hasExtra([U('me', true, true), U('x', false)]), true);
  assert.equal(hasExtra(undefined), false);
});
