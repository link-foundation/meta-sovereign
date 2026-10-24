// Issue #31 / PR #34: when the API cannot send, the message goes out
// through the official web UI (vk.com, web.telegram.org,
// web.whatsapp.com) driven by browser-commander. Everything here runs
// against a fake session that records commander calls — no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BrowserLoginRequiredError,
  NO_FALLBACK_CODES,
  SendFallbackError,
  WEB_UIS,
  createBrowserSender,
  createDefaultSender,
  createFallbackSender,
  extractMessages,
} from '../src/sources/browser-sender.js';
import { SafeModeError } from '../src/crm/reengage.js';

const clock = () => new Date('2026-10-11T12:00:00.000Z');

/**
 * A commander whose page "contains" every selector in `present` (or
 * whatever `present(selector)` says), recording each call in order.
 */
const fakeCommander = ({ present = [], rows = [], calls = [] } = {}) => {
  const has =
    typeof present === 'function' ? present : (s) => present.includes(s);
  return {
    calls,
    async goto({ url }) {
      calls.push(['goto', url]);
    },
    async count({ selector }) {
      return has(selector) ? 1 : 0;
    },
    async clickButton({ selector }) {
      calls.push(['click', selector]);
      return true;
    },
    async typeText({ text }) {
      calls.push(['type', text]);
    },
    async pressKey({ key }) {
      calls.push(['press', key]);
    },
    async fillTextArea({ selector, text }) {
      calls.push(['fill', selector, text]);
      return { filled: true };
    },
    async evaluate({ fn, args }) {
      calls.push(['evaluate', args[0].item, args[0].limit]);
      return typeof rows === 'function' ? rows(fn, args) : rows;
    },
  };
};

/** Session factory that counts opens/closes per network. */
const fakeSessions = (commanderFor) => {
  const opened = [];
  const closed = [];
  const openSession = async ({ source }) => {
    opened.push(source);
    return {
      commander: commanderFor(source),
      close: async () => closed.push(source),
    };
  };
  return { opened, closed, openSession };
};

const first = (selector) => selector.split(',')[0].trim();

/** Logged in, composer and send button present, for a network. */
const signedIn = (source) => {
  const ui = WEB_UIS[source];
  return [first(ui.loggedIn), first(ui.composer), first(ui.send.selector)];
};

const quick = { loginTimeoutMs: 0, pollMs: 0, clock };

test('WEB_UIS covers vk, telegram and whatsapp with every field', () => {
  for (const id of ['vk', 'telegram', 'whatsapp']) {
    const ui = WEB_UIS[id];
    assert.equal(ui.id, id);
    assert.equal(typeof ui.chatUrl, 'function');
    for (const field of ['loggedIn', 'composer', 'loginUrl']) {
      assert.equal(typeof ui[field], 'string', `${id}.${field}`);
    }
    assert.ok(ui.send.key || ui.send.selector, `${id}.send`);
    assert.equal(typeof ui.messages.item, 'string', `${id}.messages.item`);
  }
});

test('VK chat URLs: user ids, group chats and screen names', () => {
  assert.equal(WEB_UIS.vk.chatUrl(12345), 'https://vk.com/im?sel=12345');
  assert.equal(WEB_UIS.vk.chatUrl(-77), 'https://vk.com/im?sel=-77');
  assert.equal(WEB_UIS.vk.chatUrl('2000000042'), 'https://vk.com/im?sel=c42');
  assert.equal(WEB_UIS.vk.chatUrl('@durov'), 'https://vk.com/im?sel=durov');
});

test('Telegram chat URLs: @username vs numeric id', () => {
  const url = WEB_UIS.telegram.chatUrl;
  assert.equal(url('@durov'), 'https://web.telegram.org/k/#@durov');
  assert.equal(url('durov'), 'https://web.telegram.org/k/#@durov');
  assert.equal(url(777000), 'https://web.telegram.org/k/#777000');
  assert.equal(
    url('-1001234567890'),
    'https://web.telegram.org/k/#-1001234567890'
  );
});

test('WhatsApp chat URLs keep digits only and pre-fill the text', () => {
  const url = WEB_UIS.whatsapp.chatUrl;
  assert.equal(
    url('+7 (912) 345-67-89'),
    'https://web.whatsapp.com/send?phone=79123456789'
  );
  assert.equal(
    url('79123456789', { text: 'Привет & hi?' }),
    `https://web.whatsapp.com/send?phone=79123456789&text=${encodeURIComponent('Привет & hi?')}`
  );
  assert.equal(WEB_UIS.whatsapp.target({ chat: 'c1', to: '7912' }), '7912');
});

test('send types into the composer, then sends, in that order', async () => {
  const commander = fakeCommander({ present: signedIn('vk') });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick });
  const result = await sender.send({
    source: 'vk',
    chat: 2000000001,
    text: 'Hi\n\nthere',
  });
  assert.deepEqual(result, {
    via: 'browser',
    source: 'vk',
    chat: '2000000001',
    sentAt: '2026-10-11T12:00:00.000Z',
  });
  assert.deepEqual(commander.calls, [
    ['goto', 'https://vk.com/im?sel=c1'],
    ['click', first(WEB_UIS.vk.composer)],
    ['type', 'Hi'],
    ['press', 'Shift+Enter'],
    ['press', 'Shift+Enter'],
    ['type', 'there'],
    ['click', first(WEB_UIS.vk.send.selector)],
  ]);
});

test('typingDelayMs types character by character', async () => {
  const commander = fakeCommander({ present: signedIn('telegram') });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({
    openSession,
    ...quick,
    typingDelayMs: 1,
  });
  await sender.send({ source: 'telegram', chat: '@anna', text: 'Yo!' });
  const typed = commander.calls.filter(([kind]) => kind === 'type');
  assert.deepEqual(typed, [
    ['type', 'Y'],
    ['type', 'o'],
    ['type', '!'],
  ]);
});

test('send presses Enter when no send button is found', async () => {
  const ui = WEB_UIS.telegram;
  const commander = fakeCommander({
    present: [first(ui.loggedIn), first(ui.composer)],
  });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick });
  await sender.send({ source: 'telegram', chat: 42, text: 'hello' });
  assert.deepEqual(commander.calls.at(-1), ['press', 'Enter']);
});

// R-Z4: a press that fails may have sent the message (the click landed,
// the answer was lost); it is "unknown", never retried or sent again.
test('a failure while pressing Send is reported as maybe delivered', async () => {
  const commander = fakeCommander({ present: signedIn('vk') });
  commander.clickButton = async ({ selector }) => {
    commander.calls.push(['click', selector]);
    if (selector === first(WEB_UIS.vk.send.selector)) {
      throw new Error('Target closed');
    }
    return true;
  };
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick });
  await assert.rejects(sender.send({ source: 'vk', chat: 1, text: 'hi' }), {
    code: 'send-unknown',
    outcome: 'unknown',
    ambiguous: true,
    fallback: false,
  });
});

test('fallback: a web UI that may have sent is not "both failed"', async () => {
  const maybe = Object.assign(new Error('Target closed'), {
    ambiguous: true,
    code: 'send-unknown',
  });
  const send = createFallbackSender({
    apiSend: async () => {
      throw new Error('token expired');
    },
    browserSend: async () => {
      throw maybe;
    },
  });
  await assert.rejects(send(draft), (error) => {
    assert.equal(error, maybe);
    assert.equal(error.code, 'send-unknown');
    assert.equal(error.outcome, 'unknown');
    return true;
  });
});

test('input "fill" fills the composer instead of typing', async () => {
  const commander = fakeCommander({ present: signedIn('vk') });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick, input: 'fill' });
  await sender.send({ source: 'vk', chat: 1, text: 'hello' });
  assert.deepEqual(commander.calls[2], [
    'fill',
    first(WEB_UIS.vk.composer),
    'hello',
  ]);
});

test('WhatsApp relies on the pre-filled composer and only sends', async () => {
  const commander = fakeCommander({ present: signedIn('whatsapp') });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick });
  const result = await sender.send({
    source: 'whatsapp',
    chat: 'chat-1',
    to: '+1 555 0100',
    text: 'hi',
  });
  assert.equal(result.chat, '+1 555 0100');
  assert.deepEqual(commander.calls, [
    ['goto', 'https://web.whatsapp.com/send?phone=15550100&text=hi'],
    ['click', first(WEB_UIS.whatsapp.composer)],
    ['click', first(WEB_UIS.whatsapp.send.selector)],
  ]);
});

test('a signed-out web UI raises a login-required error', async () => {
  const ui = WEB_UIS.telegram;
  const commander = fakeCommander({ present: [first(ui.loggedOut)] });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({
    openSession,
    loginTimeoutMs: 60000,
    pollMs: 0,
  });
  await assert.rejects(
    sender.send({ source: 'telegram', chat: '@anna', text: 'hi' }),
    (error) => {
      assert.ok(error instanceof BrowserLoginRequiredError);
      assert.equal(error.code, 'login-required');
      assert.equal(error.source, 'telegram');
      assert.equal(error.loginUrl, ui.loginUrl);
      assert.match(error.message, /log in once/);
      assert.match(error.profileDir, /browser-profiles/);
      return true;
    }
  );
  assert.equal(
    commander.calls.some(([kind]) => kind === 'type'),
    false,
    'nothing is typed while signed out'
  );
});

test('the login check times out to the same error', async () => {
  const commander = fakeCommander({ present: [] });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick });
  await assert.rejects(
    sender.send({ source: 'vk', chat: 1, text: 'hi' }),
    BrowserLoginRequiredError
  );
});

test('missing composer, text, target or network fail clearly', async () => {
  const commander = fakeCommander({
    present: [first(WEB_UIS.vk.loggedIn)],
  });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick });
  await assert.rejects(sender.send({ source: 'vk', chat: 1, text: 'hi' }), {
    code: 'composer-missing',
  });
  await assert.rejects(sender.send({ source: 'vk', chat: 1, text: '  ' }), {
    code: 'bad-draft',
  });
  await assert.rejects(sender.send({ source: 'vk', text: 'hi' }), {
    code: 'bad-draft',
  });
  await assert.rejects(sender.send({ source: 'icq', chat: 1, text: 'hi' }), {
    code: 'unsupported-source',
  });
});

test('setTyping focuses the composer, types and erases', async () => {
  const commander = fakeCommander({ present: signedIn('vk') });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick });
  const result = await sender.setTyping({ source: 'vk', chat: 5 });
  assert.deepEqual(result, { via: 'browser', source: 'vk', typing: true });
  assert.deepEqual(commander.calls, [
    ['goto', 'https://vk.com/im?sel=5'],
    ['click', first(WEB_UIS.vk.composer)],
    ['type', '.'],
    ['press', 'Backspace'],
  ]);
});

test('readRecent maps visible messages to message links', async () => {
  const commander = fakeCommander({
    present: signedIn('telegram'),
    rows: [
      {
        id: '501',
        sender: 'Anna',
        body: 'Привет!',
        time: null,
        timestamp: '1760000000',
        outgoing: false,
      },
      {
        id: null,
        sender: '',
        body: 'Hi Anna',
        time: '2026-10-11T10:00:00Z',
        timestamp: null,
        outgoing: true,
      },
      { id: '503', sender: 'Anna', body: '', outgoing: false },
    ],
  });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick });
  const links = await sender.readRecent({
    source: 'telegram',
    chat: -100500,
    limit: 5,
  });
  assert.deepEqual(commander.calls.at(-1), [
    'evaluate',
    WEB_UIS.telegram.messages.item,
    5,
  ]);
  assert.equal(links.length, 2, 'empty bodies are dropped');
  assert.deepEqual(links[0], {
    id: 'msg:telegram:-100500:501',
    tokens: ['message', 'telegram', '-100500'],
    source: 'telegram',
    chat: '-100500',
    sender: 'Anna',
    body: 'Привет!',
    timestamp: new Date(1760000000 * 1000).toISOString(),
    outgoing: false,
    via: 'browser',
  });
  assert.match(links[1].id, /^msg:telegram:-100500:[0-9a-f]{12}$/);
  assert.equal(links[1].sender, 'me');
  assert.equal(links[1].timestamp, '2026-10-11T10:00:00.000Z');
});

test('readRecent parses WhatsApp data-pre-plain-text', async () => {
  const commander = fakeCommander({
    present: signedIn('whatsapp'),
    rows: [
      {
        id: 'false_123@c.us_ABC',
        sender: '[10:15, 2026-10-11] Anna Petrova:',
        body: 'ok',
        time: '[10:15, 2026-10-11] Anna Petrova:',
        timestamp: null,
        outgoing: false,
      },
    ],
  });
  const { openSession } = fakeSessions(() => commander);
  const sender = createBrowserSender({ openSession, ...quick });
  const [link] = await sender.readRecent({
    source: 'whatsapp',
    to: '4915123456',
  });
  assert.equal(link.id, 'msg:whatsapp:+4915123456:false_123@c.us_ABC');
  assert.equal(link.sender, 'Anna Petrova');
  assert.equal(link.chat, '+4915123456');
});

test('extractMessages reads the page through the descriptor', () => {
  const node = ({ attrs = {}, fields = {}, classes = [] }) => ({
    getAttribute: (name) => attrs[name] ?? null,
    querySelector: (selector) =>
      fields[selector] === undefined
        ? null
        : {
            textContent: fields[selector].text ?? '',
            getAttribute: (name) => fields[selector].attrs?.[name] ?? null,
          },
    matches: (selector) => classes.includes(selector),
  });
  const items = [
    node({ attrs: { 'data-mid': '1' }, fields: { '.m': { text: 'old' } } }),
    node({
      attrs: { 'data-mid': '2', 'data-timestamp': '1760000000' },
      fields: {
        '.m': { text: '  line one\nline two  ' },
        '.who': { text: ' Anna\n Petrova ' },
        '.t': { text: '10:00', attrs: { title: '11 Oct 2026 10:00' } },
      },
      classes: ['.out'],
    }),
  ];
  const previous = globalThis.document;
  globalThis.document = {
    querySelectorAll: (selector) => (selector === '.bubble' ? items : []),
  };
  try {
    const rows = extractMessages({
      item: '.bubble',
      idAttribute: 'data-mid',
      sender: '.who',
      body: '.m',
      time: '.t',
      timeAttribute: 'title',
      timestampAttribute: 'data-timestamp',
      outgoing: '.out',
      limit: 1,
    });
    assert.deepEqual(rows, [
      {
        id: '2',
        sender: 'Anna Petrova',
        body: 'line one\nline two',
        time: '11 Oct 2026 10:00',
        timestamp: '1760000000',
        outgoing: true,
      },
    ]);
  } finally {
    globalThis.document = previous;
  }
});

test('sessions open lazily, once per network, and close()', async () => {
  const commanders = {};
  const sessions = fakeSessions((source) => {
    commanders[source] = fakeCommander({
      present: [...signedIn('vk'), ...signedIn('telegram')],
    });
    return commanders[source];
  });
  const sender = createBrowserSender({
    openSession: sessions.openSession,
    ...quick,
  });
  assert.deepEqual(sessions.opened, [], 'nothing opens up front');
  await Promise.all([
    sender.send({ source: 'vk', chat: 1, text: 'a' }),
    sender.send({ source: 'vk', chat: 1, text: 'b' }),
  ]);
  await sender.readRecent({ source: 'vk', chat: 1 });
  await sender.send({ source: 'telegram', chat: '@x', text: 'c' });
  assert.deepEqual(sessions.opened, ['vk', 'telegram']);
  assert.deepEqual(sender.openSources(), ['vk', 'telegram']);
  const gotos = commanders.vk.calls.filter(([kind]) => kind === 'goto');
  assert.equal(gotos.length, 1, 'the open chat is not reloaded');
  await sender.close();
  assert.deepEqual(sessions.closed.sort(), ['telegram', 'vk']);
  assert.deepEqual(sender.openSources(), []);
  await sender.send({ source: 'vk', chat: 1, text: 'again' });
  assert.deepEqual(sessions.opened, ['vk', 'telegram', 'vk']);
});

test('a session that fails to open is retried next time', async () => {
  let attempts = 0;
  const commander = fakeCommander({ present: signedIn('vk') });
  const sender = createBrowserSender({
    ...quick,
    openSession: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('no browser'), {
          code: 'browser-unavailable',
        });
      }
      return { commander, close: async () => {} };
    },
  });
  await assert.rejects(sender.send({ source: 'vk', chat: 1, text: 'a' }), {
    code: 'browser-unavailable',
  });
  const result = await sender.send({ source: 'vk', chat: 1, text: 'a' });
  assert.equal(result.via, 'browser');
  assert.equal(attempts, 2);
});

const draft = { source: 'vk', chat: '1', contact: '1', text: 'hi' };

test('fallback: API success never touches the browser', async () => {
  let browserCalls = 0;
  const send = createFallbackSender({
    apiSend: async () => ({ ok: true, messageId: '9' }),
    browserSend: async () => {
      browserCalls += 1;
    },
  });
  assert.deepEqual(await send(draft), {
    ok: true,
    messageId: '9',
    via: 'api',
  });
  assert.equal(browserCalls, 0);
  const scalar = createFallbackSender({ apiSend: async () => 12345 });
  assert.deepEqual(await scalar(draft), { result: 12345, via: 'api' });
});

test('fallback: API failure goes through the browser', async () => {
  const order = [];
  const logs = [];
  const send = createFallbackSender({
    apiSend: async () => {
      order.push('api');
      throw new Error('token expired');
    },
    browserSend: async (d) => {
      order.push('browser');
      return { via: 'browser', source: d.source, chat: d.chat };
    },
    log: (line) => logs.push(line),
  });
  const result = await send(draft);
  assert.deepEqual(order, ['api', 'browser']);
  assert.deepEqual(result, {
    via: 'browser',
    source: 'vk',
    chat: '1',
    apiError: 'token expired',
  });
  assert.match(logs[0], /token expired/);
});

test('fallback: no API sender goes straight to the browser', async () => {
  const send = createFallbackSender({
    browserSend: async () => ({ chat: '1' }),
  });
  assert.deepEqual(await send(draft), { chat: '1', via: 'browser' });
  await assert.rejects(createFallbackSender({})(draft), { code: 'no-sender' });
});

test('fallback: both failing raises an error with both causes', async () => {
  const apiError = new Error('api down');
  const browserError = new BrowserLoginRequiredError({
    source: 'vk',
    loginUrl: 'https://vk.com/',
    profileDir: '/tmp/p',
  });
  const send = createFallbackSender({
    apiSend: async () => {
      throw apiError;
    },
    browserSend: async () => {
      throw browserError;
    },
  });
  await assert.rejects(send(draft), (error) => {
    assert.ok(error instanceof SendFallbackError);
    assert.ok(error instanceof AggregateError);
    assert.equal(error.code, 'send-failed');
    assert.deepEqual(error.causes, [apiError, browserError]);
    assert.deepEqual(error.errors, [apiError, browserError]);
    assert.match(error.message, /api down/);
    assert.match(error.message, /log in once/);
    return true;
  });
});

test('fallback: safe-mode and bad-draft errors are not retried', async () => {
  assert.deepEqual(
    [...NO_FALLBACK_CODES],
    ['safe-mode', 'bad-draft', 'unknown-delivery']
  );
  for (const error of [
    new SafeModeError('one at a time'),
    Object.assign(new Error('empty'), { code: 'bad-draft' }),
  ]) {
    let browserCalls = 0;
    const send = createFallbackSender({
      apiSend: async () => {
        throw error;
      },
      browserSend: async () => {
        browserCalls += 1;
      },
    });
    await assert.rejects(send(draft), (thrown) => thrown === error);
    assert.equal(browserCalls, 0, error.code);
  }
});

test('fallback: shouldFallback can veto the browser', async () => {
  const send = createFallbackSender({
    apiSend: async () => {
      throw new Error('rate limited');
    },
    browserSend: async () => ({}),
    shouldFallback: () => false,
  });
  await assert.rejects(send(draft), /rate limited/);
});

test('createDefaultSender: adapter first, browser on failure', async () => {
  const posted = [];
  const browserDrafts = [];
  const browser = {
    send: async (content) => {
      browserDrafts.push(content);
      return { via: 'browser', source: content.source, chat: content.chat };
    },
    close: async () => browserDrafts.push('closed'),
  };
  const sources = {
    telegram: {
      live: {
        post: async (content, options) => {
          posted.push([content, options]);
          return { ok: true, messageId: '7' };
        },
      },
    },
    vk: {
      live: {
        post: async () => {
          throw new Error('vk: community token cannot write to a user');
        },
      },
    },
  };
  const send = createDefaultSender({
    getSource: (id) => sources[id],
    options: { telegram: { token: 't' } },
    browser,
  });
  const viaApi = await send({
    source: 'telegram',
    chat: '42',
    contact: 'anna',
    text: 'hi',
  });
  assert.equal(viaApi.via, 'api');
  assert.deepEqual(posted, [
    [{ chat: '42', to: 'anna', text: 'hi' }, { token: 't' }],
  ]);
  const viaBrowser = await send({
    source: 'vk',
    chat: '5',
    contact: 'id5',
    text: 'hey',
  });
  assert.equal(viaBrowser.via, 'browser');
  assert.match(viaBrowser.apiError, /community token/);
  const viaBrowserOnly = await send({
    source: 'whatsapp',
    chat: 'w',
    contact: '+1555',
    text: 'yo',
  });
  assert.equal(viaBrowserOnly.via, 'browser');
  assert.match(viaBrowserOnly.apiError, /cannot send from here/);
  assert.deepEqual(browserDrafts, [
    { source: 'vk', chat: '5', to: 'id5', text: 'hey' },
    { source: 'whatsapp', chat: 'w', to: '+1555', text: 'yo' },
  ]);
  await send.close();
  assert.equal(browserDrafts.at(-1), 'closed');
});

test('createDefaultSender builds a browser sender lazily from options', async () => {
  const commander = fakeCommander({ present: signedIn('vk') });
  const sessions = fakeSessions(() => commander);
  const send = createDefaultSender({
    browser: { openSession: sessions.openSession, ...quick },
  });
  assert.deepEqual(sessions.opened, []);
  const result = await send({ source: 'vk', chat: '3', text: 'hello' });
  assert.equal(result.via, 'browser');
  assert.equal(result.sentAt, '2026-10-11T12:00:00.000Z');
  await send.close();
  assert.deepEqual(sessions.closed, ['vk']);
});
