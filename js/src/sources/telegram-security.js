/**
 * The security extras of Settings → Privacy and Security (R-Y177; learned,
 * never copied):
 * - `securityState()` — account.getPassword + account.getAccountTTL +
 *   account.getContentSettings → `{ ok, password: { has, hint, hasRecovery,
 *   emailPending, emailPattern, resetPending }, accountTtlDays, content: {
 *   enabled, canChange } }`; a part Telegram refuses is `null`, all of them
 *   refused is an error;
 * - `setPassword({ current?, password, hint, email? })` — the two-step
 *   verification set or changed: account.updatePasswordSettings with the
 *   check and the digest made by the `telegram` package's own SRP helper
 *   (`computeCheck`, `computeDigest`); a recovery email Telegram must
 *   confirm answers `{ ok: false, code: 'email-unconfirmed', codeLength }`;
 * - `removePassword({ current })` — the same call with an empty digest;
 * - `confirmPasswordEmail({ code })`, `resendPasswordEmail()`,
 *   `cancelPasswordEmail()` — account.confirmPasswordEmail / resend / cancel;
 * - `setAccountTtl({ days })` — account.setAccountTTL (30, 90, 180, 365, 548, 730; R-Y212);
 * - `setSensitive({ enabled })` — account.setContentSettings, only when
 *   Telegram says it can be changed;
 * - `setSessionSettings({ hash, secretChats, calls })` —
 *   account.changeAuthorizationSettings; `setSessionTtl({ days })` —
 *   account.setAuthorizationTTL.
 * Passwords and codes live only in the request in memory: never logged,
 * stored, put in an error or returned. Telegram's errors become codes.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

export const ACCOUNT_TTL_DAYS = [30, 90, 180, 365, 548, 730];
export const SESSION_TTL_DAYS = [7, 30, 90, 180, 365];
export const PASSWORD_MAX = 256;
export const HINT_MAX = 255;

const CODES = {
  PASSWORD_HASH_INVALID: 'wrong-password',
  EMAIL_UNCONFIRMED: 'email-unconfirmed',
  PASSWORD_TOO_FRESH: 'too-fresh',
  SESSION_TOO_FRESH: 'too-fresh',
  SRP_ID_INVALID: 'srp-invalid',
  SRP_PASSWORD_CHANGED: 'srp-invalid',
  NEW_SETTINGS_INVALID: 'bad-settings',
  EMAIL_INVALID: 'email-invalid',
  CODE_INVALID: 'code-invalid',
  CODE_EMPTY: 'code-invalid',
  EMAIL_HASH_EXPIRED: 'code-expired',
  HASH_INVALID: 'hash-invalid',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const bad = (code) => ({ ok: false, error: code, code });

const nameOf = (error) => String(error?.errorMessage ?? error?.message ?? '');

// The answer for an error: the e-mail code's length rides along. Only the
// error's name is read, never anything of the request.
const failed = (error) => {
  const answer = failure(error);
  if (answer.code === 'email-unconfirmed') {
    const length = Number(
      /EMAIL_UNCONFIRMED_?(\d+)/.exec(nameOf(error))?.[1] ?? error?.codeLength
    );
    return { ...answer, codeLength: Number.isFinite(length) ? length : 6 };
  }
  return answer;
};

const ask = (env, c, request) =>
  runIn(env, 'security', () => c.client.invoke(request));

const passwordOf = (answer) => ({
  has: Boolean(answer?.hasPassword),
  hint: answer?.hint ?? '',
  hasRecovery: Boolean(answer?.hasRecovery),
  emailPending: Boolean(answer?.emailUnconfirmedPattern),
  emailPattern: answer?.emailUnconfirmedPattern ?? '',
  resetPending: Number(answer?.pendingResetDate ?? 0) > 0,
  // The login email's pattern and the date a reset becomes final (R-Y218).
  loginEmail: answer?.loginEmailPattern ?? '',
  resetDate: answer?.pendingResetDate
    ? new Date(Number(answer.pendingResetDate) * 1000).toISOString()
    : null,
});

const settle = async (promise) => {
  try {
    return { value: await promise };
  } catch (error) {
    return { error };
  }
};

const readState = (env, userClient) => async () =>
  connected(env, userClient, failed, async (c) => {
    const [pwd, ttl, content] = await Promise.all([
      settle(ask(env, c, new c.Api.account.GetPassword())),
      settle(ask(env, c, new c.Api.account.GetAccountTTL())),
      settle(ask(env, c, new c.Api.account.GetContentSettings())),
    ]);
    if (pwd.error && ttl.error && content.error) {
      return failed(pwd.error);
    }
    return {
      ok: true,
      password: pwd.value ? passwordOf(pwd.value) : null,
      accountTtlDays: ttl.value ? Number(ttl.value.days ?? 0) : null,
      content: content.value
        ? {
            enabled: Boolean(content.value.sensitiveEnabled),
            canChange: Boolean(content.value.sensitiveCanChange),
          }
        : null,
    };
  });

// Telegram's salt for a new password gets 32 random bytes of ours.
const freshAlgo = (c, pwd) => {
  const algo = pwd.newAlgo;
  if (algo?.className === 'PasswordKdfAlgoUnknown' || !algo?.salt1) {
    return null;
  }
  algo.salt1 = Buffer.concat([algo.salt1, c.helpers.generateRandomBytes(32)]);
  return algo;
};

const checkOf = (c, srp, pwd, current) =>
  pwd.hasPassword
    ? srp.computeCheck(pwd, current)
    : new c.Api.InputCheckPasswordEmpty();

// One try of the update: the SRP data read fresh, the check and the digest
// made by the package's helper.
const tryUpdate = async (env, c, srp, { current, password, hint, email }) => {
  const pwd = await ask(env, c, new c.Api.account.GetPassword());
  if (pwd.hasPassword && !current) {
    return bad('password-required');
  }
  const algo = freshAlgo(c, pwd);
  if (!algo) {
    return bad('failed');
  }
  const check = await checkOf(c, srp, pwd, current);
  const digest = password
    ? await srp.computeDigest(algo, password)
    : Buffer.alloc(0);
  await ask(
    env,
    c,
    new c.Api.account.UpdatePasswordSettings({
      password: check,
      newSettings: new c.Api.account.PasswordInputSettings({
        newAlgo: algo,
        newPasswordHash: digest,
        hint: password ? hint : '',
        email: password ? email : '',
      }),
    })
  );
  return { ok: true };
};

// The call is repeated once when Telegram says its SRP data went stale.
const update = async (env, c, fields) => {
  const { password: srp } = await env.importer();
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await tryUpdate(env, c, srp, fields);
    } catch (error) {
      if (attempt === 0 && failure(error).code === 'srp-invalid') {
        continue;
      }
      return failed(error);
    }
  }
};

const text = (v) => (typeof v === 'string' ? v : '');

const writePassword =
  (env, userClient) =>
  async (request = {}) => {
    const password = text(request.password);
    const hint = text(request.hint);
    const email = text(request.email);
    const current = text(request.current);
    if (
      !password ||
      password.length > PASSWORD_MAX ||
      current.length > PASSWORD_MAX ||
      hint.length > HINT_MAX
    ) {
      return bad('bad-request');
    }
    if (hint && hint.toLowerCase().includes(password.toLowerCase())) {
      return bad('hint-is-password');
    }
    if (current && current === password) {
      return bad('same-password');
    }
    return connected(env, userClient, failed, (c) =>
      update(env, c, { current, password, hint, email: email || undefined })
    );
  };

const dropPassword =
  (env, userClient) =>
  async (request = {}) => {
    const current = text(request.current);
    if (!current || current.length > PASSWORD_MAX) {
      return bad('bad-request');
    }
    return connected(env, userClient, failed, (c) =>
      update(env, c, { current, password: '', hint: '', email: '' })
    );
  };

// A write with nothing to read back: `build(c)` is its request.
const plain = (env, userClient, build) =>
  connected(env, userClient, failed, async (c) => {
    await ask(env, c, build(c));
    return { ok: true };
  });

const confirmEmail =
  (env, userClient) =>
  async (request = {}) => {
    const code = text(request.code);
    if (!/^[0-9A-Za-z]{1,16}$/.test(code)) {
      return bad('bad-request');
    }
    return plain(
      env,
      userClient,
      (c) => new c.Api.account.ConfirmPasswordEmail({ code })
    );
  };

const resendEmail = (env, userClient) => async () =>
  plain(env, userClient, (c) => new c.Api.account.ResendPasswordEmail());

const cancelEmail = (env, userClient) => async () =>
  plain(env, userClient, (c) => new c.Api.account.CancelPasswordEmail());

const writeAccountTtl =
  (env, userClient) =>
  async (request = {}) => {
    const { days } = request;
    if (!ACCOUNT_TTL_DAYS.includes(days)) {
      return bad('bad-request');
    }
    const done = await plain(
      env,
      userClient,
      (c) =>
        new c.Api.account.SetAccountTTL({
          ttl: new c.Api.AccountDaysTTL({ days }),
        })
    );
    return done.ok ? { ok: true, days } : done;
  };

const writeSensitive =
  (env, userClient) =>
  async (request = {}) => {
    if (typeof request.enabled !== 'boolean') {
      return bad('bad-request');
    }
    return connected(env, userClient, failed, async (c) => {
      const now = await ask(env, c, new c.Api.account.GetContentSettings());
      if (!now?.sensitiveCanChange) {
        return bad('cannot-change');
      }
      await ask(
        env,
        c,
        new c.Api.account.SetContentSettings(
          request.enabled ? { sensitiveEnabled: true } : {}
        )
      );
      return { ok: true, enabled: request.enabled };
    });
  };

const writeSession =
  (env, userClient) =>
  async (request = {}) => {
    const { hash, secretChats, calls } = request;
    if (
      !/^-?\d{1,20}$/.test(String(hash ?? '')) ||
      typeof secretChats !== 'boolean' ||
      typeof calls !== 'boolean'
    ) {
      return bad('bad-request');
    }
    const done = await plain(
      env,
      userClient,
      (c) =>
        new c.Api.account.ChangeAuthorizationSettings({
          hash: c.helpers.returnBigInt(String(hash)),
          encryptedRequestsDisabled: !secretChats,
          callRequestsDisabled: !calls,
        })
    );
    return done.ok ? { ok: true, secretChats, calls } : done;
  };

const writeSessionTtl =
  (env, userClient) =>
  async (request = {}) => {
    const { days } = request;
    if (!SESSION_TTL_DAYS.includes(days)) {
      return bad('bad-request');
    }
    const done = await plain(
      env,
      userClient,
      (c) =>
        new c.Api.account.SetAuthorizationTTL({ authorizationTtlDays: days })
    );
    return done.ok ? { ok: true, days } : done;
  };

export const createSecurity = (env, context) => ({
  securityState: readState(env, context.userClient),
  setPassword: writePassword(env, context.userClient),
  removePassword: dropPassword(env, context.userClient),
  confirmPasswordEmail: confirmEmail(env, context.userClient),
  resendPasswordEmail: resendEmail(env, context.userClient),
  cancelPasswordEmail: cancelEmail(env, context.userClient),
  setAccountTtl: writeAccountTtl(env, context.userClient),
  setSensitive: writeSensitive(env, context.userClient),
  setSessionSettings: writeSession(env, context.userClient),
  setSessionTtl: writeSessionTtl(env, context.userClient),
});
