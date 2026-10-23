// R-Y38: every message action — edit, delete, react, mark read,
// forward — goes through the network's API first and its own web app
// second. Everything here runs against fakes: a recording commander, a
// fake adapter and an in-memory store. No browser, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { WEB_UIS } from '../src/sources/web-uis.js';
import {
  TARGET_ATTRIBUTE,
  createBrowserActions,
  extractChats,
  markMessage,
} from '../src/sources/browser-actions.js';
import {
  MESSAGE_ACTIONS,
  createMessageActions,
} from '../src/sources/message-actions.js';
import {
  liveOptionsFrom,
  pullBrowserInto,
  pullLiveInto,
} from '../src/sources/index.js';
import {
  externalIdOf,
  handleMessageRoutes,
} from '../src/server/routes-messages.js';
import { launchWithCommander } from '../src/cv/browser.js';

const clock = () => new Date('2026-10-19T12:00:00.000Z');

test('every web app entry describes sign-in, sending, reading and actions', () => {
  for (const [id, ui] of Object.entries(WEB_UIS)) {
    assert.equal(ui.id, id);
    for (const field of ['name', 'loginUrl', 'loggedIn', 'loggedOut']) {
      assert.ok(ui[field], `${id}.${field}`);
    }
    assert.equal(typeof ui.chatUrl, 'function', `${id}.chatUrl`);
    assert.equal(typeof ui.target, 'function', `${id}.target`);
    assert.ok(ui.composer && ui.send, `${id} composer/send`);
    assert.ok(ui.messages?.item && ui.messages?.body, `${id}.messages`);
    assert.ok(ui.chats?.item, `${id}.chats`);
    assert.ok(ui.actions?.menu && ui.actions?.delete, `${id}.actions`);
    assert.match(
      ui.chatUrl(ui.target({ chat: '1234567' }), { text: '' }),
      /^https:\/\//
    );
  }
  assert.ok(Object.isFrozen(WEB_UIS));
});

test('chat URLs take the bare id of a thread', () => {
  assert.equal(WEB_UIS.x.chatUrl('room:12'), 'https://x.com/messages/12');
  assert.equal(
    WEB_UIS.linkedin.chatUrl('room:abc'),
    'https://www.linkedin.com/messaging/thread/abc/'
  );
  assert.equal(
    WEB_UIS.facebook.chatUrl('12'),
    'https://www.facebook.com/messages/t/12'
  );
  assert.equal(
    WEB_UIS.telegram.chatUrl('-100123'),
    'https://web.telegram.org/k/#-100123'
  );
  assert.equal(
    WEB_UIS.telegram.chatUrl('durov'),
    'https://web.telegram.org/k/#@durov'
  );
  assert.equal(WEB_UIS.vk.chatUrl('2000000005'), 'https://vk.com/im?sel=c5');
});

// A page with message rows; querySelectorAll answers by selector.
const withDocument = (rowsBySelector, fn) => {
  const previous = globalThis.document;
  globalThis.document = {
    querySelectorAll: (selector) => rowsBySelector[selector] ?? [],
  };
  try {
    return fn();
  } finally {
    globalThis.document = previous;
  }
};

const element = (attrs = {}, children = {}) => {
  const own = { ...attrs };
  return {
    own,
    getAttribute: (name) => own[name] ?? null,
    setAttribute: (name, value) => {
      own[name] = value;
    },
    removeAttribute: (name) => {
      delete own[name];
    },
    scrollIntoView: () => {},
    matches: () => false,
    querySelector: (selector) => children[selector] ?? null,
  };
};

test('markMessage marks only the message with the id, by pattern too', () => {
  const rows = [
    element({ 'data-id': 'true_7900@c.us_AAA' }),
    element({ 'data-id': 'false_7900@c.us_BBB' }),
  ];
  const spec = {
    item: '.row',
    idAttribute: 'data-id',
    idPattern: '_([^_]+)$',
    targetAttribute: TARGET_ATTRIBUTE,
  };
  withDocument({ '.row': rows, [`[${TARGET_ATTRIBUTE}]`]: [rows[0]] }, () => {
    rows[0].setAttribute(TARGET_ATTRIBUTE, '1');
    assert.equal(markMessage({ ...spec, id: 'BBB' }), true);
    assert.equal(markMessage({ ...spec, id: 'nope' }), false);
  });
  assert.equal(rows[0].own[TARGET_ATTRIBUTE], undefined);
  assert.equal(rows[1].own[TARGET_ATTRIBUTE], '1');
});

test('extractChats reads ids from attributes or links, and unread counts', () => {
  const text = (value) => ({ textContent: value, getAttribute: () => null });
  const rows = [
    element(
      { 'data-peer-id': '42' },
      { '.t': text(' Anna '), '.u': text('3') }
    ),
    element(
      {},
      {
        a: { getAttribute: () => '/messages/t/777' },
        '.t': text('Bob'),
        '.p': text(' hi  there '),
      }
    ),
    element({}, { '.t': text('Only a title') }),
  ];
  const chats = withDocument({ '.chat': rows }, () =>
    extractChats({
      item: '.chat',
      idAttribute: 'data-peer-id',
      link: 'a',
      linkPattern: '/t/([^/]+)',
      title: '.t',
      preview: '.p',
      unread: '.u',
      limit: 10,
    })
  );
  assert.deepEqual(
    chats.map((c) => [c.chat, c.title, c.preview, c.unread]),
    [
      ['42', 'Anna', null, 3],
      ['777', 'Bob', 'hi there', 0],
      ['title:Only a title', 'Only a title', null, 0],
    ]
  );
});

// The sender's helpers, recording what the actions do.
const fakeBrowserDeps = ({ present = () => true, found = true } = {}) => {
  const calls = [];
  const commander = {
    async clickButton({ selector }) {
      calls.push(['click', selector]);
    },
    async pressKey({ key }) {
      calls.push(['press', key]);
    },
    async evaluate({ fn, args }) {
      calls.push(['evaluate', fn.name, args[0]?.id ?? args[0]]);
      if (fn === markMessage) {
        return found;
      }
      return fn.name === 'extractChats' ? [{ chat: '1', title: 'A' }] : 3;
    },
  };
  const page = {
    async click(selector, options) {
      calls.push(['page.click', selector, options?.button]);
    },
    async hover(selector) {
      calls.push(['hover', selector]);
    },
    async dblclick(selector) {
      calls.push(['dblclick', selector]);
    },
  };
  const deps = {
    uiFor: (source) => WEB_UIS[source],
    inChat: async (source, chat, fn) => {
      calls.push(['open', source, chat]);
      return fn(commander, page);
    },
    inList: async (source, fn) => {
      calls.push(['list', source]);
      return fn(commander, page);
    },
    waitFor: async (c, selector) => (present(selector) ? selector : null),
    firstMatch: async (c, selector) => (present(selector) ? selector : null),
    focusComposer: async (source, ui) => ui.composer,
    typeLines: async (c, text) => calls.push(['type', text]),
    pressSend: async () => calls.push(['send']),
  };
  return {
    calls,
    actions: createBrowserActions({ ...deps, settleMs: 0, clock }),
  };
};

test('browser edit finds the message, opens its menu and retypes it', async () => {
  const { calls, actions } = fakeBrowserDeps();
  const result = await actions.editMessage({
    source: 'telegram',
    chat: '42',
    id: '7',
    text: 'fixed',
  });
  assert.deepEqual(result, {
    via: 'browser',
    source: 'telegram',
    chat: '42',
    at: '2026-10-19T12:00:00.000Z',
    id: '7',
    edited: true,
  });
  const kinds = calls.map((c) => c[0]);
  assert.deepEqual(kinds.slice(0, 3), ['open', 'evaluate', 'page.click']);
  assert.equal(calls[2][2], 'right');
  assert.ok(
    calls.some(
      (c) => c[0] === 'click' && c[1] === WEB_UIS.telegram.actions.edit
    )
  );
  assert.deepEqual(calls.at(-2), ['type', 'fixed']);
  assert.deepEqual(calls.at(-1), ['send']);
});

test('browser edit refuses empty text and unknown actions', async () => {
  const { actions } = fakeBrowserDeps();
  await assert.rejects(
    actions.editMessage({ source: 'telegram', chat: '1', id: '1', text: ' ' }),
    { code: 'bad-draft' }
  );
  await assert.rejects(
    actions.editMessage({ source: 'x', chat: '1', id: '1', text: 'a' }),
    { code: 'unsupported-action' }
  );
});

test('browser delete removes each message, for everyone when asked', async () => {
  const { calls, actions } = fakeBrowserDeps();
  const result = await actions.deleteMessages({
    source: 'vk',
    chat: '5',
    ids: ['1', '2'],
    revoke: true,
  });
  assert.deepEqual(result.deleted, ['1', '2']);
  const clicks = calls.filter((c) => c[0] === 'click').map((c) => c[1]);
  const ui = WEB_UIS.vk.actions;
  assert.equal(clicks.filter((s) => s === ui.delete).length, 2);
  assert.equal(clicks.filter((s) => s === ui.deleteForAll).length, 2);
  assert.equal(clicks.filter((s) => s === ui.deleteConfirm).length, 2);
});

test('a missing message or changed markup fails with a code', async () => {
  const lost = fakeBrowserDeps({ found: false });
  await assert.rejects(
    lost.actions.deleteMessages({ source: 'vk', chat: '5', ids: ['9'] }),
    { code: 'message-not-found' }
  );
  const changed = fakeBrowserDeps({ present: () => false });
  await assert.rejects(
    changed.actions.deleteMessages({ source: 'vk', chat: '5', ids: ['9'] }),
    { code: 'web-ui-changed' }
  );
});

test('browser react picks the emoji, or double-clicks for the quick one', async () => {
  const picked = fakeBrowserDeps();
  await picked.actions.react({
    source: 'whatsapp',
    chat: '1',
    id: 'A',
    emoji: '👍',
  });
  assert.ok(
    picked.calls.some(
      (c) =>
        c[0] === 'click' && c[1] === WEB_UIS.whatsapp.actions.reaction('👍')
    )
  );
  const quick = fakeBrowserDeps({
    present: (s) => !s.includes('🦄'),
  });
  await quick.actions.react({
    source: 'telegram',
    chat: '1',
    id: '2',
    emoji: '🦄',
  });
  assert.ok(quick.calls.some((c) => c[0] === 'dblclick'));
  const none = fakeBrowserDeps({ present: (s) => !s.includes('🦄') });
  await assert.rejects(
    none.actions.react({ source: 'x', chat: '1', id: '2', emoji: '🦄' }),
    { code: 'unsupported-reaction' }
  );
});

test('browser forward searches the target chat and sends', async () => {
  const { calls, actions } = fakeBrowserDeps();
  const result = await actions.forwardMessages({
    source: 'telegram',
    fromChat: '1',
    ids: ['10'],
    toChat: '2',
    toTitle: 'Anna',
  });
  assert.deepEqual(result.forwarded, ['10']);
  assert.equal(result.toChat, '2');
  assert.ok(calls.some((c) => c[0] === 'type' && c[1] === 'Anna'));
});

test('browser read scrolls to the newest; readChats lists the chats', async () => {
  const { calls, actions } = fakeBrowserDeps();
  const read = await actions.markRead({ source: 'whatsapp', chat: '1' });
  assert.equal(read.read, true);
  assert.equal(read.seen, 3);
  const chats = await actions.readChats({ source: 'x', limit: 5 });
  assert.deepEqual(chats, [
    { chat: '1', title: 'A', source: 'x', via: 'browser' },
  ]);
  assert.deepEqual(
    calls.find((c) => c[0] === 'list'),
    ['list', 'x']
  );
});

// An adapter whose `live` has the given methods.
const adapterWith = (methods) => () => ({ live: methods });

test('message actions use the API first, with the saved options', async () => {
  const seen = [];
  const actions = createMessageActions({
    getSource: adapterWith({
      editMessage: async (params, options) => {
        seen.push([params.id, options.token]);
        return { via: 'api', id: params.id };
      },
    }),
    optionsFor: async () => ({ token: 't' }),
    browser: () => {
      throw new Error('the browser must not open');
    },
  });
  const result = await actions.perform('edit', {
    source: 'telegram',
    chat: '1',
    id: '5',
    text: 'x',
  });
  assert.equal(result.via, 'api');
  assert.deepEqual(seen, [['5', 't']]);
});

test('message actions fall back to the web app when the API fails or lacks it', async () => {
  const browserCalls = [];
  const browser = () => ({
    deleteMessages: async (params) => {
      browserCalls.push(params.ids);
      return { via: 'browser' };
    },
    react: async () => ({ via: 'browser' }),
  });
  const actions = createMessageActions({
    getSource: adapterWith({
      deleteMessages: async () => {
        throw Object.assign(new Error('no right'), { code: 'forbidden' });
      },
    }),
    browser,
  });
  const deleted = await actions.perform('delete', {
    source: 'whatsapp',
    chat: '1',
    ids: ['A'],
  });
  assert.equal(deleted.via, 'browser');
  assert.deepEqual(browserCalls, [['A']]);
  const reacted = await actions.perform('react', {
    source: 'whatsapp',
    chat: '1',
    id: 'A',
    emoji: '👍',
  });
  assert.equal(reacted.via, 'browser');
});

test('an action marked fallback: false never reaches the browser', async () => {
  const actions = createMessageActions({
    getSource: adapterWith({
      deleteMessages: async () => {
        throw Object.assign(new Error('maybe done'), { fallback: false });
      },
    }),
    browser: () => ({
      deleteMessages: async () => assert.fail('done twice'),
    }),
  });
  await assert.rejects(
    actions.perform('delete', { source: 'vk', chat: '1', ids: ['1'] }),
    /maybe done/
  );
});

test('supports() says which way each action can go', () => {
  const actions = createMessageActions({
    getSource: (source) =>
      source === 'github' ? { live: { editMessage: () => {} } } : { live: {} },
  });
  assert.deepEqual(
    Object.keys(actions.supports('x')),
    Object.keys(MESSAGE_ACTIONS)
  );
  assert.deepEqual(actions.supports('x').edit, { api: false, browser: false });
  assert.deepEqual(actions.supports('x').delete, { api: false, browser: true });
  assert.deepEqual(actions.supports('github').edit, {
    api: true,
    browser: false,
  });
  assert.deepEqual(actions.supports('github').delete, {
    api: false,
    browser: false,
  });
});

test('no way at all, or an unknown action, is an error with a code', async () => {
  const actions = createMessageActions({ getSource: () => ({ live: {} }) });
  await assert.rejects(actions.perform('edit', { source: 'email' }), {
    code: 'unsupported-action',
  });
  await assert.rejects(actions.perform('pin', { source: 'vk' }), {
    code: 'bad-action',
  });
});

// A store of links in memory.
const memoryStore = (links = []) => {
  const map = new Map(links.map((l) => [l.id, l]));
  return {
    map,
    get: async (id) => map.get(id) ?? null,
    put: async (link) => {
      map.set(link.id, link);
      return link;
    },
  };
};

test('liveOptionsFrom reads every token name and the saved ids', async () => {
  const store = memoryStore([
    { id: 'secret:whatsapp:access-token', value: 'tok' },
    { id: 'secret:whatsapp:phone-number-id', value: '123' },
    { id: 'secret:linkedin:bearer-token', token: 'b' },
    { id: 'secret:linkedin:author-urn', value: 'urn:li:person:1' },
  ]);
  assert.deepEqual(await liveOptionsFrom(store, 'whatsapp'), {
    token: 'tok',
    phoneNumberId: '123',
  });
  assert.deepEqual(await liveOptionsFrom(store, 'linkedin'), {
    token: 'b',
    author: 'urn:li:person:1',
  });
  assert.deepEqual(await liveOptionsFrom(store, 'vk'), {});
});

// One request through the routes, answered into `res.out`.
const call = async (store, ctx, method, path, body, headers = {}) => {
  const req = Readable.from(
    body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  );
  req.method = method;
  req.headers = {
    host: '127.0.0.1:8787',
    'content-type': 'application/json',
    ...headers,
  };
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead(status) {
      this.status = status;
      this.headersSent = true;
    },
    end(data) {
      this.out = data ? JSON.parse(data) : null;
      this.writableEnded = true;
    },
  };
  const url = new URL(`http://127.0.0.1:8787${path}`);
  const handled = await handleMessageRoutes(
    store,
    req,
    res,
    url.pathname,
    url,
    ctx
  );
  return { handled, status: res.status, body: res.out };
};

const message = (id, extra = {}) => ({
  id: `msg:whatsapp:${id}`,
  source: 'whatsapp',
  chat: '7900',
  sender: '7900',
  body: 'hello',
  ...extra,
});

const routeCtx = (perform) => {
  const performed = [];
  const logged = [];
  return {
    performed,
    logged,
    ctx: {
      log: (entry) => logged.push(entry),
      send: {
        perform: async (action, params) => {
          performed.push([action, params]);
          return perform ? perform(action, params) : { via: 'api' };
        },
        supports: (source) => ({
          edit: { api: source === 'whatsapp', browser: false },
        }),
      },
    },
  };
};

test('the network id of a message is the last part of its link id', () => {
  assert.equal(externalIdOf({ id: 'msg:telegram:42:7' }), '7');
  assert.equal(externalIdOf({ id: 'msg:x:1', messageId: 'abc' }), 'abc');
});

test('POST /api/message/edit edits through the sender and stores the text', async () => {
  const store = memoryStore([message('A')]);
  const { ctx, performed } = routeCtx();
  const out = await call(store, ctx, 'POST', '/api/message/edit', {
    ids: ['msg:whatsapp:A'],
    text: 'new',
  });
  assert.equal(out.status, 200);
  assert.equal(out.body.via, 'api');
  assert.equal(performed[0][0], 'edit');
  assert.equal(performed[0][1].id, 'A');
  assert.equal(performed[0][1].chat, '7900');
  const stored = store.map.get('msg:whatsapp:A');
  assert.equal(stored.body, 'new');
  assert.ok(stored.edited);
});

test('POST /api/message/delete marks the messages deleted', async () => {
  const store = memoryStore([message('A'), message('B')]);
  const { ctx, performed } = routeCtx();
  const out = await call(store, ctx, 'POST', '/api/message/delete', {
    ids: ['msg:whatsapp:A', 'msg:whatsapp:B'],
    revoke: true,
  });
  assert.equal(out.status, 200);
  assert.deepEqual(performed[0][1].ids, ['A', 'B']);
  assert.equal(performed[0][1].revoke, true);
  assert.equal(store.map.get('msg:whatsapp:B').deleted, true);
});

test('POST /api/message/react keeps one reaction of ours', async () => {
  const store = memoryStore([
    message('A', {
      reactions: [
        { emoji: '👍', count: 2, mine: true },
        { emoji: '🔥', count: 1 },
      ],
    }),
  ]);
  const { ctx } = routeCtx();
  await call(store, ctx, 'POST', '/api/message/react', {
    ids: ['msg:whatsapp:A'],
    emoji: '🔥',
  });
  assert.deepEqual(store.map.get('msg:whatsapp:A').reactions, [
    { emoji: '👍', count: 1, mine: false },
    { emoji: '🔥', count: 2, mine: true },
  ]);
  await call(store, ctx, 'POST', '/api/message/react', {
    ids: ['msg:whatsapp:A'],
    emoji: '',
  });
  assert.deepEqual(store.map.get('msg:whatsapp:A').reactions, [
    { emoji: '👍', count: 1, mine: false },
    { emoji: '🔥', count: 1, mine: false },
  ]);
});

test('POST /api/message/read resets the unread count of the chat', async () => {
  const store = memoryStore([
    { id: 'read:vk:5', source: 'vk', chat: '5', unreadCount: 4, inboxMaxId: 2 },
  ]);
  const { ctx, performed } = routeCtx();
  const out = await call(store, ctx, 'POST', '/api/message/read', {
    source: 'vk',
    chat: '5',
  });
  assert.equal(out.status, 200);
  assert.equal(performed[0][1].source, 'vk');
  const read = store.map.get('read:vk:5');
  assert.equal(read.unreadCount, 0);
  assert.equal(read.inboxMaxId, 2);
});

test('POST /api/message/forward forwards to the chat named', async () => {
  const store = memoryStore([message('A')]);
  const { ctx, performed } = routeCtx();
  await call(store, ctx, 'POST', '/api/message/forward', {
    ids: ['msg:whatsapp:A'],
    toChat: 7911,
  });
  assert.equal(performed[0][1].fromChat, '7900');
  assert.equal(performed[0][1].toChat, '7911');
});

test('message routes refuse bad bodies, mixed chats and foreign pages', async () => {
  const store = memoryStore([message('A'), message('B', { chat: 'other' })]);
  const { ctx, performed } = routeCtx();
  const empty = await call(store, ctx, 'POST', '/api/message/edit', {
    ids: ['msg:whatsapp:A'],
  });
  assert.equal(empty.status, 400);
  const mixed = await call(store, ctx, 'POST', '/api/message/delete', {
    ids: ['msg:whatsapp:A', 'msg:whatsapp:B'],
  });
  assert.equal(mixed.status, 400);
  const foreign = await call(
    store,
    ctx,
    'POST',
    '/api/message/delete',
    { ids: ['msg:whatsapp:A'] },
    { origin: 'https://evil.example' }
  );
  assert.equal(foreign.status, 403);
  assert.equal(performed.length, 0);
  const other = await call(store, ctx, 'POST', '/api/messages', {});
  assert.equal(other.handled, false);
});

test('a failed action maps to a status and logs only codes', async () => {
  const store = memoryStore([message('A')]);
  const { ctx, logged } = routeCtx(() => {
    throw Object.assign(new Error('slow down'), {
      code: 'flood-wait',
      retryAfter: 30,
    });
  });
  const out = await call(store, ctx, 'POST', '/api/message/delete', {
    ids: ['msg:whatsapp:A'],
  });
  assert.equal(out.status, 429);
  assert.equal(out.body.retryAfter, 30);
  assert.equal(store.map.get('msg:whatsapp:A').deleted, undefined);
  assert.deepEqual(logged, [
    {
      level: 'warn',
      event: 'message_action_failed',
      action: 'delete',
      source: 'whatsapp',
      code: 'flood-wait',
    },
  ]);
});

test('GET /api/message/supports answers for one network', async () => {
  const { ctx } = routeCtx();
  const out = await call(
    memoryStore(),
    ctx,
    'GET',
    '/api/message/supports?source=whatsapp'
  );
  assert.deepEqual(out.body, {
    source: 'whatsapp',
    actions: { edit: { api: true, browser: false } },
  });
});

test('the CV browser launches through browser-commander, never with engine flags', async () => {
  const launched = [];
  const bc = {
    launchBrowser: async (options) => {
      launched.push(options);
      return { browser: 'ctx', page: 'page', close: async () => 'closed' };
    },
  };
  const session = await launchWithCommander({
    bc,
    headless: false,
    profileDir: '/profile',
    slowMo: 0,
    locale: 'en-US',
  });
  assert.equal(launched.length, 1);
  assert.equal(launched[0].userDataDir, '/profile');
  assert.equal(launched[0].launch, undefined);
  assert.ok(!launched[0].args.some((a) => a.includes('AutomationControlled')));
  assert.equal(session.page, 'page');
  assert.equal(await session.close(), 'closed');
});

// A browser sender that reads two chats from the web app.
const readingBrowser = (reads = []) => ({
  readChats: async ({ source }) => [
    { chat: '11', title: 'Anna', source },
    { chat: 'title:No id', title: 'No id', source },
    { chat: '12', title: 'Bob', source },
  ],
  readRecent: async ({ source, chat }) => {
    reads.push(chat);
    return [
      {
        id: `msg:${source}:${chat}:1`,
        source,
        chat,
        sender: 'x',
        body: 'hi',
        via: 'browser',
      },
    ];
  },
});

test('pullBrowserInto stores the newest messages of the listed chats', async () => {
  const store = memoryStore();
  const reads = [];
  const result = await pullBrowserInto(
    store,
    'linkedin',
    readingBrowser(reads),
    {
      chats: 3,
    }
  );
  assert.deepEqual(reads, ['11', '12']);
  assert.equal(result.imported, 2);
  assert.equal(result.via, 'browser');
  assert.equal(store.map.get('msg:linkedin:11:1').chatName, 'Anna');
});

test('a pull falls back to the web app only when the API cannot pull', async () => {
  const store = memoryStore();
  const viaBrowser = await pullLiveInto(store, 'linkedin', {
    live: {},
    browser: readingBrowser(),
  });
  assert.equal(viaBrowser.via, 'browser');
  const viaApi = await pullLiveInto(store, 'linkedin', {
    live: {
      pullMessages: async () => ({
        links: [message('Z', { source: 'linkedin' })],
      }),
    },
    browser: { readChats: () => assert.fail('browser opened') },
  });
  assert.equal(viaApi.imported, 1);
  await assert.rejects(
    pullLiveInto(store, 'linkedin', {
      live: {
        pullMessages: async () => {
          throw Object.assign(new Error('partly done'), { fallback: false });
        },
      },
      browser: readingBrowser(),
    }),
    /partly done/
  );
  await assert.rejects(
    pullLiveInto(store, 'linkedin', { live: {} }),
    /does not support pullMessages/
  );
});

test('an API that answers "not supported here" hands over to the web app', async () => {
  const actions = createMessageActions({
    getSource: adapterWith({
      markRead: async () => ({ ok: false, supported: false }),
    }),
    browser: () => ({ markRead: async () => ({ via: 'browser', read: true }) }),
  });
  const result = await actions.perform('read', {
    source: 'telegram',
    chat: '1',
  });
  assert.equal(result.via, 'browser');
});

test('POST /api/message/edit takes the link preview fields and an emptied caption', async () => {
  const store = memoryStore([message('A')]);
  const { ctx, performed } = routeCtx();
  const out = await call(store, ctx, 'POST', '/api/message/edit', {
    ids: ['msg:whatsapp:A'],
    text: 'see x.test',
    noWebpage: true,
    invertMedia: true,
  });
  assert.equal(out.status, 200);
  assert.equal(performed[0][1].noWebpage, true);
  assert.equal(performed[0][1].invertMedia, true);
  const caption = await call(store, ctx, 'POST', '/api/message/edit', {
    ids: ['msg:whatsapp:A'],
    text: '',
    caption: true,
  });
  assert.equal(caption.status, 200);
  assert.equal(store.map.get('msg:whatsapp:A').body, '\u{1F4CE}');
  const empty = await call(store, ctx, 'POST', '/api/message/edit', {
    ids: ['msg:whatsapp:A'],
    text: '',
  });
  assert.equal(empty.status, 400);
  const bad = await call(store, ctx, 'POST', '/api/message/edit', {
    ids: ['msg:whatsapp:A'],
    text: 'x',
    noWebpage: 'yes',
  });
  assert.equal(bad.status, 400);
});
