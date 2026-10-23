// Security extras (R-Y177): the two-step verification state, setting,
// changing and removing it with the package's SRP helper (faked), the
// recovery email's code, the account's self-destruct, sensitive content and
// the per-session settings; the secrets never appear in any answer or
// error; the routes' validation. Fake clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSecurity } from '../src/sources/telegram-security.js';
import {
  passwordProblem,
  monthsOfDays,
  daysOfMonths,
} from '../src/web/chat-security.js';
import {
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const SECRET = 'hunter2-Secret-Pass';
const OLD = 'old-Secret-Pass-9';
const CODE = '48151';

const Api = {
  AccountDaysTTL: named('AccountDaysTTL'),
  InputCheckPasswordEmpty: named('InputCheckPasswordEmpty'),
  account: {
    GetPassword: named('GetPassword'),
    UpdatePasswordSettings: named('UpdatePasswordSettings'),
    PasswordInputSettings: named('PasswordInputSettings'),
    ConfirmPasswordEmail: named('ConfirmPasswordEmail'),
    ResendPasswordEmail: named('ResendPasswordEmail'),
    CancelPasswordEmail: named('CancelPasswordEmail'),
    GetAccountTTL: named('GetAccountTTL'),
    SetAccountTTL: named('SetAccountTTL'),
    GetContentSettings: named('GetContentSettings'),
    SetContentSettings: named('SetContentSettings'),
    ChangeAuthorizationSettings: named('ChangeAuthorizationSettings'),
    SetAuthorizationTTL: named('SetAuthorizationTTL'),
  },
};

// The package's SRP helper, faked: the check and the digest hide the
// password the way the real ones do (nothing of it is readable).
const password = {
  computeCheck: async (_pwd, given) => ({
    className: 'InputCheckPasswordSRP',
    srpId: 1n,
    m1: Buffer.from(String(given.length)),
  }),
  computeDigest: async (_algo, given) => Buffer.from(`d${given.length}`),
};
const algo = () => ({
  className:
    'PasswordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow',
  salt1: Buffer.from('s1'),
});
const pwdAnswer = (fields = {}) => ({
  className: 'account.Password',
  hasPassword: false,
  newAlgo: algo(),
  ...fields,
});

const make = (answer) => {
  const log = [];
  const env = {
    importer: async () => ({
      Api,
      helpers: { ...helpers, generateRandomBytes: (n) => Buffer.alloc(n, 1) },
      password,
    }),
  };
  const actions = createSecurity(env, {
    userClient: async () => fakeClient(answer, log),
  });
  return { actions, log };
};

const everything = (value) =>
  JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v));

test('every Api name the module uses is in layer 225', () => {
  const tl = readFileSync(
    new URL('../src/sources/telegram-api/layer-232.tl', import.meta.url),
    'utf8'
  );
  for (const method of [
    'account.getPassword',
    'account.updatePasswordSettings',
    'account.confirmPasswordEmail',
    'account.resendPasswordEmail',
    'account.cancelPasswordEmail',
    'account.getAccountTTL',
    'account.setAccountTTL',
    'account.getContentSettings',
    'account.setContentSettings',
    'account.changeAuthorizationSettings',
    'account.setAuthorizationTTL',
  ]) {
    assert.ok(tl.includes(`\n${method}#`), method);
  }
  assert.ok(tl.includes('\naccountDaysTTL#'));
  assert.ok(tl.includes('\ninputCheckPasswordEmpty#'));
  assert.ok(tl.includes('\naccount.passwordInputSettings#'));
});

test('securityState: the password, the TTL and the content settings', async () => {
  const { actions } = make((r) => {
    if (r.className === 'GetPassword') {
      return pwdAnswer({
        hasPassword: true,
        hint: 'pet',
        hasRecovery: true,
        emailUnconfirmedPattern: 'a***@b.c',
      });
    }
    if (r.className === 'GetAccountTTL') {
      return { days: 180 };
    }
    return { sensitiveEnabled: true, sensitiveCanChange: true };
  });
  assert.deepEqual(await actions.securityState(), {
    ok: true,
    password: {
      has: true,
      hint: 'pet',
      hasRecovery: true,
      emailPending: true,
      emailPattern: 'a***@b.c',
      resetPending: false,
    },
    accountTtlDays: 180,
    content: { enabled: true, canChange: true },
  });
});

test('securityState: a part refused is null, all refused is an error', async () => {
  const some = make((r) =>
    r.className === 'GetAccountTTL'
      ? telegramError('FLOOD_WAIT_3')
      : r.className === 'GetPassword'
        ? pwdAnswer()
        : { sensitiveEnabled: false, sensitiveCanChange: false }
  );
  const got = await some.actions.securityState();
  assert.equal(got.ok, true);
  assert.equal(got.accountTtlDays, null);
  assert.equal(got.password.has, false);
  const none = make(() => telegramError('FLOOD_WAIT_3'));
  assert.equal((await none.actions.securityState()).code, 'flood');
});

test('setPassword: a first password, hint and email, no check needed', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetPassword' ? pwdAnswer() : true
  );
  const got = await actions.setPassword({
    password: SECRET,
    hint: 'a hint',
    email: 'me@example.org',
  });
  assert.deepEqual(got, { ok: true });
  const update = log.find((r) => r.className === 'UpdatePasswordSettings');
  assert.equal(update.password.className, 'InputCheckPasswordEmpty');
  assert.equal(update.newSettings.hint, 'a hint');
  assert.equal(update.newSettings.email, 'me@example.org');
  assert.deepEqual(update.newSettings.newPasswordHash, Buffer.from('d19'));
  // The salt got random bytes of ours.
  assert.equal(update.newSettings.newAlgo.salt1.length, 2 + 32);
  assert.ok(!everything(got).includes(SECRET));
});

test('setPassword: changing asks the current password and checks it', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetPassword' ? pwdAnswer({ hasPassword: true }) : true
  );
  assert.equal(
    (await actions.setPassword({ password: SECRET })).code,
    'password-required'
  );
  assert.deepEqual(
    await actions.setPassword({ current: OLD, password: SECRET }),
    {
      ok: true,
    }
  );
  const update = log.findLast((r) => r.className === 'UpdatePasswordSettings');
  assert.equal(update.password.className, 'InputCheckPasswordSRP');
});

test('setPassword: refusals before anything is asked', async () => {
  const { actions, log } = make(() => true);
  for (const request of [
    {},
    { password: '' },
    { password: SECRET, hint: `my ${SECRET} hint` },
    { current: SECRET, password: SECRET },
    { password: 'x'.repeat(300) },
  ]) {
    assert.equal((await actions.setPassword(request)).ok, false);
  }
  assert.equal(log.length, 0);
});

test('setPassword: a recovery email to confirm asks for the code', async () => {
  const { actions } = make((r) =>
    r.className === 'GetPassword'
      ? pwdAnswer()
      : telegramError('EMAIL_UNCONFIRMED_6')
  );
  const got = await actions.setPassword({
    password: SECRET,
    email: 'me@example.org',
  });
  assert.deepEqual(
    [got.ok, got.code, got.codeLength],
    [false, 'email-unconfirmed', 6]
  );
  assert.ok(!everything(got).includes(SECRET));
});

test('removePassword sends an empty digest after the check', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetPassword' ? pwdAnswer({ hasPassword: true }) : true
  );
  assert.equal((await actions.removePassword({})).code, 'bad-request');
  assert.deepEqual(await actions.removePassword({ current: OLD }), {
    ok: true,
  });
  const update = log.find((r) => r.className === 'UpdatePasswordSettings');
  assert.equal(update.newSettings.newPasswordHash.length, 0);
  assert.equal(update.password.className, 'InputCheckPasswordSRP');
});

test('Telegram errors become codes and carry no secret', async () => {
  const names = {
    PASSWORD_HASH_INVALID: 'wrong-password',
    PASSWORD_TOO_FRESH_86400: 'too-fresh',
    EMAIL_INVALID: 'email-invalid',
    FLOOD_WAIT_30: 'flood',
    SOMETHING_ELSE: 'failed',
  };
  for (const [name, code] of Object.entries(names)) {
    // The error text even tries to carry the secret.
    const { actions } = make((r) =>
      r.className === 'GetPassword'
        ? pwdAnswer({ hasPassword: true })
        : telegramError(`${name} ${SECRET} ${OLD}`)
    );
    const got = await actions.setPassword({ current: OLD, password: SECRET });
    assert.equal(got.ok, false);
    assert.equal(got.code, code, name);
    assert.ok(!everything(got).includes(SECRET), name);
    assert.ok(!everything(got).includes(OLD), name);
    const removed = await actions.removePassword({ current: OLD });
    assert.ok(!everything(removed).includes(OLD), name);
  }
});

test('a stale SRP id is retried once; twice is a code', async () => {
  let updates = 0;
  const once = make((r) => {
    if (r.className === 'GetPassword') {
      return pwdAnswer();
    }
    updates += 1;
    return updates === 1 ? telegramError('SRP_ID_INVALID') : true;
  });
  assert.equal((await once.actions.setPassword({ password: SECRET })).ok, true);
  assert.equal(updates, 2);
  const twice = make((r) =>
    r.className === 'GetPassword'
      ? pwdAnswer()
      : telegramError('SRP_ID_INVALID')
  );
  assert.equal(
    (await twice.actions.setPassword({ password: SECRET })).code,
    'srp-invalid'
  );
});

test('a thrown error from the SRP helper leaks nothing', async () => {
  const log = [];
  const env = {
    importer: async () => ({
      Api,
      helpers,
      password: {
        computeCheck: async (_p, given) => {
          throw new Error(`broken ${given}`);
        },
        computeDigest: async () => Buffer.alloc(1),
      },
    }),
  };
  const actions = createSecurity(env, {
    userClient: async () =>
      fakeClient(
        (r) =>
          r.className === 'GetPassword'
            ? pwdAnswer({ hasPassword: true })
            : true,
        log
      ),
  });
  const got = await actions.setPassword({ current: OLD, password: SECRET });
  assert.deepEqual([got.ok, got.code], [false, 'failed']);
  assert.ok(!everything(got).includes(OLD));
});

test('the email code: confirm, resend, cancel', async () => {
  const { actions, log } = make(() => true);
  assert.equal(
    (await actions.confirmPasswordEmail({ code: 'no way' })).ok,
    false
  );
  assert.deepEqual(await actions.confirmPasswordEmail({ code: CODE }), {
    ok: true,
  });
  assert.deepEqual(await actions.resendPasswordEmail(), { ok: true });
  assert.deepEqual(await actions.cancelPasswordEmail(), { ok: true });
  assert.deepEqual(
    log.map((r) => r.className),
    ['ConfirmPasswordEmail', 'ResendPasswordEmail', 'CancelPasswordEmail']
  );
  const wrong = make(() => telegramError('CODE_INVALID'));
  const refused = await wrong.actions.confirmPasswordEmail({ code: CODE });
  assert.equal(refused.code, 'code-invalid');
  assert.ok(!everything(refused).includes(CODE));
  const expired = make(() => telegramError('EMAIL_HASH_EXPIRED'));
  assert.equal(
    (await expired.actions.confirmPasswordEmail({ code: CODE })).code,
    'code-expired'
  );
});

test('setAccountTtl sends the days; others are refused', async () => {
  const { actions, log } = make(() => true);
  assert.deepEqual(await actions.setAccountTtl({ days: 90 }), {
    ok: true,
    days: 90,
  });
  assert.equal(log[0].ttl.days, 90);
  assert.equal((await actions.setAccountTtl({ days: 45 })).code, 'bad-request');
  assert.equal(log.length, 1);
});

test('setSensitive only when Telegram lets it change', async () => {
  const locked = make(() => ({
    sensitiveEnabled: false,
    sensitiveCanChange: false,
  }));
  assert.equal(
    (await locked.actions.setSensitive({ enabled: true })).code,
    'cannot-change'
  );
  assert.equal(locked.log.length, 1);
  const open = make(() => ({
    sensitiveEnabled: false,
    sensitiveCanChange: true,
  }));
  assert.deepEqual(await open.actions.setSensitive({ enabled: true }), {
    ok: true,
    enabled: true,
  });
  assert.equal(open.log[1].sensitiveEnabled, true);
  await open.actions.setSensitive({ enabled: false });
  assert.equal(open.log[3].sensitiveEnabled, undefined);
  assert.equal((await open.actions.setSensitive({})).code, 'bad-request');
});

test('setSessionSettings and setSessionTtl', async () => {
  const { actions, log } = make(() => true);
  assert.deepEqual(
    await actions.setSessionSettings({
      hash: '77',
      secretChats: false,
      calls: true,
    }),
    { ok: true, secretChats: false, calls: true }
  );
  assert.equal(log[0].hash, 77n);
  assert.equal(log[0].encryptedRequestsDisabled, true);
  assert.equal(log[0].callRequestsDisabled, false);
  assert.equal(
    (
      await actions.setSessionSettings({
        hash: 'x',
        secretChats: true,
        calls: true,
      })
    ).code,
    'bad-request'
  );
  assert.deepEqual(await actions.setSessionTtl({ days: 30 }), {
    ok: true,
    days: 30,
  });
  assert.equal(log[1].authorizationTtlDays, 30);
  assert.equal((await actions.setSessionTtl({ days: 3 })).code, 'bad-request');
  const old = make(() => telegramError('HASH_INVALID'));
  assert.equal(
    (
      await old.actions.setSessionSettings({
        hash: '1',
        secretChats: true,
        calls: true,
      })
    ).code,
    'hash-invalid'
  );
});

test('the routes validate their bodies', async () => {
  const seen = [];
  const note = (name) => async (body) => {
    seen.push([name, body]);
    return { ok: true };
  };
  const account = {
    securityState: note('state'),
    setPassword: note('set'),
    removePassword: note('remove'),
    confirmPasswordEmail: note('confirm'),
    resendPasswordEmail: note('resend'),
    cancelPasswordEmail: note('cancel'),
    setAccountTtl: note('ttl'),
    setSensitive: note('sensitive'),
    setSessionSettings: note('session'),
    setSessionTtl: note('sttl'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('security', {}), 200);
  assert.equal(
    await status('password-set', {
      password: SECRET,
      hint: 'h',
      email: 'a@b.co',
    }),
    200
  );
  assert.equal(
    await status('password-set', { password: SECRET, email: 'nope' }),
    400
  );
  assert.equal(await status('password-set', { password: '' }), 400);
  assert.equal(await status('password-set', { password: 5 }), 400);
  assert.equal(await status('password-remove', { current: OLD }), 200);
  assert.equal(await status('password-remove', {}), 400);
  assert.equal(await status('password-email-confirm', { code: CODE }), 200);
  assert.equal(await status('password-email-confirm', { code: '12 34' }), 400);
  assert.equal(await status('password-email-resend', {}), 200);
  assert.equal(await status('password-email-cancel', {}), 200);
  assert.equal(await status('account-ttl-set', { days: 365 }), 200);
  assert.equal(await status('account-ttl-set', { days: 7 }), 400);
  assert.equal(await status('sensitive-set', { enabled: false }), 200);
  assert.equal(await status('sensitive-set', { enabled: 'yes' }), 400);
  assert.equal(
    await status('session-settings', {
      hash: '-5',
      secretChats: true,
      calls: false,
    }),
    200
  );
  assert.equal(
    await status('session-settings', { hash: '5', calls: false }),
    400
  );
  assert.equal(await status('session-ttl-set', { days: 7 }), 200);
  assert.equal(await status('session-ttl-set', { days: 8 }), 400);
  const bare = await post('security', {}, {});
  assert.equal(bare.status, 400);
  assert.equal(seen.length, 10);
});

test('the page checks a password form before sending', () => {
  const form = { current: '', password: 'a', repeat: 'a', hint: '', email: '' };
  assert.equal(passwordProblem(form, false), null);
  assert.equal(passwordProblem(form, true), 'need-current');
  assert.equal(
    passwordProblem({ ...form, password: '' }, false),
    'need-password'
  );
  assert.equal(passwordProblem({ ...form, repeat: 'b' }, false), 'mismatch');
  assert.equal(
    passwordProblem({ ...form, current: 'a' }, true),
    'same-password'
  );
  assert.equal(
    passwordProblem({ ...form, hint: 'my A' }, false),
    'hint-is-password'
  );
});

test('the self-destruct months and days map both ways', () => {
  assert.equal(daysOfMonths(12), 365);
  assert.equal(monthsOfDays(90), 3);
  assert.equal(monthsOfDays(45), null);
  assert.equal(daysOfMonths(2), null);
});
