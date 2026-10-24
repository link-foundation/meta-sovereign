// Honest outcomes for account writes (R-Y218; R-Z4 rule): when a Telegram
// call that CHANGES something fails without an answer from Telegram (a
// dropped connection, a timeout), the change may have been made. The answer
// is then `send-unknown` (never "failed", never retried or tried another
// way), and the page tells the user to look before doing it again. Errors
// Telegram itself answers (an RPC error: wrong code, flood wait, ...) are
// clear failures and keep their own codes. Nothing of the error's text, which
// may hold a code or an address, is passed on.

import { failureOf } from './telegram-stickers.js';
import { markSendOutcome } from './http.js';

/** The answer for a write whose outcome is not known. */
export const UNKNOWN_WRITE = Object.freeze({
  ok: false,
  error: 'send-unknown',
  code: 'send-unknown',
  outcome: 'unknown',
  fallback: false,
});

const answered = (error, codes) => {
  const name = String(error?.errorMessage ?? '');
  return (
    name !== '' ||
    Object.keys(codes).some((k) => String(error?.message ?? '').includes(k))
  );
};

/** `failureOf(codes)` for writes: no answer from Telegram means unknown. */
export const writeFailureOf = (codes) => {
  const failure = failureOf(codes);
  return (error) => {
    if (answered(error, codes)) {
      return failure(error);
    }
    markSendOutcome(error, { ambiguous: true });
    return { ...UNKNOWN_WRITE };
  };
};
