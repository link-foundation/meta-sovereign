import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import { createTelegramMtproto } from '../src/sources/telegram-mtproto.js';
import { startQrLogin } from '../src/sources/telegram-qr-login.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
const wait = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const user = { id: 7n, username: 'tester' };
const clientFor = (extra = {}) => ({
  destroyed: 0,
  async connect() {},
  async disconnect() {},
  async destroy() {
    this.destroyed++;
  },
  async start({ phoneNumber, phoneCode }) {
    await phoneNumber();
    await phoneCode();
  },
  getMe: async () => user,
  session: { save: () => 'SESSION' },
  ...extra,
});
const authFor = (client, options = {}) =>
  createTelegramMtproto({
    clientFactory: async () => client,
    ...options,
  });
const beginPhone = (client, options) =>
  authFor(client, options).createLogin({
    apiId: 2040,
    apiHash: 'hash',
    phone: '+15551234567',
  });
const beginQr = (client, options = {}) =>
  startQrLogin({
    client,
    apiId: 2040,
    apiHash: 'hash',
    accountOf: (me) => ({ id: String(me.id) }),
    Api: { auth: { ExportLoginToken: class {} } },
    ...options,
  });

test(
  'identify destroys a client even when connect fails',
  { timeout: 1000 },
  async () => {
    const client = clientFor({
      connect: async () => {
        throw new Error('offline');
      },
    });
    await assert.rejects(
      () => authFor(client).identify({ session: 'saved' }),
      /offline/
    );
    assert.equal(client.destroyed, 1);
  }
);

test(
  'successful phone login destroys its client before reporting done',
  { timeout: 1000 },
  async () => {
    const client = clientFor();
    const login = await beginPhone(client);
    await login.ready();
    assert.equal(await login.submitCode('12345'), 'done');
    assert.equal(login.session, 'SESSION');
    assert.equal(client.destroyed, 1);
    await login.cancel();
    assert.equal(client.destroyed, 1, 'cleanup is idempotent');
  }
);

test(
  'cancelled phone login cannot publish a late account or session',
  { timeout: 1000 },
  async () => {
    const account = deferred();
    const entered = deferred();
    const client = clientFor({
      getMe: () => {
        entered.resolve();
        return account.promise;
      },
    });
    const login = await beginPhone(client);
    await login.ready();
    const submitted = login.submitCode('12345').catch((error) => error);
    await entered.promise;
    await login.cancel();
    account.resolve(user);
    await submitted;
    await tick();
    assert.equal(login.state, 'cancelled');
    assert.equal(login.session, null);
    assert.equal(login.account, null);
    assert.equal(client.destroyed, 1);
  }
);

test(
  'QR connect failures destroy the partially connected client',
  { timeout: 1000 },
  async () => {
    const client = clientFor({
      connect: async () => {
        throw new Error('offline');
      },
    });
    await assert.rejects(() => beginQr(client), /offline/);
    assert.equal(client.destroyed, 1);
  }
);

test(
  'cancelled QR export cannot restore a completed login',
  { timeout: 1000 },
  async () => {
    const answer = deferred();
    let handler;
    let count = 0;
    const client = clientFor({
      addEventHandler: (fn) => {
        handler = fn;
      },
      invoke: async () =>
        ++count === 1
          ? {
              className: 'auth.LoginToken',
              token: Buffer.from('token'),
              expires: 4102444800,
            }
          : answer.promise,
    });
    const login = await beginQr(client);
    handler({ className: 'UpdateLoginToken' });
    await tick();
    await login.cancel();
    answer.resolve({
      className: 'auth.LoginTokenSuccess',
      authorization: { user },
    });
    await tick();
    assert.equal(login.state, 'cancelled');
    assert.equal(login.session, null);
    assert.equal(login.account, null);
    assert.equal(login.url, null);
    assert.equal(client.destroyed, 1);
  }
);

test(
  'identification timeout destroys a hung connection and ignores late completion',
  { timeout: 1000 },
  async () => {
    const connection = deferred();
    let reads = 0;
    const client = clientFor({
      connect: () => connection.promise,
      getMe: async () => {
        reads++;
        return user;
      },
    });
    const pending = authFor(client, { identifyTimeoutMs: 10 }).identify({
      session: 'saved',
    });
    const rejected = assert.rejects(() => pending, { code: 'LOGIN_TIMEOUT' });
    await wait(30);
    await rejected;
    connection.resolve();
    await tick();
    assert.equal(reads, 0);
    assert.equal(client.destroyed, 1);
  }
);

test(
  'idle phone and QR controllers expire with no credential result',
  { timeout: 1000 },
  async () => {
    const phoneClient = clientFor();
    const phone = await beginPhone(phoneClient, { loginTimeoutMs: 50 });
    await phone.ready();
    const qrClient = clientFor({
      invoke: async () => ({
        className: 'auth.LoginToken',
        token: Buffer.from('token'),
        expires: 4102444800,
      }),
    });
    const qr = await beginQr(qrClient, { timeoutMs: 50 });
    await wait(75);
    for (const login of [phone, qr]) {
      assert.equal(login.state, 'error');
      assert.equal(login.session, null);
      await assert.rejects(
        async () => (login.status ? login.status() : login.submitCode('late')),
        { code: 'LOGIN_TIMEOUT' }
      );
      await login.cancel();
    }
    assert.equal(phoneClient.destroyed, 1);
    assert.equal(qrClient.destroyed, 1);
  }
);

test(
  'phone code and 2FA errors accept new input without replaying the rejected value',
  { timeout: 1000 },
  async () => {
    const inputs = [];
    const client = clientFor({
      start: async ({ phoneCode, password, onError }) => {
        for (const [ask, accepted, error] of [
          [phoneCode, 'right-code', 'PHONE_CODE_INVALID'],
          [password, 'right-password', 'PASSWORD_HASH_INVALID'],
        ]) {
          for (let attempt = 0; attempt < 3; attempt++) {
            const value = await ask();
            inputs.push(value);
            if (value === accepted) {
              break;
            }
            if (await onError(new Error(error))) {
              throw new Error('AUTH_USER_CANCEL');
            }
            if (attempt === 2) {
              throw new Error('test retry bound exceeded');
            }
          }
        }
      },
    });
    const login = await beginPhone(client);
    await login.ready();
    await assert.rejects(
      () => login.submitPassword('too-early'),
      /no password/
    );
    await assert.rejects(
      () => login.submitCode('wrong-code'),
      /PHONE_CODE_INVALID/
    );
    assert.equal(login.state, 'code');
    assert.equal(await login.submitCode('right-code'), 'password');
    await assert.rejects(
      () => login.submitPassword('wrong-password'),
      /PASSWORD_HASH_INVALID/
    );
    assert.equal(login.state, 'password');
    assert.equal(client.destroyed, 0);
    assert.equal(await login.submitPassword('right-password'), 'done');
    assert.deepEqual(inputs, [
      'wrong-code',
      'right-code',
      'wrong-password',
      'right-password',
    ]);
    assert.equal(client.destroyed, 1);
  }
);

test(
  'phone completion waits for client destruction',
  { timeout: 1000 },
  async () => {
    const closing = deferred();
    const entered = deferred();
    const client = clientFor({
      destroy: async () => {
        entered.resolve();
        await closing.promise;
      },
    });
    const login = await beginPhone(client);
    await login.ready();
    const submitted = login.submitCode('12345');
    await entered.promise;
    assert.equal(login.state, 'checking');
    assert.equal(login.session, null);
    closing.resolve();
    assert.equal(await submitted, 'done');
  }
);

test(
  'lifecycle diagnostics are opt-in and contain phases only',
  { timeout: 1000 },
  async () => {
    for (const debug of [false, true]) {
      const records = [];
      const login = await beginPhone(clientFor(), {
        debug,
        log: (entry) => records.push(entry),
      });
      await login.ready();
      await login.cancel();
      assert.deepEqual(
        records,
        debug
          ? ['created', 'cancelled', 'closed'].map((phase) => ({
              event: 'telegram_login_lifecycle',
              phase,
            }))
          : []
      );
    }
  }
);
