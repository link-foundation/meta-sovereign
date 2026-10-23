// More than one Telegram account (R-Y198): the single account keeps its
// keys and is never written to; an extra account lives under `@N` keys,
// is isolated from account 1, logs out without touching anything else, and
// is picked by the route's `account` field. Memory stores and fake
// clients only; nothing reaches a network.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { createMemoryStore } from '../src/storage/universal.js';
import { startServer } from '../src/server/index.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { readTelegramCredentials } from '../src/sources/telegram-account.js';
import { createTelegramMtproto } from '../src/sources/telegram-mtproto.js';
import {
  accountSlot,
  createExtraAccounts,
  extraSlots,
  limitFor,
  nextFreeSlot,
  readSlotCredentials,
  removeExtraAccount,
  saveExtraAccount,
  secretId,
} from '../src/sources/telegram-accounts.js';
import { postJson } from './util-http.js';

const secret = (name, value) => ({
  id: `secret:telegram:${name}`,
  tokens: ['secret', 'telegram', name],
  value,
});

// A store holding only today's single account, with every access logged.
const singleAccountStore = async () => {
  const inner = createMemoryStore();
  await inner.put(secret('user-session', 'S1'));
  await inner.put(secret('api-id', '111'));
  await inner.put(secret('api-hash', 'H1'));
  await inner.put({ id: 'msg:telegram:42:1', source: 'telegram', body: 'hi' });
  const log = { gets: [], puts: [], deletes: [] };
  const store = {
    ...inner,
    get: (id) => (log.gets.push(id), inner.get(id)),
    put: (link) => (log.puts.push(link.id), inner.put(link)),
    delete: (id) => (log.deletes.push(id), inner.delete(id)),
  };
  return { store, inner, log };
};

const idsOf = async (store) =>
  (await store.query(() => true)).map((l) => l.id).sort();

const NEW = {
  apiId: 222,
  apiHash: 'H2',
  session: 'S2',
  account: { firstName: 'Ann', lastName: 'Lee', username: 'ann' },
};

test('a store with only the single account behaves as before: same keys read, nothing written', async () => {
  const { store, log } = await singleAccountStore();
  assert.deepEqual(await readTelegramCredentials(store), {
    kind: 'user',
    session: 'S1',
    apiId: '111',
    apiHash: 'H1',
  });
  assert.deepEqual(log.gets.sort(), [
    'secret:telegram:api-hash',
    'secret:telegram:api-id',
    'secret:telegram:bot-token',
    'secret:telegram:user-session',
  ]);
  log.gets.length = 0;

  // Everything this feature does on such a store only reads, and reads
  // only namespaced keys of the extra slots.
  assert.deepEqual(await extraSlots(store), []);
  assert.equal(await nextFreeSlot(store, 3), 2);
  const extras = createExtraAccounts({ store });
  assert.equal(await extras.resolve(2), null);
  assert.equal(await extras.resolve(1), null);
  assert.ok(log.gets.every((id) => id.startsWith('secret:telegram@')));
  assert.deepEqual(log.puts, []);
  assert.deepEqual(log.deletes, []);
});

test('account 2 data is isolated from account 1', async () => {
  const { store, inner } = await singleAccountStore();
  const before = await inner.get('secret:telegram:user-session');
  await saveExtraAccount(store, 2, NEW);

  // Account 1 is exactly as it was.
  assert.deepEqual(await inner.get('secret:telegram:user-session'), before);
  assert.equal((await readTelegramCredentials(store)).session, 'S1');
  assert.equal((await readSlotCredentials(store, 1)).session, 'S1');
  // Account 2 has its own.
  assert.deepEqual(await readSlotCredentials(store, 2), {
    kind: 'user',
    session: 'S2',
    apiId: '222',
    apiHash: 'H2',
  });
  assert.equal(await readSlotCredentials(store, 3), null);
  assert.deepEqual(await extraSlots(store), [2]);
  // Only namespaced ids were added.
  const added = (await idsOf(inner)).filter(
    (id) => !id.startsWith('secret:telegram:') && id !== 'msg:telegram:42:1'
  );
  assert.deepEqual(added, [
    'account:telegram@2',
    'secret:telegram@2:api-hash',
    'secret:telegram@2:api-id',
    'secret:telegram@2:user-session',
  ]);
  // Account 1 cannot be saved as an "extra" one.
  await assert.rejects(saveExtraAccount(store, 1, NEW));
});

test('logging out account 2 removes only its @2 keys', async () => {
  const { store, inner } = await singleAccountStore();
  await saveExtraAccount(store, 2, NEW);
  await saveExtraAccount(store, 3, { ...NEW, session: 'S3' });
  const before = await idsOf(inner);

  assert.equal(await removeExtraAccount(store, 2), 4);
  const after = await idsOf(inner);
  const gone = before.filter((id) => !after.includes(id));
  assert.equal(gone.length, 4);
  assert.ok(gone.every((id) => id.includes('@2')));
  assert.equal((await readSlotCredentials(store, 3)).session, 'S3');
  assert.equal((await readTelegramCredentials(store)).session, 'S1');
  assert.ok(after.includes('msg:telegram:42:1'));

  // Account 1 (and nonsense) is refused.
  await assert.rejects(removeExtraAccount(store, 1));
  await assert.rejects(removeExtraAccount(store, 9));
  assert.equal((await readTelegramCredentials(store)).session, 'S1');
});

test('slots and limits', () => {
  assert.equal(accountSlot(undefined), 1);
  assert.equal(accountSlot(1), 1);
  assert.equal(accountSlot('2'), 2);
  assert.equal(accountSlot(5), 5);
  for (const bad of [0, 6, 1.5, 'x', -1, {}]) {
    assert.equal(accountSlot(bad), null);
  }
  assert.equal(limitFor(false), 3);
  assert.equal(limitFor(true), 5);
  assert.equal(secretId(1, 'api-id'), 'secret:telegram:api-id');
  assert.equal(secretId(2, 'api-id'), 'secret:telegram@2:api-id');
});

test('the next free slot respects the limit', async () => {
  const { store } = await singleAccountStore();
  assert.equal(await nextFreeSlot(store, 3), 2);
  await saveExtraAccount(store, 2, NEW);
  assert.equal(await nextFreeSlot(store, 3), 3);
  await saveExtraAccount(store, 3, NEW);
  assert.equal(await nextFreeSlot(store, 3), null);
  assert.equal(await nextFreeSlot(store, 5), 4);
});

// A fake GramJS client for an extra account.
const dialog = (id, title, unread, text, extra = {}) => ({
  id,
  title,
  unreadCount: unread,
  message: { message: text },
  date: 1_700_000_000 + Number(id),
  ...extra,
});

const fakeFactory = (calls) => async (opts) => {
  calls.push(opts.session);
  return {
    async connect() {},
    async disconnect() {
      calls.push('disconnect');
    },
    async invoke(request) {
      calls.push(request.className);
    },
    getDialogs: async () => [
      dialog(1, 'Old', 2, 'a'),
      dialog(2, 'New', 3, 'b'),
      dialog(3, 'Muted', 9, 'c', {
        dialog: { notifySettings: { muteUntil: 5 } },
      }),
    ],
  };
};

test('an extra account lists its chats live and counts unread (not muted)', async () => {
  const { store, log } = await singleAccountStore();
  await saveExtraAccount(store, 2, NEW);
  log.puts.length = 0;
  const calls = [];
  const extras = createExtraAccounts({
    store,
    clientFactory: fakeFactory(calls),
  });
  const service = await extras.resolve(2);
  const answer = await service.dialogs();
  assert.equal(answer.ok, true);
  assert.deepEqual(
    answer.dialogs.map((d) => d.name),
    ['Muted', 'New', 'Old']
  );
  assert.equal(answer.unread, 5);
  // Only account 2's session was used, nothing was written afterwards.
  assert.deepEqual(calls, ['S2']);
  assert.deepEqual(log.puts, []);
  await extras.stop();
  assert.deepEqual(calls, ['S2', 'disconnect']);
  assert.equal((await extras.dialogs(3)).code, 'no-account');
});

// A POST through handleTelegramRoutes with a context.
const send = async (route, body, ctx) => {
  const p = `/api/telegram/${route}`;
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(req, {
    method: 'POST',
    url: p,
    headers: { 'content-type': 'application/json', host: '127.0.0.1:8787' },
  });
  const res = {
    body: '',
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = text ?? '';
    },
  };
  await handleTelegramRoutes(req, res, p, { allowOrigins: [], ...ctx });
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
};

const routeContext = async ({ premium = false } = {}) => {
  const { store, log } = await singleAccountStore();
  await saveExtraAccount(store, 2, NEW);
  const main = {
    accountMe: async () => ({ ok: true, id: '99', name: 'Me', premium }),
    // A route that answers from the account it was resolved to.
    chatPermissions: async () => ({ ok: true, who: 'main' }),
  };
  const calls = [];
  const telegramAccounts = createExtraAccounts({
    store,
    clientFactory: fakeFactory(calls),
    loadApi: async () => ({
      auth: {
        LogOut: class {
          className = 'auth.LogOut';
        },
      },
    }),
  });
  return {
    ctx: { telegramAccount: main, telegramStore: store, telegramAccounts },
    store,
    log,
    calls,
  };
};

test('routes: no account field means account 1, as before', async () => {
  const { ctx } = await routeContext();
  const plain = await send('chat-permissions', { chat: '-100123' }, ctx);
  assert.equal(plain.status, 200);
  assert.equal(plain.json.who, 'main');
  const one = await send(
    'chat-permissions',
    { chat: '-100123', account: 1 },
    ctx
  );
  assert.equal(one.json.who, 'main');
});

test('routes: an extra account answers only what it supports', async () => {
  const { ctx, calls } = await routeContext();
  const dialogs = await send('accounts-dialogs', { account: 2 }, ctx);
  assert.equal(dialogs.status, 200);
  assert.equal(dialogs.json.dialogs.length, 3);
  assert.deepEqual(calls, ['S2']);
  // Another route asked for account 2 is refused, never run on account 1.
  const other = await send(
    'chat-permissions',
    { chat: '-100123', account: 2 },
    ctx
  );
  assert.equal(other.status, 400);
  assert.equal(other.json.code, 'unsupported-account');
  // An account that is not signed in, and nonsense.
  assert.equal(
    (await send('accounts-dialogs', { account: 3 }, ctx)).status,
    404
  );
  assert.equal(
    (await send('accounts-dialogs', { account: 9 }, ctx)).status,
    400
  );
  assert.equal(
    (await send('chat-permissions', { account: 'x' }, ctx)).status,
    400
  );
  // Account 1 has its own chat list: this route is for the others.
  assert.equal(
    (await send('accounts-dialogs', { account: 1 }, ctx)).status,
    400
  );
});

test('routes: the list names account 1 first, the limit and the next slot', async () => {
  const { ctx } = await routeContext();
  const list = (await send('accounts', {}, ctx)).json;
  assert.equal(list.ok, true);
  assert.deepEqual(
    list.accounts.map((a) => [a.account, a.name]),
    [
      [1, 'Me'],
      [2, 'Ann Lee'],
    ]
  );
  assert.equal(list.accounts[0].current, true);
  assert.equal(list.limit, 3);
  assert.equal(list.next, 3);
  assert.equal(list.canAdd, true);

  const premium = (
    await send('accounts', {}, (await routeContext({ premium: true })).ctx)
  ).json;
  assert.equal(premium.limit, 5);
  assert.equal(premium.premium, true);
});

test('routes: unread of the other accounts, and logout of account 2 only', async () => {
  const { ctx, store, calls } = await routeContext();
  const unread = (await send('accounts-unread', {}, ctx)).json;
  assert.deepEqual(unread.unread, [{ account: 2, unread: 5 }]);

  const refused = await send('accounts-logout', { account: 1 }, ctx);
  assert.equal(refused.status, 400);
  assert.equal((await readTelegramCredentials(store)).session, 'S1');

  const done = await send('accounts-logout', { account: 2 }, ctx);
  assert.deepEqual(done.json, { ok: true, removed: 4 });
  assert.deepEqual(await extraSlots(store), []);
  assert.equal((await readTelegramCredentials(store)).session, 'S1');
  // Telegram was told (auth.logOut) and the connection was closed.
  assert.ok(calls.includes('auth.LogOut'));
  assert.ok(calls.includes('disconnect'));
});

// Signing in to an extra slot with the existing login flow.
const fakeLogin = () => ({
  async connect() {},
  async disconnect() {},
  async start({ phoneNumber, phoneCode }) {
    await phoneNumber();
    await phoneCode();
  },
  session: { save: () => 'SESSION_TWO' },
  getMe: async () => ({ id: 7, username: 'second', firstName: 'Sec' }),
});

test('sign-in with account 2 saves only namespaced keys; absent account is as before', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-tg-accounts-'));
  const store = createMemoryStore();
  const handle = await startServer({
    port: 0,
    storeDir: dir,
    store,
    enableSync: false,
    enableHandlers: false,
    autoImportLauncher: async () => ({ close: async () => {} }),
    telegramMtproto: createTelegramMtproto({
      clientFactory: async () => fakeLogin(),
    }),
  });
  const base = `http://127.0.0.1:${handle.port}`;
  const login = '/api/auto-import/telegram/login';
  const body = { apiId: 2040, apiHash: 'abc', phone: '+15551234567' };
  try {
    const bad = await fetch(`${base}${login}/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, account: 9 }),
    });
    assert.equal(bad.status, 400);
    // Beyond the third needs Premium, which cannot be shown here.
    const fourth = await fetch(`${base}${login}/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, account: 4 }),
    });
    assert.equal(fourth.status, 400);

    const started = await postJson(base, `${login}/start`, {
      ...body,
      account: 2,
    });
    assert.equal(started.needs, 'code');
    const done = await postJson(base, `${login}/code`, {
      id: started.id,
      code: '1',
    });
    assert.equal(done.done, true);
    assert.equal(done.extra, 2);
    assert.equal(done.session, undefined);
    assert.equal((await readSlotCredentials(store, 2)).session, 'SESSION_TWO');
    assert.equal(await readTelegramCredentials(store), null);
    assert.equal(await store.get('secret:telegram:user-session'), null);

    // Without `account`: account 1, as before.
    const first = await postJson(base, `${login}/start`, body);
    const one = await postJson(base, `${login}/code`, {
      id: first.id,
      code: '1',
    });
    assert.equal(one.done, true);
    assert.equal(one.extra, undefined);
    assert.equal((await readTelegramCredentials(store)).session, 'SESSION_TWO');
  } finally {
    await handle.close();
  }
});
