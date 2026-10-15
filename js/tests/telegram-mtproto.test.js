// Telegram user-account auth over MTProto, the konard/telegram-bot way:
// api_id/api_hash/phone -> login code -> optional 2FA password -> a saved
// session string. The GramJS client is faked so the login state machine is
// tested without the network or the real dependency.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTelegramMtproto } from '../src/web/../sources/telegram-mtproto.js';

// A fake GramJS client. `start()` calls the callbacks the way GramJS does:
// phoneNumber, then phoneCode, then (when twoFa is set) password.
const fakeClient = ({
  twoFa = false,
  me = { id: 42, username: 'konard' },
} = {}) => {
  const events = [];
  return {
    events,
    connected: false,
    async connect() {
      this.connected = true;
    },
    async disconnect() {
      this.connected = false;
    },
    async start({ phoneNumber, phoneCode, password }) {
      events.push(`phone:${await phoneNumber()}`);
      events.push(`code:${await phoneCode()}`);
      if (twoFa) {
        events.push(`pw:${await password()}`);
      }
    },
    session: { save: () => 'SAVED_SESSION_STRING' },
    async getMe() {
      return me;
    },
  };
};

test('identify connects with a session and reads the account', async () => {
  let built = null;
  const mt = createTelegramMtproto({
    clientFactory: async (opts) => {
      built = opts;
      return fakeClient({ me: { id: 7, username: 'tester', phone: '123' } });
    },
  });
  const account = await mt.identify({
    apiId: 2040,
    apiHash: 'hash',
    session: 'SESS',
  });
  assert.deepEqual(built, { apiId: 2040, apiHash: 'hash', session: 'SESS' });
  assert.equal(account.username, 'tester');
  assert.equal(account.id, 7);
});

test('login without 2FA: start -> code -> done with a saved session', async () => {
  const client = fakeClient({ twoFa: false });
  const mt = createTelegramMtproto({ clientFactory: async () => client });
  const login = await mt.createLogin({
    apiId: 2040,
    apiHash: 'hash',
    phone: '+15551234567',
  });
  // After ready(), the client is waiting for the code.
  assert.equal(await login.ready(), 'code');
  const state = await login.submitCode('12345');
  assert.equal(state, 'done');
  assert.equal(login.session, 'SAVED_SESSION_STRING');
  assert.equal(login.account.username, 'konard');
  assert.deepEqual(client.events, ['phone:+15551234567', 'code:12345']);
});

test('login with 2FA: start -> code -> password -> done', async () => {
  const client = fakeClient({ twoFa: true });
  const mt = createTelegramMtproto({ clientFactory: async () => client });
  const login = await mt.createLogin({
    apiId: 2040,
    apiHash: 'hash',
    phone: '+15551234567',
  });
  await login.ready();
  assert.equal(await login.submitCode('12345'), 'password');
  assert.equal(await login.submitPassword('s3cret'), 'done');
  assert.equal(login.session, 'SAVED_SESSION_STRING');
  assert.deepEqual(client.events, [
    'phone:+15551234567',
    'code:12345',
    'pw:s3cret',
  ]);
});

test('a start failure surfaces as an error, not a hang', async () => {
  const client = {
    async connect() {},
    async disconnect() {},
    async start() {
      throw new Error('PHONE_NUMBER_INVALID');
    },
    session: { save: () => '' },
    getMe: async () => ({}),
  };
  const mt = createTelegramMtproto({ clientFactory: async () => client });
  const login = await mt.createLogin({
    apiId: 1,
    apiHash: 'h',
    phone: 'bad',
  });
  await assert.rejects(() => login.ready(), /PHONE_NUMBER_INVALID/);
});
