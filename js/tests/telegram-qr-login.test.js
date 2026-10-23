// Sign in to Telegram by QR code (R-Y203): the flow over a fake client
// (token shown, refreshed when it expires, UpdateLoginToken then success,
// migration to another data centre, the 2-Step Verification password) and
// the HTTP routes (validation, account slots). Nothing reaches a network.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  createTelegramMtproto,
  accountOf,
} from '../src/sources/telegram-mtproto.js';
import { loginUrl, startQrLogin } from '../src/sources/telegram-qr-login.js';
import { readSlotCredentials } from '../src/sources/telegram-accounts.js';
import { readTelegramCredentials } from '../src/sources/telegram-account.js';
import { named, telegramError } from './helpers/telegram-fakes.mjs';
import { post, postJson } from './util-http.js';

const Api = {
  auth: {
    ExportLoginToken: named('auth.ExportLoginToken'),
    ImportLoginToken: named('auth.ImportLoginToken'),
  },
};
const loginToken = (text, expires) => ({
  className: 'auth.LoginToken',
  token: Buffer.from(text),
  expires,
});
const success = (user) => ({
  className: 'auth.LoginTokenSuccess',
  authorization: { user },
});
const USER = { id: 7n, username: 'qruser', firstName: 'Q' };
const HASH = 'a'.repeat(32);

// A fake client answering requests by class name from queues.
const fakeClient = (answers, extra = {}) => {
  const log = [];
  const client = {
    log,
    handlers: [],
    async connect() {
      log.push('connect');
    },
    async disconnect() {
      log.push('disconnect');
    },
    addEventHandler(fn) {
      client.handlers.push(fn);
    },
    async _switchDC(dc) {
      log.push(`dc:${dc}`);
    },
    async invoke(request) {
      log.push(request);
      const next = answers[request.className].shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    session: { save: () => 'SESSION_QR' },
    ...extra,
  };
  return client;
};

const begin = (client, options = {}) =>
  startQrLogin({
    client,
    apiId: '2040',
    apiHash: HASH,
    Api,
    accountOf,
    ...options,
  });

test('the code URL is the token as base64url', async () => {
  const token = Buffer.from([251, 255, 254, 1, 2, 3]);
  assert.equal(loginUrl(token), 'tg://login?token=-__-AQID');
  const client = fakeClient({
    'auth.ExportLoginToken': [loginToken('tok-1', 4102444800)],
  });
  const login = await begin(client);
  assert.equal(login.state, 'qr');
  assert.equal(login.url, loginUrl(Buffer.from('tok-1')));
  assert.equal(login.expires, 4102444800);
  const request = client.log.find(
    (r) => r.className === 'auth.ExportLoginToken'
  );
  assert.equal(request.apiId, 2040);
  assert.equal(request.apiHash, HASH);
  assert.deepEqual(request.exceptIds, []);
});

test('the code is exported again when it expires', async () => {
  let clock = 1_000_000_000_000;
  const client = fakeClient({
    'auth.ExportLoginToken': [
      loginToken('first', clock / 1000 + 30),
      loginToken('second', clock / 1000 + 90),
    ],
  });
  const login = await begin(client, { now: () => clock });
  const first = login.url;
  clock += 10_000;
  await login.status();
  assert.equal(login.url, first, 'still fresh after 10 s');
  clock += 19_000; // 29 s: inside the 2 s margin before it expires
  await login.status();
  assert.notEqual(login.url, first);
  assert.equal(login.url, loginUrl(Buffer.from('second')));
  assert.equal(login.expires, clock / 1000 - 29 + 90);
  // Too old even if the server's clock says otherwise.
  clock += 26_000;
  const before = client.log.length;
  await assert.rejects(() => login.status());
  assert.ok(client.log.length > before);
});

test('UpdateLoginToken then success: session and account', async () => {
  const client = fakeClient({
    'auth.ExportLoginToken': [loginToken('t', 4102444800), success(USER)],
  });
  const login = await begin(client);
  // Unrelated updates and a repeated one do nothing harmful.
  client.handlers[0]({ className: 'UpdateNewMessage' });
  assert.equal(login.state, 'qr');
  client.handlers[0]({ className: 'UpdateLoginToken' });
  await login.status();
  assert.equal(login.state, 'done');
  assert.equal(login.session, 'SESSION_QR');
  assert.deepEqual(login.account, accountOf(USER));
  assert.equal(login.account.id, '7');
  assert.ok(client.log.includes('disconnect'));
});

test('migrate: switch to the other data centre and import the token', async () => {
  const client = fakeClient({
    'auth.ExportLoginToken': [
      loginToken('t', 4102444800),
      {
        className: 'auth.LoginTokenMigrateTo',
        dcId: 4,
        token: Buffer.from('mig'),
      },
    ],
    'auth.ImportLoginToken': [success(USER)],
  });
  const login = await begin(client);
  client.handlers[0]({ className: 'UpdateLoginToken' });
  await login.status();
  assert.equal(login.state, 'done');
  const at = client.log.indexOf('dc:4');
  assert.ok(at > 0);
  const imported = client.log[at + 1];
  assert.equal(imported.className, 'auth.ImportLoginToken');
  assert.deepEqual(imported.token, Buffer.from('mig'));
});

// signInWithPassword as GramJS drives it: ask, check, onError and ask again.
const passwordClient = (accept) => {
  const client = fakeClient({
    'auth.ExportLoginToken': [
      loginToken('t', 4102444800),
      telegramError('SESSION_PASSWORD_NEEDED'),
    ],
  });
  client.signInWithPassword = async (_credentials, params) => {
    for (;;) {
      const typed = await params.password('hint');
      if (typed === accept) {
        return USER;
      }
      if (await params.onError(telegramError('PASSWORD_HASH_INVALID'))) {
        throw new Error('AUTH_USER_CANCEL');
      }
    }
  };
  return client;
};

test('2-Step Verification: a wrong password asks again, the right one signs in', async () => {
  const client = passwordClient('right');
  const login = await begin(client, { pollMs: 1 });
  client.handlers[0]({ className: 'UpdateLoginToken' });
  await login.status();
  assert.equal(login.state, 'password');
  await assert.rejects(
    () => login.submitPassword('wrong'),
    /PASSWORD_HASH_INVALID/
  );
  assert.equal(login.state, 'password');
  assert.equal(await login.submitPassword('right'), 'done');
  assert.equal(login.session, 'SESSION_QR');
  assert.equal(login.account.username, 'qruser');
  await assert.rejects(() => login.submitPassword('again'), /no password/);
});

test('cancel disconnects and ends a pending password step', async () => {
  const client = passwordClient('right');
  const login = await begin(client, { pollMs: 1 });
  client.handlers[0]({ className: 'UpdateLoginToken' });
  await login.status();
  await login.cancel();
  assert.ok(client.log.includes('disconnect'));
});

test('a refused api_id fails the start and disconnects', async () => {
  const client = fakeClient({
    'auth.ExportLoginToken': [telegramError('API_ID_INVALID')],
  });
  await assert.rejects(() => begin(client), /API_ID_INVALID/);
  assert.ok(client.log.includes('disconnect'));
});

// ---- The routes ----------------------------------------------------------

const serve = async (clients) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-tg-qr-'));
  const store = createMemoryStore();
  const handle = await startServer({
    port: 0,
    storeDir: dir,
    store,
    enableSync: false,
    enableHandlers: false,
    autoImportLauncher: async () => ({ close: async () => {} }),
    telegramMtproto: createTelegramMtproto({
      clientFactory: async () => clients.shift(),
      loadApi: async () => Api,
    }),
  });
  const base = `http://127.0.0.1:${handle.port}`;
  return { handle, store, base, route: '/api/auto-import/telegram/login' };
};

const okClient = (extra = {}) =>
  fakeClient({
    'auth.ExportLoginToken': [loginToken('t', 4102444800), success(USER)],
    ...extra,
  });

test('routes: qr-start validates, qr-status answers url, then done (account 1)', async () => {
  const client = okClient();
  const { handle, store, base, route } = await serve([client]);
  try {
    const good = { apiId: 2040, apiHash: HASH };
    for (const bad of [
      {},
      { apiId: 'abc', apiHash: HASH },
      { apiId: 0, apiHash: HASH },
      { apiId: 2040, apiHash: 'short' },
      { apiId: 2040, apiHash: 'z'.repeat(32) },
      { ...good, account: 9 },
      { ...good, account: 4 },
    ]) {
      const res = await post(base, `${route}/qr-start`, bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
    const foreign = await post(base, `${route}/qr-start`, good, {
      origin: 'https://evil.example',
    });
    assert.equal(foreign.status, 403);

    const started = await postJson(base, `${route}/qr-start`, good);
    assert.match(started.id, /^tg-login-/);
    assert.equal(started.url, loginUrl(Buffer.from('t')));
    assert.equal(started.expires, 4102444800);
    assert.equal(started.session, undefined);

    const poll = await postJson(base, `${route}/qr-status`, { id: started.id });
    assert.equal(poll.url, started.url);
    assert.equal(await store.get('secret:telegram:user-session'), null);

    client.handlers[0]({ className: 'UpdateLoginToken' });
    const done = await postJson(base, `${route}/qr-status`, { id: started.id });
    assert.equal(done.done, true);
    assert.equal(done.account.username, 'qruser');
    assert.equal(done.session, undefined);
    const saved = await readTelegramCredentials(store);
    assert.equal(saved.session, 'SESSION_QR');
    assert.equal(String(saved.apiId), '2040');
    // The login is gone once it is done.
    const again = await post(base, `${route}/qr-status`, { id: started.id });
    assert.equal(again.status, 404);
  } finally {
    await handle.close();
  }
});

test('routes: account 2 is saved under its own @2 keys only', async () => {
  const client = okClient();
  const { handle, store, base, route } = await serve([client]);
  try {
    const started = await postJson(base, `${route}/qr-start`, {
      apiId: '2040',
      apiHash: HASH,
      account: 2,
    });
    client.handlers[0]({ className: 'UpdateLoginToken' });
    const done = await postJson(base, `${route}/qr-status`, { id: started.id });
    assert.equal(done.done, true);
    assert.equal(done.extra, 2);
    assert.equal((await readSlotCredentials(store, 2)).session, 'SESSION_QR');
    assert.equal(await store.get('secret:telegram:user-session'), null);
    assert.equal(await readTelegramCredentials(store), null);
  } finally {
    await handle.close();
  }
});

test('routes: password step reuses the phone flow route; cancel; bad ids', async () => {
  const client = passwordClient('s3cret');
  const { handle, store, base, route } = await serve([client]);
  try {
    const started = await postJson(base, `${route}/qr-start`, {
      apiId: 2040,
      apiHash: HASH,
    });
    client.handlers[0]({ className: 'UpdateLoginToken' });
    const needs = await postJson(base, `${route}/qr-status`, {
      id: started.id,
    });
    assert.deepEqual(needs, { needs: 'password' });
    // A QR login has no code step.
    const code = await post(base, `${route}/code`, {
      id: started.id,
      code: '1',
    });
    assert.equal(code.status, 400);
    const wrong = await post(base, `${route}/password`, {
      id: started.id,
      password: 'nope',
    });
    assert.equal(wrong.status, 400);
    const done = await postJson(base, `${route}/password`, {
      id: started.id,
      password: 's3cret',
    });
    assert.equal(done.done, true);
    assert.equal((await readTelegramCredentials(store)).session, 'SESSION_QR');

    for (const id of ['', 'nope', 'tg-login-1-x', 42, null]) {
      const res = await post(base, `${route}/qr-status`, { id });
      assert.equal(res.status, 404);
    }
  } finally {
    await handle.close();
  }
});

test('routes: qr-cancel drops the login; an expired-token failure is a 400', async () => {
  const first = okClient();
  const failing = fakeClient({
    'auth.ExportLoginToken': [
      loginToken('t', 1),
      telegramError('AUTH_KEY_UNREGISTERED'),
    ],
  });
  const { handle, base, route } = await serve([first, failing]);
  try {
    const a = await postJson(base, `${route}/qr-start`, {
      apiId: 1,
      apiHash: HASH,
    });
    assert.deepEqual(await postJson(base, `${route}/qr-cancel`, { id: a.id }), {
      cancelled: true,
    });
    assert.ok(first.log.includes('disconnect'));
    const gone = await post(base, `${route}/qr-status`, { id: a.id });
    assert.equal(gone.status, 404);

    // expires = 1 (long past): the next poll exports again and fails.
    const b = await postJson(base, `${route}/qr-start`, {
      apiId: 1,
      apiHash: HASH,
    });
    const res = await post(base, `${route}/qr-status`, { id: b.id });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /AUTH_KEY_UNREGISTERED/);
  } finally {
    await handle.close();
  }
});
