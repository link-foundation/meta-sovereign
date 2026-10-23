/**
 * Change phone number, as Telegram Desktop's Settings → My Account has it
 * (R-Y212; learned, never copied):
 * - `phoneChangeSend({ phone })` — account.sendChangePhoneCode with the
 *   default CodeSettings → `{ ok, phoneCodeHash, length, timeout }`; the
 *   code goes to the new number;
 * - `phoneChangeConfirm({ phone, phoneCodeHash, code })` —
 *   account.changePhone → `{ ok, phone }`, the number the account has now.
 * Telegram's errors (PHONE_NUMBER_OCCUPIED, PHONE_CODE_INVALID, …) become
 * codes the page shows as text. The code is never logged or kept.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

export const PHONE = /^\+?\d{5,15}$/;
export const CODE = /^\d{3,8}$/;
const HASH = /^[\w-]{1,128}$/;

const failure = failureOf({
  PHONE_NUMBER_OCCUPIED: 'occupied',
  PHONE_NUMBER_INVALID: 'phone-invalid',
  PHONE_NUMBER_BANNED: 'banned',
  PHONE_NUMBER_FLOOD: 'flood',
  PHONE_CODE_INVALID: 'code-invalid',
  PHONE_CODE_EMPTY: 'code-invalid',
  PHONE_CODE_EXPIRED: 'code-expired',
  PHONE_CODE_HASH_EMPTY: 'code-expired',
  FRESH_CHANGE_PHONE_FORBIDDEN: 'fresh',
  FLOOD_WAIT: 'flood',
  SMS_CODE_CREATE_FAILED: 'send-failed',
  TIMEOUT: 'send-failed',
});

const bad = (code) => ({ ok: false, error: code, code });

const send = (env, userClient) => async (request) => {
  const phone = String(request?.phone ?? '').trim();
  if (!PHONE.test(phone)) {
    return bad('phone-invalid');
  }
  return connected(env, userClient, failure, async (c) => {
    const sent = await runIn(env, 'phone-change:send', () =>
      c.client.invoke(
        new c.Api.account.SendChangePhoneCode({
          phoneNumber: phone,
          settings: new c.Api.CodeSettings({}),
        })
      )
    );
    if (!sent?.phoneCodeHash) {
      return bad('send-failed');
    }
    return {
      ok: true,
      phoneCodeHash: String(sent.phoneCodeHash),
      length: Number(sent.type?.length) || null,
      timeout: Number(sent.timeout) || null,
    };
  });
};

const confirm = (env, userClient) => async (request) => {
  const phone = String(request?.phone ?? '').trim();
  const code = String(request?.code ?? '').trim();
  const hash = String(request?.phoneCodeHash ?? '');
  if (!PHONE.test(phone) || !HASH.test(hash)) {
    return bad('bad-request');
  }
  if (!CODE.test(code)) {
    return bad('code-invalid');
  }
  return connected(env, userClient, failure, async (c) => {
    const user = await runIn(env, 'phone-change:confirm', () =>
      c.client.invoke(
        new c.Api.account.ChangePhone({
          phoneNumber: phone,
          phoneCodeHash: hash,
          phoneCode: code,
        })
      )
    );
    return { ok: true, phone: String(user?.phone ?? phone.replace(/^\+/, '')) };
  });
};

export const createPhoneChange = (env, { userClient }) => ({
  phoneChangeSend: send(env, userClient),
  phoneChangeConfirm: confirm(env, userClient),
});
