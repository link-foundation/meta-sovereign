// More of Privacy and Security (R-Y218): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
// A code in a body is passed on and never kept.
//
// Its routes:
//   POST /api/telegram/login-email-send {email} -> { ok, pattern, length }
//   POST /api/telegram/login-email-verify {code} -> { ok, email }
//   POST /api/telegram/recovery-request -> { ok, pattern } a code mailed to
//                       the recovery email
//   POST /api/telegram/recovery-confirm {code} -> { ok } the password gone
//   POST /api/telegram/password-reset -> { ok, result: 'ok' | 'wait' |
//                       'failed-wait', until }
//   POST /api/telegram/password-reset-cancel -> { ok }
//   POST /api/telegram/passkeys -> { ok, passkeys: [{ id, name, created,
//                       lastUsed }] }
//   POST /api/telegram/passkey-options -> { ok, options } WebAuthn JSON
//   POST /api/telegram/passkey-register {id, rawId, clientData,
//                       attestation} -> { ok, passkey } (base64url strings)
//   POST /api/telegram/passkey-delete {id} -> { ok }
//   POST /api/telegram/sign-in-codes -> { ok, codes } fresh codes from 777000
//   POST /api/telegram/invalidate-codes {codes: ['12345']} -> { ok }

import { route } from './routes-telegram-admin-extras.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const CODE = /^[0-9A-Za-z]{1,16}$/;
const str = (v, max) =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const nothing = () => true;
const code = (b) => CODE.test(String(b.code ?? ''));

export const SECURITY_EXTRAS_POSTS = {
  'login-email-send': route('loginEmailSend', 'a valid email required', (b) =>
    EMAIL.test(String(b.email ?? ''))
  ),
  'login-email-verify': route('loginEmailVerify', 'the code required', code),
  'recovery-request': route('recoveryRequest', 'no body', nothing),
  'recovery-confirm': route('recoveryConfirm', 'the code required', code),
  'password-reset': route('passwordReset', 'no body', nothing),
  'password-reset-cancel': route('passwordResetCancel', 'no body', nothing),
  passkeys: route('passkeys', 'no body', nothing),
  'passkey-options': route('passkeyOptions', 'no body', nothing),
  'passkey-register': route(
    'passkeyRegister',
    'id, rawId, clientData and attestation required',
    (b) =>
      ['id', 'rawId', 'clientData', 'attestation'].every((k) =>
        str(b[k], 100_000)
      )
  ),
  'passkey-delete': route('passkeyDelete', 'the passkey id required', (b) =>
    str(b.id, 1024)
  ),
  'sign-in-codes': route('signInCodes', 'no body', nothing),
  'invalidate-codes': route(
    'invalidateCodes',
    'one to ten codes required',
    (b) =>
      Array.isArray(b.codes) &&
      b.codes.length > 0 &&
      b.codes.length <= 10 &&
      b.codes.every((v) => /^\d{5,6}$/.test(String(v)))
  ),
};
