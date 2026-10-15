// The Telegram user-login HTTP flow: start (send code) -> code -> optional
// 2FA password -> the session saved under secret:telegram:*. A fake MTProto
// stands in for GramJS, so no network or real dependency is touched. The
// routes are POST-only from the app, like the other auto-import routes.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

import { startServer } from '../src/server/index.js';
import { createTelegramMtproto } from '../src/web/../sources/telegram-mtproto.js';
import { createTelegramCreds } from '../src/web/../sources/auto-import/telegram-creds.js';
import { readStoreText } from './util-store-text.js';
import { post, postJson } from './util-http.js';

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-tg-login-'));

// A fake GramJS client that needs a 2FA password.
const fakeClient = () => ({
  async connect() {},
  async disconnect() {},
  async start({ phoneNumber, phoneCode, password }) {
    await phoneNumber();
    await phoneCode();
    await password();
  },
  session: { save: () => 'SESSION_FROM_LOGIN' },
  getMe: async () => ({ id: 99, username: 'konard' }),
});

// Start a server with the fake MTProto wired in, plus any extra options.
const startTgServer = async (storeDir, extra = {}) => {
  const handle = await startServer({
    port: 0,
    storeDir,
    enableSync: false,
    autoImportLauncher: async () => ({ close: async () => {} }),
    telegramMtproto: createTelegramMtproto({
      clientFactory: async () => fakeClient(),
    }),
    ...extra,
  });
  return { handle, storeDir, base: `http://127.0.0.1:${handle.port}` };
};

const serve = async () => startTgServer(await tmpDir());

// Submit the code Telegram "sent", then the 2FA password — the shared tail
// of every finished sign-in — and return the final reply.
const finishLogin = async (base, id) => {
  const afterCode = await postJson(
    base,
    '/api/auto-import/telegram/login/code',
    {
      id,
      code: '12345',
    }
  );
  assert.equal(afterCode.needs, 'password');
  return postJson(base, '/api/auto-import/telegram/login/password', {
    id,
    password: 's3cret',
  });
};

test('telegram login: start -> code -> 2FA password -> saved session', async () => {
  const { handle, base, storeDir } = await serve();
  try {
    // Foreign origins are rejected, like the other auto-import routes.
    const foreign = await post(
      base,
      '/api/auto-import/telegram/login/start',
      { apiId: 1, apiHash: 'h', phone: '+1555' },
      { origin: 'https://evil.example' }
    );
    assert.equal(foreign.status, 403);

    const started = await postJson(
      base,
      '/api/auto-import/telegram/login/start',
      { apiId: 2040, apiHash: 'abcdef', phone: '+15551234567' }
    );
    assert.equal(started.needs, 'code');
    assert.ok(started.id, 'a login id is returned');

    const done = await finishLogin(base, started.id);
    assert.equal(done.done, true);
    assert.equal(done.account.username, 'konard');

    // The session and api credentials were written as secrets on disk
    // (no passphrase here, so the link id appears in plaintext somewhere).
    const blob = await readStoreText(storeDir);
    assert.match(blob, /secret:telegram:user-session/);
    assert.match(blob, /secret:telegram:api-id/);
    assert.match(blob, /SESSION_FROM_LOGIN/);
  } finally {
    await handle.close();
  }
});

test('telegram login: an unknown id is a 404', async () => {
  const { handle, base } = await serve();
  try {
    const res = await post(base, '/api/auto-import/telegram/login/code', {
      id: 'nope',
      code: '1',
    });
    assert.equal(res.status, 404);
  } finally {
    await handle.close();
  }
});

// The finder's "Login by phone & password" entry: Connect (use) has no
// stored session, so it kicks off the very same MTProto sign-in and the UI
// finishes it inline. This checks the whole path through the HTTP route.
const serveWithPhoneLogin = async () => {
  const root = await tmpDir();
  const repo = path.join(root, 'phone-only');
  await fs.mkdir(repo, { recursive: true });
  await fs.writeFile(
    path.join(repo, '.env'),
    'TELEGRAM_API_ID=2040\nTELEGRAM_API_HASH=abcdef0123456789\nTELEGRAM_PHONE=+15559990000\n'
  );
  const storeDir = await tmpDir();
  const telegramCreds = createTelegramCreds({
    dataDir: storeDir,
    fetchImpl: async () => ({ json: async () => ({ result: null }) }),
    verifyTimeout: 0,
  });
  return { ...(await startTgServer(storeDir, { telegramCreds })), root };
};

test('finder phone-login: Connect starts the sign-in, inline code finishes it', async () => {
  const { handle, base, storeDir, root } = await serveWithPhoneLogin();
  try {
    const scan = await postJson(base, '/api/auto-import/telegram/scan', {
      roots: [root],
    });
    const entry = scan.entries.find((e) => e.type === 'user-password');
    assert.ok(entry, 'a phone & password entry was found');
    assert.equal(entry.hint, null, 'no secret value for a phone-login');

    // Connect it: the server has the api_id/api_hash/phone, so it starts the
    // login and asks for the code — without the browser ever seeing a secret.
    const started = await postJson(base, '/api/auto-import/telegram/use', {
      id: entry.id,
    });
    assert.equal(started.needsLogin, true);
    assert.equal(started.needs, 'code');
    assert.ok(started.id, 'a login id to submit the code against');

    const done = await finishLogin(base, started.id);
    assert.equal(done.done, true);

    const blob = await readStoreText(storeDir);
    assert.match(blob, /SESSION_FROM_LOGIN/, 'the session was saved');
  } finally {
    await handle.close();
  }
});
