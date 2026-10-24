/**
 * More of Settings → Privacy and Security (R-Y218; learned, never copied):
 * - `loginEmailSend({ email })` — account.sendVerifyEmailCode with the
 *   purpose "login change" → `{ ok, pattern, length }`;
 *   `loginEmailVerify({ code })` — account.verifyEmail → `{ ok, email }`;
 * - `recoveryRequest()` — auth.requestPasswordRecovery (the recovery email
 *   gets a code) → `{ ok, pattern }`; `recoveryConfirm({ code })` —
 *   auth.recoverPassword with no new settings: the password is removed;
 * - `passwordReset()` — account.resetPassword → `{ ok, result: 'ok' |
 *   'wait' | 'failed-wait', until }`; `passwordResetCancel()` —
 *   account.declinePasswordReset;
 * - `passkeys()` — account.getPasskeys; `passkeyOptions()` —
 *   account.initPasskeyRegistration → `{ ok, options }` (WebAuthn JSON);
 *   `passkeyRegister({ id, rawId, clientData, attestation })` —
 *   account.registerPasskey (attestation in base64url);
 *   `passkeyDelete({ id })` — account.deletePasskey;
 * - `signInCodes()` — the login codes Telegram's service account (777000)
 *   sent in the last few minutes; `invalidateCodes({ codes })` —
 *   account.invalidateSignInCodes, asked when the user shares such a code.
 * A code is never logged or put in an error. Telegram's errors become codes.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  EMAIL_INVALID: 'email-invalid',
  EMAIL_NOT_ALLOWED: 'email-not-allowed',
  EMAIL_VERIFY_EXPIRED: 'code-expired',
  CODE_INVALID: 'code-invalid',
  CODE_EMPTY: 'code-invalid',
  CODE_HASH_INVALID: 'code-invalid',
  PASSWORD_RECOVERY_NA: 'recovery-na',
  PASSWORD_RECOVERY_EXPIRED: 'code-expired',
  PASSWORD_HASH_INVALID: 'wrong-password',
  RESET_REQUEST_MISSING: 'no-reset',
  PASSKEY_CREDENTIAL_INVALID: 'passkey-invalid',
  PASSKEY_ID_INVALID: 'passkey-invalid',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const bad = { ok: false, error: 'bad-request', code: 'bad-request' };

/** The service account that sends login codes. */
export const SERVICE_ID = '777000';
/** How long a login code counts as fresh, in seconds. */
export const FRESH_SECONDS = 5 * 60;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const CODE = /^[0-9A-Za-z]{1,16}$/;
const text = (v) => (typeof v === 'string' ? v : '');

/** The 5 or 6 digit codes in a text (a pure helper). */
export const codesIn = (body) =>
  [...String(body ?? '').matchAll(/(?<!\d)\d{5,6}(?!\d)/g)].map((m) => m[0]);

/** The fresh codes of service messages `[{ message, date }]`. */
export const freshCodes = (messages, nowSeconds) => [
  ...new Set(
    (messages ?? [])
      .filter((m) => nowSeconds - Number(m.date ?? 0) <= FRESH_SECONDS)
      .flatMap((m) => codesIn(m.message))
  ),
];

const toIso = (seconds) =>
  seconds ? new Date(Number(seconds) * 1000).toISOString() : null;

const passkeyOf = (p) => ({
  id: String(p.id),
  name: p.name ?? '',
  created: toIso(p.date),
  lastUsed: toIso(p.lastUsageDate),
});

const RESETS = {
  'account.ResetPasswordOk': () => ({ result: 'ok' }),
  'account.ResetPasswordRequestedWait': (a) => ({
    result: 'wait',
    until: toIso(a.untilDate),
  }),
  // Too early to ask again: an error that carries the date.
  'account.ResetPasswordFailedWait': (a) => ({
    ...{ ok: false, error: 'failed-wait', code: 'reset-wait' },
    result: 'failed-wait',
    until: toIso(a.retryDate),
  }),
};

const registerOk = (r) =>
  [r.id, r.rawId, r.clientData, r.attestation].every(
    (v) => typeof v === 'string' && v !== '' && v.length < 100_000
  );

const registration = (c, r) =>
  new c.Api.account.RegisterPasskey({
    credential: new c.Api.InputPasskeyCredentialPublicKey({
      id: r.id,
      rawId: r.rawId,
      response: new c.Api.InputPasskeyResponseRegister({
        clientData: new c.Api.DataJSON({ data: r.clientData }),
        attestationData: Buffer.from(r.attestation, 'base64url'),
      }),
    }),
  });

const historyOf = (c, peer) =>
  new c.Api.messages.GetHistory({
    peer,
    ...{ offsetId: 0, offsetDate: 0, addOffset: 0, limit: 5 },
    ...{ maxId: 0, minId: 0, hash: c.zero },
  });

const codesOk = (r) =>
  Array.isArray(r.codes) &&
  r.codes.length > 0 &&
  r.codes.length <= 10 &&
  r.codes.every((v) => /^\d{5,6}$/.test(text(v)));

export const createSecurityExtras = (env, context) => {
  const run =
    (valid, build, done = () => ({})) =>
    async (request = {}) =>
      valid(request)
        ? connected(env, context.userClient, failure, async (c) => {
            const answer = await runIn(env, 'security', () =>
              c.client.invoke(build(c, request))
            );
            return { ok: true, ...done(answer, request) };
          })
        : bad;
  const any = () => true;
  const change = (c) => new c.Api.EmailVerifyPurposeLoginChange();
  return {
    loginEmailSend: run(
      (r) => EMAIL.test(text(r.email)),
      (c, r) =>
        new c.Api.account.SendVerifyEmailCode({
          purpose: change(c),
          email: r.email,
        }),
      (a) => ({ pattern: a.emailPattern ?? '', length: Number(a.length) || 6 })
    ),
    loginEmailVerify: run(
      (r) => CODE.test(text(r.code)),
      (c, r) =>
        new c.Api.account.VerifyEmail({
          purpose: change(c),
          verification: new c.Api.EmailVerificationCode({ code: r.code }),
        }),
      (a) => ({ email: a.email ?? '' })
    ),
    recoveryRequest: run(
      any,
      (c) => new c.Api.auth.RequestPasswordRecovery(),
      (a) => ({ pattern: a.emailPattern ?? '' })
    ),
    recoveryConfirm: run(
      (r) => CODE.test(text(r.code)),
      (c, r) => new c.Api.auth.RecoverPassword({ code: r.code })
    ),
    passwordReset: run(
      any,
      (c) => new c.Api.account.ResetPassword(),
      (a) => RESETS[a?.className]?.(a) ?? { result: 'ok' }
    ),
    passwordResetCancel: run(
      any,
      (c) => new c.Api.account.DeclinePasswordReset()
    ),
    passkeys: run(
      any,
      (c) => new c.Api.account.GetPasskeys(),
      (a) => ({ passkeys: (a.passkeys ?? []).map(passkeyOf) })
    ),
    passkeyOptions: run(
      any,
      (c) => new c.Api.account.InitPasskeyRegistration(),
      (a) => ({ options: text(a.options?.data) })
    ),
    passkeyRegister: run(registerOk, registration, (a) => ({
      passkey: passkeyOf(a),
    })),
    passkeyDelete: run(
      (r) => typeof r.id === 'string' && r.id !== '' && r.id.length < 1024,
      (c, r) => new c.Api.account.DeletePasskey({ id: r.id })
    ),
    signInCodes: async (_request, now = Date.now) =>
      connected(env, context.userClient, failure, async (c) => {
        const page = await runIn(env, 'security', () =>
          env.connection.withPeer(c.client, SERVICE_ID, (peer) =>
            c.client.invoke(historyOf(c, peer))
          )
        );
        return {
          ok: true,
          codes: freshCodes(page?.messages, Math.floor(now() / 1000)),
        };
      }),
    invalidateCodes: run(
      codesOk,
      (c, r) => new c.Api.account.InvalidateSignInCodes({ codes: r.codes })
    ),
  };
};
