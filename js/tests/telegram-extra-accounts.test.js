// Extra Telegram accounts, fully usable (R-Y202): each runs on its own
// store, a request names its account, and account 1's store is never
// written. Memory stores, temp directories and fake services only; nothing
// reaches a network.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { createMemoryStore } from '../src/storage/universal.js';
import { startServer } from '../src/server/index.js';
import {
  accountDir,
  borrowSecrets,
  createExtraRuntime,
  unreadOfStore,
} from '../src/server/telegram-extras.js';
import {
  ACCOUNT_KEY,
  activeAccount,
  scopedForExtra,
  scopedUrl,
  setActiveAccount,
} from '../src/web/telegram-account-scope.js';
import {
  accountNotification,
  sumOthers,
  switchAccount,
} from '../src/web/chat-accounts-live.js';
import { saveExtraAccount } from '../src/sources/telegram-accounts.js';

const secret = (name, value) => ({
  id: `secret:telegram:${name}`,
  tokens: ['secret', 'telegram', name],
  value,
});

// Account 1's store (its own session) with a counted `put`, and account 2
// signed in under `@2`.
const homeStore = async () => {
  const inner = createMemoryStore();
  await inner.put(secret('user-session', 'S1'));
  await inner.put(secret('api-id', '111'));
  await inner.put(secret('api-hash', 'H1'));
  await inner.put({
    id: 'msg:telegram:1:1',
    source: 'telegram',
    chat: '1',
    body: 'from account one',
    sender: '1',
    timestamp: '2026-01-01T00:00:00.000Z',
  });
  await saveExtraAccount(inner, 2, {
    apiId: 222,
    apiHash: 'H2',
    session: 'S2',
    account: { id: 77, firstName: 'Ann', lastName: 'Lee', username: 'ann' },
  });
  const puts = [];
  const store = {
    ...inner,
    put: (link) => (puts.push(link.id), inner.put(link)),
    putMany: (links) => (
      puts.push(...links.map((l) => l.id)),
      inner.putMany(links)
    ),
  };
  return { store, puts };
};

// A fake extra-account service: what the server needs of one.
const fakeBuild =
  (log = []) =>
  ({ store, slot }) => ({
    account: {
      who: `account-${slot}`,
      status: async () => ({ connected: true, who: `account-${slot}` }),
      connected: async () => {},
      stop: async () => {
        log.push(['stop', slot]);
      },
      live: {},
    },
    send: async (draft) => {
      log.push(['send', slot, draft.chat, draft.text]);
      return { via: `fake-${slot}` };
    },
    setTyping: async () => ({ supported: false }),
    store,
  });

test('the page helpers: absent is account 1, the choice is per tab', () => {
  const storage = new Map();
  const fake = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  assert.equal(activeAccount(fake), 1);
  setActiveAccount(3, fake);
  assert.equal(storage.get(ACCOUNT_KEY), '3');
  assert.equal(activeAccount(fake), 3);
  setActiveAccount(1, fake);
  assert.equal(storage.has(ACCOUNT_KEY), false);
  // Nonsense and blocked storage mean account 1.
  storage.set(ACCOUNT_KEY, '9');
  assert.equal(activeAccount(fake), 1);
  assert.equal(
    activeAccount({
      getItem() {
        throw new Error('blocked');
      },
    }),
    1
  );
  assert.doesNotThrow(() =>
    setActiveAccount(2, {
      setItem() {
        throw new Error('blocked');
      },
    })
  );
});

test('only account paths carry an account; the rest are never given one', () => {
  assert.equal(scopedUrl('/links?except=msg:', 'GET', 1), '/links?except=msg:');
  assert.equal(
    scopedUrl('/links?except=msg:', 'GET', 2),
    '/links?except=msg%3A&telegramAccount=2'
  );
  assert.equal(
    scopedUrl('http://127.0.0.1:8787/api/events', 'GET', 2),
    'http://127.0.0.1:8787/api/events?telegramAccount=2'
  );
  assert.equal(
    scopedUrl('/api/telegram/media?chat=1&id=2', 'GET', 3),
    '/api/telegram/media?chat=1&id=2&telegramAccount=3'
  );
  // Account-global and other routes are left alone.
  for (const [url, method] of [
    ['/api/telegram/accounts', 'POST'],
    ['/api/telegram/accounts-unread', 'POST'],
    ['/api/telegram/accounts-events', 'GET'],
    ['/api/automations', 'GET'],
    ['/api/people', 'GET'],
    ['/api/suggest?typed=a', 'GET'],
    ['/links', 'PUT'],
    ['/links/abc', 'DELETE'],
  ]) {
    assert.equal(scopedUrl(url, method, 2), url, url);
    assert.equal(scopedForExtra(url.split('?')[0], method), false, url);
  }
  assert.equal(scopedForExtra('/api/send', 'POST'), true);
  assert.equal(scopedForExtra('/api/message/edit', 'POST'), true);
  assert.equal(scopedForExtra('/links', 'GET'), true);
});

test('notification helpers name the account', () => {
  const t = (key) => (key === 'appName' ? 'App' : key);
  const event = { chatName: 'Boss', sender: 'Bo', body: 'report please' };
  assert.deepEqual(accountNotification(t, event, 'Work'), {
    title: 'Boss · Work',
    body: 'Bo: report please',
  });
  assert.deepEqual(accountNotification(t, event, 'Work', false), {
    title: 'App · Work',
    body: 'chat.notify.hidden',
  });
  assert.equal(
    sumOthers(
      [
        { account: 1, unread: 4 },
        { account: 2, unread: 3 },
        { account: 3, unread: null },
      ],
      1
    ),
    3
  );
  // Switching reloads, opening the chat afterwards through the hash.
  const env = {
    location: { hash: '#chat=telegram:1', reload: () => (env.reloaded = true) },
  };
  switchAccount(2, '501', env);
  assert.equal(env.location.hash, 'chat=telegram:501');
  assert.equal(env.reloaded, true);
  switchAccount(1, null, env);
  assert.equal(env.location.hash, '');
});

test('borrowSecrets: the session comes from account 1 under @N, nothing is copied', async () => {
  const { store: home, puts } = await homeStore();
  const own = createMemoryStore();
  const borrowed = borrowSecrets(own, home, 2);
  assert.equal(
    (await borrowed.get('secret:telegram:user-session')).value,
    'S2'
  );
  assert.equal((await borrowed.get('secret:telegram:api-id')).value, '222');
  assert.equal((await borrowed.get('secret:telegram:api-hash')).value, 'H2');
  assert.equal(await borrowed.get('secret:telegram:bot-token'), null);
  // Ordinary links are the account's own, never account 1's.
  assert.equal(await borrowed.get('msg:telegram:1:1'), null);
  await borrowed.put({ id: 'msg:telegram:9:9', source: 'telegram' });
  assert.ok(await own.get('msg:telegram:9:9'));
  assert.equal(await home.get('msg:telegram:9:9'), null);
  assert.equal(await own.get('secret:telegram:user-session'), null);
  assert.deepEqual(puts, []);
});

test('unread counts only chats that are not muted', async () => {
  const store = createMemoryStore();
  const read = (chat, unreadCount, muteUntil = 0) => ({
    id: `read:telegram:${chat}`,
    source: 'telegram',
    chat,
    unreadCount,
    muteUntil,
  });
  await store.put(read('1', 3));
  await store.put(read('2', 4, 9_999_999_999));
  await store.put(read('3', 2, 1));
  assert.equal(await unreadOfStore(store, Date.now()), 5);
});

test('the runtime opens a store only for a signed-in account, and removes only its directory', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-extras-'));
  try {
    const { store: home } = await homeStore();
    const log = [];
    const runtime = createExtraRuntime({
      home,
      storeDir: dir,
      build: fakeBuild(log),
    });
    // Nothing is made for a slot that is not signed in.
    assert.equal(await runtime.start(3), null);
    assert.equal(await runtime.start(1), null);
    assert.deepEqual(await fs.readdir(dir), []);
    const entry = await runtime.start(2);
    assert.equal(entry.account.who, 'account-2');
    assert.equal(await runtime.start(2), entry);
    assert.equal(runtime.get(2), entry);
    assert.deepEqual(await fs.readdir(path.join(dir, 'accounts')), [
      'telegram-2',
    ]);
    // Account 2's messages go to its own store.
    await entry.store.put({
      id: 'msg:telegram:5:1',
      source: 'telegram',
      chat: '5',
      body: 'only in two',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(await home.get('msg:telegram:5:1'), null);
    // Something else lives beside it: another account's directory, a file.
    await fs.mkdir(accountDir(dir, 3), { recursive: true });
    await fs.writeFile(path.join(dir, 'data.lino'), 'keep');
    await fs.writeFile(path.join(dir, 'accounts', 'note.txt'), 'keep');
    assert.equal(await runtime.remove(2), true);
    assert.deepEqual((await fs.readdir(path.join(dir, 'accounts'))).sort(), [
      'note.txt',
      'telegram-3',
    ]);
    assert.equal(
      await fs.readFile(path.join(dir, 'data.lino'), 'utf8'),
      'keep'
    );
    assert.deepEqual(log, [['stop', 2]]);
    assert.equal(runtime.get(2), null);
    // Account 1 and nonsense are never removed.
    assert.equal(await runtime.remove(1), false);
    assert.equal(await runtime.remove(99), false);
    assert.equal(await runtime.remove('../..'), false);
    assert.ok(await fs.stat(path.join(dir, 'data.lino')));
    assert.throws(() => accountDir(dir, 1));
    assert.throws(() => accountDir(dir, '../x'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

const call = (base, p, options = {}) =>
  fetch(`${base}${p}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });

const postBody = (body) => ({ method: 'POST', body: JSON.stringify(body) });

// The composer's send: previewed (428), then confirmed with the token.
const sendConfirmed = async (base, p, body) => {
  const first = await call(base, p, postBody(body));
  assert.equal(first.status, 428);
  const { confirm } = await first.json();
  return call(base, p, postBody({ ...body, confirmToken: confirm.token }));
};

// A server with account 1 (a fake) and account 2 (its own memory store).
const serverWithTwo = async () => {
  const { store, puts } = await homeStore();
  const two = createMemoryStore();
  await two.put({
    id: 'msg:telegram:501:1',
    source: 'telegram',
    chat: '501',
    chatName: 'Boss',
    body: 'from account two',
    sender: '501',
    timestamp: '2026-01-02T00:00:00.000Z',
  });
  const log = [];
  const sent1 = [];
  const handle = await startServer({
    port: 0,
    store,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: {
      who: 'account-1',
      status: async () => ({ connected: true, who: 'account-1' }),
      stop: async () => {},
    },
    telegramExtraStore: async () => ({ store: two, dir: null }),
    telegramExtraBuild: fakeBuild(log),
    automations: {
      scheduler: false,
      send: async (draft) => {
        sent1.push(draft.text);
        return { via: 'fake-1' };
      },
    },
  });
  puts.length = 0;
  return {
    handle,
    base: `http://127.0.0.1:${handle.port}`,
    store,
    two,
    puts,
    log,
    sent1,
  };
};

test('requests name their account: links, chats and status come from that account only', async () => {
  const s = await serverWithTwo();
  try {
    const ids = async (p, headers) =>
      (await (await call(s.base, p, { headers })).json()).map((l) => l.id);
    // No account: account 1, as before.
    assert.deepEqual(await ids('/links?prefix=msg:'), ['msg:telegram:1:1']);
    assert.deepEqual(await ids('/links?prefix=msg:&telegramAccount=1'), [
      'msg:telegram:1:1',
    ]);
    assert.deepEqual(await ids('/links?prefix=msg:&telegramAccount=2'), [
      'msg:telegram:501:1',
    ]);
    // The header does the same.
    assert.deepEqual(
      await ids('/links?prefix=msg:', { 'x-telegram-account': '2' }),
      ['msg:telegram:501:1']
    );
    // The chat list and a chat's page.
    const heads = await (
      await call(s.base, '/api/chat/heads?telegramAccount=2')
    ).json();
    assert.deepEqual(
      heads.map((l) => l.chat),
      ['501']
    );
    const page = await (
      await call(
        s.base,
        '/api/chat/messages?key=telegram:501&telegramAccount=2'
      )
    ).json();
    assert.equal(page.messages[0].body, 'from account two');
    // Telegram routes run on that account's service.
    const status = await (
      await call(s.base, '/api/telegram/status?telegramAccount=2')
    ).json();
    assert.equal(status.who, 'account-2');
    assert.equal(
      (await (await call(s.base, '/api/telegram/status')).json()).who,
      'account-1'
    );
    assert.deepEqual(s.puts, []);
  } finally {
    await s.handle.close();
  }
});

test('an unknown, unsigned or unsupported account is refused, never run on account 1', async () => {
  const s = await serverWithTwo();
  try {
    const code = async (p, options) => {
      const res = await call(s.base, p, options);
      return [res.status, (await res.json()).code];
    };
    assert.deepEqual(await code('/links?telegramAccount=9'), [
      400,
      'bad-request',
    ]);
    assert.deepEqual(await code('/links?telegramAccount=abc'), [
      400,
      'bad-request',
    ]);
    // Slot 3 is not signed in.
    assert.deepEqual(await code('/links?telegramAccount=3'), [
      404,
      'no-account',
    ]);
    // Routes that are not an account's.
    for (const p of [
      '/api/automations?telegramAccount=2',
      '/api/people?telegramAccount=2',
      '/api/telegram/accounts?telegramAccount=2',
    ]) {
      assert.deepEqual(await code(p), [400, 'unsupported-account'], p);
    }
    assert.deepEqual(
      await code('/api/telegram/accounts?telegramAccount=2', postBody({})),
      [400, 'unsupported-account']
    );
    assert.deepEqual(
      await code('/links?telegramAccount=2', {
        method: 'PUT',
        body: JSON.stringify({ id: 'x', tokens: [] }),
      }),
      [400, 'unsupported-account']
    );
    assert.equal(await s.store.get('x'), null);
    assert.equal(await s.two.get('x'), null);
    assert.deepEqual(s.puts, []);
  } finally {
    await s.handle.close();
  }
});

test('sending in account 2 goes to account 2 and writes only its store', async () => {
  const s = await serverWithTwo();
  try {
    const res = await sendConfirmed(s.base, '/api/send?telegramAccount=2', {
      source: 'telegram',
      chat: '501',
      text: 'hello boss',
      clientId: 'c1',
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).via, 'fake-2');
    assert.deepEqual(s.log, [['send', 2, '501', 'hello boss']]);
    assert.deepEqual(s.sent1, []);
    const outgoing = await s.two.query((l) => l.body === 'hello boss');
    assert.equal(outgoing.length, 1);
    assert.deepEqual(await s.store.query((l) => l.body === 'hello boss'), []);
    // Without an account the message goes to account 1, as always.
    const first = await sendConfirmed(s.base, '/api/send', {
      source: 'telegram',
      chat: '1',
      text: 'hi one',
    });
    assert.equal((await first.json()).via, 'fake-1');
    assert.deepEqual(s.sent1, ['hi one']);
    // Account 1's store only got its own message: nothing from account 2.
    assert.deepEqual(
      s.puts.filter((id) => !id.startsWith('msg:telegram:1:')),
      []
    );
  } finally {
    await s.handle.close();
  }
});

test('account 1 sees zero writes while an extra account is used', async () => {
  const s = await serverWithTwo();
  try {
    for (const [p, options] of [
      ['/links?telegramAccount=2'],
      ['/api/chat/heads?telegramAccount=2'],
      ['/api/telegram/status?telegramAccount=2'],
      [
        '/api/send?telegramAccount=2',
        postBody({ source: 'telegram', chat: '501', text: 'x', clientId: 'a' }),
      ], // previewed only: 428, nothing stored
      ['/api/typing?source=telegram&chat=501&telegramAccount=2'],
    ]) {
      await (await call(s.base, p, options)).text();
    }
    assert.deepEqual(s.puts, []);
  } finally {
    await s.handle.close();
  }
});

test('the other accounts: unread from each own store, and the notification stream', async () => {
  const s = await serverWithTwo();
  try {
    await s.two.put({
      id: 'read:telegram:501',
      source: 'telegram',
      chat: '501',
      unreadCount: 6,
    });
    await s.store.put({
      id: 'read:telegram:1',
      source: 'telegram',
      chat: '1',
      unreadCount: 2,
    });
    s.puts.length = 0;
    // Start account 2 (asked once, it runs).
    await (await call(s.base, '/links?telegramAccount=2')).text();
    const unread = await (
      await call(s.base, '/api/telegram/accounts-unread', postBody({}))
    ).json();
    assert.deepEqual(unread.unread, [{ account: 2, unread: 6 }]);
    const all = await (
      await call(
        s.base,
        '/api/telegram/accounts-unread',
        postBody({ all: true })
      )
    ).json();
    assert.deepEqual(all.unread, [
      { account: 1, unread: 2 },
      { account: 2, unread: 6 },
    ]);
    // The stream tells of a new incoming message of account 2.
    const stream = await fetch(`${s.base}/api/telegram/accounts-events`);
    const reader = stream.body.getReader();
    await reader.read();
    await s.two.put({
      id: 'msg:telegram:501:9',
      source: 'telegram',
      chat: '501',
      chatName: 'Boss',
      senderName: 'Bo',
      sender: '501',
      body: 'fresh news',
      timestamp: new Date().toISOString(),
    });
    let text = '';
    while (!text.includes('fresh news')) {
      text += new TextDecoder().decode((await reader.read()).value);
    }
    const data = JSON.parse(/data: (.*)/.exec(text)[1]);
    assert.equal(data.account, 2);
    assert.equal(data.chatName, 'Boss');
    assert.equal(data.muted, false);
    // Its own message, and an old one, are not news.
    await s.two.put({
      id: 'msg:telegram:501:10',
      source: 'telegram',
      chat: '501',
      sender: 'me',
      body: 'mine',
      timestamp: new Date().toISOString(),
    });
    await reader.cancel();
    assert.deepEqual(s.puts, []);
  } finally {
    await s.handle.close();
  }
});

test('logging out account 2 stops it and removes only its own directory', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-extras-logout-'));
  const log = [];
  const handle = await startServer({
    port: 0,
    storeDir: dir,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: {
      status: async () => ({ connected: true }),
      stop: async () => {},
    },
    telegramExtraBuild: fakeBuild(log),
    automations: { scheduler: false },
  });
  const base = `http://127.0.0.1:${handle.port}`;
  try {
    await saveExtraAccount(handle.store, 2, {
      apiId: 2,
      apiHash: 'h',
      session: 'S2',
      account: { username: 'two' },
    });
    await saveExtraAccount(handle.store, 3, {
      apiId: 3,
      apiHash: 'h',
      session: 'S3',
      account: { username: 'three' },
    });
    await (await call(base, '/links?telegramAccount=2')).text();
    await (await call(base, '/links?telegramAccount=3')).text();
    assert.deepEqual((await fs.readdir(path.join(dir, 'accounts'))).sort(), [
      'telegram-2',
      'telegram-3',
    ]);
    const done = await (
      await call(
        base,
        '/api/telegram/accounts-logout',
        postBody({ account: 2 })
      )
    ).json();
    assert.equal(done.ok, true);
    assert.deepEqual(await fs.readdir(path.join(dir, 'accounts')), [
      'telegram-3',
    ]);
    assert.ok(log.some(([what, slot]) => what === 'stop' && slot === 2));
    assert.equal(
      await handle.store.get('secret:telegram@2:user-session'),
      null
    );
    assert.ok(await handle.store.get('secret:telegram@3:user-session'));
    // It is gone: asking for it is refused.
    const gone = await call(base, '/links?telegramAccount=2');
    assert.equal(gone.status, 404);
    // Account 1 cannot be logged out here.
    const one = await call(
      base,
      '/api/telegram/accounts-logout',
      postBody({ account: 1 })
    );
    assert.equal(one.status, 400);
  } finally {
    await handle.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('signed-in extra accounts start with the server, and not otherwise', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-extras-start-'));
  try {
    const first = await startServer({
      port: 0,
      storeDir: dir,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: { status: async () => ({}), stop: async () => {} },
      telegramExtraBuild: fakeBuild(),
      automations: { scheduler: false },
    });
    // Nobody signed in: no directory.
    await first.close();
    assert.equal(
      await fs.stat(path.join(dir, 'accounts')).then(
        () => true,
        () => false
      ),
      false
    );
    const seed = await startServer({
      port: 0,
      storeDir: dir,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: { status: async () => ({}), stop: async () => {} },
      telegramExtraBuild: fakeBuild(),
      automations: { scheduler: false },
    });
    await saveExtraAccount(seed.store, 2, {
      apiId: 2,
      apiHash: 'h',
      session: 'S2',
      account: {},
    });
    await seed.close();
    const log = [];
    const second = await startServer({
      port: 0,
      storeDir: dir,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: { status: async () => ({}), stop: async () => {} },
      telegramExtraBuild: (options) => (
        log.push(options.slot),
        fakeBuild()(options)
      ),
      automations: { scheduler: false },
    });
    for (let i = 0; i < 40 && log.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.deepEqual(log, [2]);
    await second.close();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('an extra account keeps its own copy in the browser (R-Y202)', async () => {
  const { pickBrowserDriver } = await import('../src/storage/browser-store.js');
  const items = new Map();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: (key) => items.delete(key),
    },
  });
  try {
    await pickBrowserDriver().save({ links: [{ id: 'a' }] });
    await pickBrowserDriver({ suffix: '@telegram-2' }).save({
      links: [{ id: 'b' }],
    });
    assert.deepEqual([...items.keys()].sort(), [
      'meta-sovereign:store-snapshot',
      'meta-sovereign:store-snapshot@telegram-2',
    ]);
    const own = await pickBrowserDriver({ suffix: '@telegram-2' }).load();
    assert.deepEqual(
      own.links.map((link) => link.id),
      ['b']
    );
  } finally {
    if (had) {
      Object.defineProperty(globalThis, 'localStorage', had);
    } else {
      delete globalThis.localStorage;
    }
  }
});
