// Login email, password reset and recovery, passkeys and sign-in code safety
// (R-Y218): the source module with fake clients, the routes' validation, and
// the pure page helpers (base64url, WebAuthn options and attestation, the
// sign-in code gate). Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createSecurityExtras,
  codesIn,
  freshCodes,
} from '../src/sources/telegram-security-extras.js';
import {
  attestationPayload,
  b64urlToBytes,
  bytesToB64url,
  creationOptions,
  passkeysSupported,
} from '../src/web/passkey-codec.js';
import {
  CODE_DECLINED,
  createCodeGate,
  guardCodes,
  sharedCodes,
} from '../src/web/sign-in-code-guard.js';
import {
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const CODE = '48151';
const NOW = Date.parse('2026-03-01T12:00:00Z');

const Api = {
  DataJSON: named('DataJSON'),
  EmailVerifyPurposeLoginChange: named('EmailVerifyPurposeLoginChange'),
  EmailVerificationCode: named('EmailVerificationCode'),
  InputPasskeyCredentialPublicKey: named('InputPasskeyCredentialPublicKey'),
  InputPasskeyResponseRegister: named('InputPasskeyResponseRegister'),
  account: {
    SendVerifyEmailCode: named('SendVerifyEmailCode'),
    VerifyEmail: named('VerifyEmail'),
    ResetPassword: named('ResetPassword'),
    DeclinePasswordReset: named('DeclinePasswordReset'),
    GetPasskeys: named('GetPasskeys'),
    InitPasskeyRegistration: named('InitPasskeyRegistration'),
    RegisterPasskey: named('RegisterPasskey'),
    DeletePasskey: named('DeletePasskey'),
    InvalidateSignInCodes: named('InvalidateSignInCodes'),
  },
  auth: {
    RequestPasswordRecovery: named('RequestPasswordRecovery'),
    RecoverPassword: named('RecoverPassword'),
  },
  messages: { GetHistory: named('GetHistory') },
};

const make = (answer) => {
  const log = [];
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use(`peer:${chat}`) },
  };
  const actions = createSecurityExtras(env, {
    userClient: async () => fakeClient(answer, log),
  });
  return { actions, log };
};

const everything = (value) =>
  JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v));

test('every Api name the module uses is in layer 225', () => {
  const tl = readFileSync(
    new URL('../src/sources/telegram-api/layer-225.tl', import.meta.url),
    'utf8'
  );
  for (const method of [
    'account.sendVerifyEmailCode',
    'account.verifyEmail',
    'account.resetPassword',
    'account.declinePasswordReset',
    'account.getPasskeys',
    'account.initPasskeyRegistration',
    'account.registerPasskey',
    'account.deletePasskey',
    'account.invalidateSignInCodes',
    'auth.requestPasswordRecovery',
    'auth.recoverPassword',
    'messages.getHistory',
  ]) {
    assert.ok(tl.includes(`\n${method}#`), method);
  }
  for (const type of [
    'emailVerifyPurposeLoginChange',
    'emailVerificationCode',
    'inputPasskeyCredentialPublicKey',
    'inputPasskeyResponseRegister',
    'dataJSON',
  ]) {
    assert.ok(tl.includes(`\n${type}#`), type);
  }
});

test('login email: a code is sent for the login-change purpose, then verified', async () => {
  const { actions, log } = make((r) =>
    r.className === 'SendVerifyEmailCode'
      ? { emailPattern: 'a***@x.org', length: 6 }
      : { className: 'account.EmailVerified', email: 'new@x.org' }
  );
  assert.deepEqual(await actions.loginEmailSend({ email: 'new@x.org' }), {
    ok: true,
    pattern: 'a***@x.org',
    length: 6,
  });
  assert.equal(log[0].purpose.className, 'EmailVerifyPurposeLoginChange');
  assert.equal(log[0].email, 'new@x.org');
  const done = await actions.loginEmailVerify({ code: CODE });
  assert.deepEqual(done, { ok: true, email: 'new@x.org' });
  assert.equal(log[1].verification.code, CODE);
  assert.ok(!everything(done).includes(CODE));
});

test('login email: bad input is refused before Telegram, errors are codes', async () => {
  const { actions, log } = make(() => telegramError('EMAIL_NOT_ALLOWED'));
  assert.equal(
    (await actions.loginEmailSend({ email: 'nope' })).code,
    'bad-request'
  );
  assert.equal(
    (await actions.loginEmailVerify({ code: '' })).code,
    'bad-request'
  );
  assert.equal(log.length, 0);
  const refused = await actions.loginEmailSend({ email: 'a@b.co' });
  assert.equal(refused.code, 'email-not-allowed');
  const wrong = make(() => telegramError('CODE_INVALID'));
  const answer = await wrong.actions.loginEmailVerify({ code: CODE });
  assert.equal(answer.code, 'code-invalid');
  assert.ok(!everything(answer).includes(CODE));
});

test('recovery: a code to the recovery email, then the password is removed', async () => {
  const { actions, log } = make((r) =>
    r.className === 'RequestPasswordRecovery'
      ? { emailPattern: 'm***@x.org' }
      : {}
  );
  assert.deepEqual(await actions.recoveryRequest(), {
    ok: true,
    pattern: 'm***@x.org',
  });
  assert.deepEqual(await actions.recoveryConfirm({ code: CODE }), { ok: true });
  assert.equal(log[1].className, 'RecoverPassword');
  assert.equal(log[1].code, CODE);
  assert.equal(log[1].newSettings, undefined);
});

test('password reset: ok, a wait date, a recent decline, cancel', async () => {
  const until = Math.floor(NOW / 1000) + 7 * 86_400;
  const answers = [
    { className: 'account.ResetPasswordOk' },
    { className: 'account.ResetPasswordRequestedWait', untilDate: until },
    { className: 'account.ResetPasswordFailedWait', retryDate: until },
  ];
  const { actions } = make(() => answers.shift());
  assert.deepEqual(await actions.passwordReset(), { ok: true, result: 'ok' });
  assert.deepEqual(await actions.passwordReset(), {
    ok: true,
    result: 'wait',
    until: new Date(until * 1000).toISOString(),
  });
  const failed = await actions.passwordReset();
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'reset-wait');
  assert.equal(failed.until, new Date(until * 1000).toISOString());
  assert.deepEqual(await make(() => true).actions.passwordResetCancel(), {
    ok: true,
  });
});

test('passkeys: list, options, register and delete', async () => {
  const date = Math.floor(NOW / 1000);
  const { actions, log } = make((r) => {
    if (r.className === 'GetPasskeys') {
      return {
        passkeys: [
          { id: 'k1', name: 'Mac', date, lastUsageDate: date + 60 },
          { id: 'k2', name: 'Phone', date },
        ],
      };
    }
    if (r.className === 'InitPasskeyRegistration') {
      return { options: { data: '{"publicKey":{}}' } };
    }
    if (r.className === 'RegisterPasskey') {
      return { id: 'k3', name: 'New', date };
    }
    return true;
  });
  const list = await actions.passkeys();
  assert.equal(list.passkeys.length, 2);
  assert.equal(list.passkeys[1].lastUsed, null);
  assert.equal(list.passkeys[0].created, new Date(date * 1000).toISOString());
  assert.deepEqual(await actions.passkeyOptions(), {
    ok: true,
    options: '{"publicKey":{}}',
  });
  const attestation = bytesToB64url(Uint8Array.from([1, 2, 250, 251]));
  const added = await actions.passkeyRegister({
    id: 'abc',
    rawId: 'abc',
    clientData: '{"type":"webauthn.create"}',
    attestation,
  });
  assert.equal(added.passkey.id, 'k3');
  const register = log.find((r) => r.className === 'RegisterPasskey');
  assert.equal(register.credential.id, 'abc');
  assert.equal(
    register.credential.response.clientData.data,
    '{"type":"webauthn.create"}'
  );
  assert.deepEqual(
    [...register.credential.response.attestationData],
    [1, 2, 250, 251]
  );
  assert.deepEqual(await actions.passkeyDelete({ id: 'k1' }), { ok: true });
  assert.equal(log.at(-1).id, 'k1');
  assert.equal(
    (await actions.passkeyRegister({ id: 'a' })).code,
    'bad-request'
  );
  assert.equal((await actions.passkeyDelete({ id: '' })).code, 'bad-request');
});

test('sign-in codes: fresh codes of 777000 only, invalidation validated', async () => {
  const seconds = Math.floor(NOW / 1000);
  const { actions, log } = make((r) =>
    r.className === 'GetHistory'
      ? {
          messages: [
            {
              date: seconds - 60,
              message: `Login code: ${CODE}. Do not give it`,
            },
            { date: seconds - 3600, message: 'Login code: 99999.' },
            { date: seconds - 10, message: 'Version 1234567' },
          ],
        }
      : true
  );
  const got = await actions.signInCodes({}, () => NOW);
  assert.deepEqual(got, { ok: true, codes: [CODE] });
  assert.equal(log[0].peer, 'peer:777000');
  assert.deepEqual(await actions.invalidateCodes({ codes: [CODE] }), {
    ok: true,
  });
  assert.deepEqual(log.at(-1).codes, [CODE]);
  for (const codes of [[], ['abc'], ['1234'], Array(11).fill(CODE), 'x']) {
    assert.equal(
      (await actions.invalidateCodes({ codes })).code,
      'bad-request'
    );
  }
  assert.deepEqual(codesIn('a 12345 b 1234567 c 123456'), ['12345', '123456']);
  assert.deepEqual(freshCodes([{ date: 1, message: '55555' }], 1000), []);
});

test('the routes validate strictly and reach the account', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (body) => {
        calls.push([name, body]);
        return { ok: true };
      },
    }
  );
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('login-email-send', { email: 'x' }), 400);
  assert.equal(await status('login-email-send', { email: 'a@b.co' }), 200);
  assert.equal(await status('login-email-verify', {}), 400);
  assert.equal(await status('login-email-verify', { code: CODE }), 200);
  assert.equal(await status('recovery-confirm', { code: 'a b' }), 400);
  assert.equal(await status('passkey-register', { id: 'a' }), 400);
  assert.equal(
    await status('passkey-register', {
      id: 'a',
      rawId: 'a',
      clientData: '{}',
      attestation: 'AQ',
    }),
    200
  );
  assert.equal(await status('passkey-delete', { id: 5 }), 400);
  assert.equal(await status('invalidate-codes', { codes: ['abc'] }), 400);
  assert.equal(await status('invalidate-codes', { codes: [CODE] }), 200);
  assert.equal(await status('password-reset', {}), 200);
  assert.equal(await status('passkeys', {}), 200);
  assert.deepEqual(calls.at(-1), ['passkeys', {}]);
});

test('base64url round trips bytes, with and without padding', () => {
  for (const bytes of [[], [0], [255, 254], [1, 2, 3, 250, 251, 252, 253]]) {
    const text = bytesToB64url(Uint8Array.from(bytes));
    assert.ok(!/[+/=]/.test(text), text);
    assert.deepEqual([...b64urlToBytes(text)], bytes);
  }
  assert.equal(bytesToB64url(Uint8Array.from([251, 255])), '-_8');
  assert.deepEqual([...b64urlToBytes('-_8')], [251, 255]);
  assert.deepEqual([...b64urlToBytes('-_8=')], [251, 255]);
  assert.deepEqual(
    [...b64urlToBytes(bytesToB64url(new Uint8Array([9]).buffer))],
    [9]
  );
});

test('creationOptions turns the JSON into bytes for the browser', () => {
  const challenge = bytesToB64url(Uint8Array.from([1, 2, 3]));
  const json = JSON.stringify({
    publicKey: {
      challenge,
      rp: { name: 'Telegram' },
      user: { id: bytesToB64url(Uint8Array.from([7, 8])), name: 'me' },
      excludeCredentials: [
        { type: 'public-key', id: bytesToB64url(Uint8Array.from([9])) },
      ],
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    },
  });
  const options = creationOptions(json).publicKey;
  assert.deepEqual([...options.challenge], [1, 2, 3]);
  assert.deepEqual([...options.user.id], [7, 8]);
  assert.deepEqual([...options.excludeCredentials[0].id], [9]);
  assert.equal(options.excludeCredentials[0].type, 'public-key');
  assert.equal(options.rp.name, 'Telegram');
  // The options may come bare, without the publicKey wrapper.
  const bare = creationOptions(JSON.stringify(JSON.parse(json).publicKey));
  assert.deepEqual([...bare.publicKey.challenge], [1, 2, 3]);
  assert.deepEqual(bare.publicKey.excludeCredentials.length, 1);
  assert.equal(creationOptions('not json'), null);
  assert.equal(creationOptions('{"publicKey":{}}'), null);
});

test('attestationPayload makes the strings the route takes', () => {
  const enc = new TextEncoder();
  const credential = {
    id: 'cred-id',
    rawId: Uint8Array.from([5, 6, 7]).buffer,
    response: {
      clientDataJSON: enc.encode('{"type":"webauthn.create"}').buffer,
      attestationObject: Uint8Array.from([250, 251]).buffer,
    },
  };
  assert.deepEqual(attestationPayload(credential), {
    id: 'cred-id',
    rawId: bytesToB64url(Uint8Array.from([5, 6, 7])),
    clientData: '{"type":"webauthn.create"}',
    attestation: '-vs',
  });
  assert.equal(attestationPayload(null), null);
  assert.equal(
    attestationPayload({ rawId: new ArrayBuffer(1), response: {} }),
    null
  );
  assert.equal(passkeysSupported({}), false);
  assert.equal(passkeysSupported({ credentials: { create() {} } }), true);
});

test('the sign-in code gate asks only when a fresh code is shared', async () => {
  const asked = [];
  const told = [];
  let answer = true;
  const gate = createCodeGate({
    fresh: async () => [CODE],
    ask: async (offer) => {
      asked.push(offer.codes);
      return answer;
    },
    invalidate: async (codes) => told.push(codes),
  });
  assert.deepEqual(await gate.confirm('see you at 7'), { ok: true });
  assert.deepEqual(await gate.confirm('my id is 99999'), { ok: true });
  assert.equal(asked.length + told.length, 0);
  assert.deepEqual(await gate.confirm(`it is ${CODE}`), { ok: true });
  assert.deepEqual(asked, [[CODE]]);
  assert.deepEqual(told, [[CODE]]);
  answer = false;
  assert.deepEqual(await gate.confirm(`${CODE}!`), { ok: false });
  assert.equal(told.length, 1, 'a cancelled send invalidates nothing');
  assert.deepEqual(sharedCodes('1 12345 2', ['12345', '54321']), ['12345']);
});

test('a failing code lookup never blocks writing; guardCodes stops a declined send', async () => {
  const broken = createCodeGate({
    fresh: async () => {
      throw new Error('offline');
    },
    ask: async () => false,
    invalidate: async () => {},
  });
  assert.deepEqual(await broken.confirm(CODE), { ok: true });
  const sent = [];
  const deny = createCodeGate({
    fresh: async () => [CODE],
    ask: async () => false,
    invalidate: async () => {},
  });
  const api = guardCodes(
    { sendMessage: async (body) => (sent.push(body), { status: 'sent' }) },
    deny
  );
  assert.deepEqual(
    await api.sendMessage({ source: 'telegram', text: CODE }),
    CODE_DECLINED
  );
  assert.equal(sent.length, 0);
  assert.deepEqual(await api.sendMessage({ source: 'telegram', text: 'hi' }), {
    status: 'sent',
  });
  assert.deepEqual(await api.sendMessage({ source: 'other', text: CODE }), {
    status: 'sent',
  });
  assert.equal(sent.length, 2);
});
