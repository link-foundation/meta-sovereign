// Sign-in code safety (R-Y218; learned, never copied). Telegram's service
// account (777000) sends login codes, and a code someone else gets lets them
// into the account. As the official clients do, a message the user is about
// to send that holds a code the service sent in the last minutes is held
// back and asked about; only when the user confirms is the code invalidated
// (account.invalidateSignInCodes) and the message sent. Cancelling sends
// nothing. The codes are never logged.

/** The 5 or 6 digit codes in a text. */
export const codesIn = (body) =>
  [...String(body ?? '').matchAll(/(?<!\d)\d{5,6}(?!\d)/g)].map((m) => m[0]);

/** The codes of `fresh` that `text` shares. */
export const sharedCodes = (text, fresh) => {
  const typed = new Set(codesIn(text));
  return [...new Set(fresh ?? [])].filter((code) => typed.has(code));
};

/** What a send the user did not confirm answers. */
export const CODE_DECLINED = Object.freeze({
  ok: false,
  status: 'failed',
  code: 'code-declined',
  cancelled: true,
});

/**
 * The gate: `confirm(text)` resolves `{ ok: true }` to go on or
 * `{ ok: false }` to stop. `fresh()` resolves the recent codes (an answer
 * that cannot be had lets the send go: the user is not locked out of
 * writing); `ask({ codes })` resolves true when the user confirms;
 * `invalidate(codes)` tells Telegram.
 */
export const createCodeGate = ({ fresh, ask, invalidate }) => ({
  confirm: async (text) => {
    if (codesIn(text).length === 0) {
      return { ok: true };
    }
    const codes = sharedCodes(text, await fresh().catch(() => []));
    if (codes.length === 0) {
      return { ok: true };
    }
    if (!(await ask({ codes }))) {
      return { ok: false };
    }
    await Promise.resolve(invalidate(codes)).catch(() => {});
    return { ok: true };
  },
});

/** `api` with the gate before `sendMessage` into a Telegram chat. */
export const guardCodes = (api, gate) => {
  const call = api.sendMessage;
  if (typeof call !== 'function') {
    return api;
  }
  return {
    ...api,
    sendMessage: async (body, ...rest) => {
      if (body?.source !== 'telegram') {
        return call(body, ...rest);
      }
      const verdict = await gate.confirm(body.text);
      return verdict.ok ? call(body, ...rest) : { ...CODE_DECLINED };
    },
  };
};

// What the page plugs in: the question shown to the user. Without one on
// screen the answer is "no", so nothing is shared.
let ask = async () => false;

/** Plug in `ask({ codes })`; returns a function undoing it. */
export const bindCodeAsk = (next) => {
  const before = ask;
  ask = next;
  return () => {
    ask = before;
  };
};

/** Builds the page's gate over the raw `api`. */
export const pageCodeGate = (raw) =>
  createCodeGate({
    fresh: async () => {
      const answer = await raw.telegramSignInCodes();
      return answer?.ok ? (answer.codes ?? []) : [];
    },
    ask: (offer) => ask(offer),
    invalidate: (codes) => raw.telegramInvalidateCodes({ codes }),
  });
