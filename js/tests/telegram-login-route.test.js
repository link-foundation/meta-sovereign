// The Telegram user-login HTTP flow: start (send code) -> code -> optional
// 2FA password -> the session saved under secret:telegram:*. A fake MTProto
// stands in for GramJS, so no network or real dependency is touched. The
// routes are POST-only from the app, like the other auto-import routes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from '../src/server/index.js';
import { createTelegramMtproto } from '../src/web/../sources/telegram-mtproto.js';

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

const serve = async () => {
  const storeDir = await tmpDir();
  const handle = await startServer({
    port: 0,
    storeDir,
    enableSync: false,
    autoImportLauncher: async () => ({ close: async () => {} }),
    telegramMtproto: createTelegramMtproto({
      clientFactory: async () => fakeClient(),
    }),
  });
  return { handle, storeDir, base: `http://127.0.0.1:${handle.port}` };
};

const post = (base, p, body, headers = {}) =>
  fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

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

    const started = await (
      await post(base, '/api/auto-import/telegram/login/start', {
        apiId: 2040,
        apiHash: 'abcdef',
        phone: '+15551234567',
      })
    ).json();
    assert.equal(started.needs, 'code');
    assert.ok(started.id, 'a login id is returned');

    const afterCode = await (
      await post(base, '/api/auto-import/telegram/login/code', {
        id: started.id,
        code: '12345',
      })
    ).json();
    assert.equal(afterCode.needs, 'password');

    const done = await (
      await post(base, '/api/auto-import/telegram/login/password', {
        id: started.id,
        password: 's3cret',
      })
    ).json();
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

// Concatenate every file the store wrote, so the test does not depend on
// the store's exact on-disk layout.
const readStoreText = async (dir) => {
  let text = '';
  const walk = async (d) => {
    for (const entry of await fs
      .readdir(d, { withFileTypes: true })
      .catch(() => [])) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        text += await fs.readFile(full, 'utf8').catch(() => '');
      }
    }
  };
  await walk(dir);
  return text;
};

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
