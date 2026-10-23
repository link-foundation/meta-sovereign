// Sending into a chat that charges Stars per message (R-Y184; learned,
// never copied). A person (users.getRequirementsToContact) or a supergroup
// (its `send_paid_messages_stars`) may ask Stars for every message.
//
// Nothing is ever paid without a confirmation: every send call the page
// makes into such a chat first asks "N ⭐ × M messages = T ⭐, your balance
// is B" (the gate below) and only then goes out with `allowPaidStars` set
// to exactly the confirmed total T — never a number computed anywhere else.
// "Don't ask again for this chat" is kept in this browser, tied to the
// price it was given for: a different price asks again. A refused or
// unconfirmed send is not made at all (`paid-declined`); a price that
// changed since is refused by Telegram and nothing is charged.

import { readSaved, writeSaved } from './chat-outbox.js';

export const PAID_PREFS_KEY = 'metaSovereignPaidAsk';
const PRICE_KEEP_MS = 2 * 60_000;
// Telegram's longest message; a longer text goes out in this many parts.
const PART_LENGTH = 4096;

/** The Stars `count` messages cost at `price` each. */
export const totalOf = (price, count) =>
  Math.max(0, Math.floor(price)) * Math.max(1, Math.floor(count));

/** How many messages a text goes out as (long text is split). */
export const textParts = (text) =>
  Math.max(1, Math.ceil(String(text ?? '').length / PART_LENGTH));

// How many messages each send call makes, from the body it is given.
const one = () => 1;
const SENDS = {
  sendMessage: (body) => textParts(body?.text),
  telegramSendFiles: (body) =>
    Array.isArray(body?.tokens) ? Math.max(1, body.tokens.length) : 1,
  telegramSendVoice: one,
  telegramSendRound: one,
  telegramSendDocument: one,
  telegramSendPoll: one,
  telegramSendTodo: one,
  telegramSendContact: one,
  telegramSendLocation: one,
  telegramInlineSend: one,
  telegramForward: (body) =>
    Array.isArray(body?.ids) ? Math.max(1, body.ids.length) : 1,
};
// The field naming the chat a call writes to.
const CHAT_FIELD = { telegramForward: 'toChat' };

/** The send calls the gate stands before. */
export const SEND_CALLS = Object.freeze(Object.keys(SENDS));

/** How many messages a call makes, or 1. */
export const countOf = (name, body) => (SENDS[name] ?? one)(body);

/** The Telegram chat a call writes to, or null (another network). */
export const chatOf = (name, body) => {
  if (body?.source && body.source !== 'telegram') {
    return null;
  }
  const chat = body?.[CHAT_FIELD[name] ?? 'chat'];
  return chat === undefined || chat === null || chat === ''
    ? null
    : String(chat);
};

/** What a declined send answers, in the shape of both kinds of call. */
export const DECLINED = Object.freeze({
  ok: false,
  status: 'failed',
  code: 'paid-declined',
  cancelled: true,
});

// ---- "don't ask again", per chat and price ----------------------------------

/** The saved "don't ask again": `{ chat: price }`. */
export const readPrefs = (storage) => {
  const saved = readSaved(PAID_PREFS_KEY, {}, storage);
  return saved && typeof saved === 'object' && !Array.isArray(saved)
    ? saved
    : {};
};

/** Whether the user chose not to be asked in `chat` at this `price`. */
export const isSilenced = (prefs, chat, price) =>
  Number(prefs?.[String(chat)]) === Number(price) && price > 0;

/** `prefs` with "don't ask again" set for `chat` at `price`. */
export const silenced = (prefs, chat, price) => ({
  ...prefs,
  [String(chat)]: price,
});

// ---- the gate ---------------------------------------------------------------

/**
 * The gate every send into a Telegram chat passes. `price(chat)` is what
 * one message costs there (0: free; an answer that cannot be had counts as
 * free, so Telegram — which refuses an unpaid send — decides); `ask(offer)`
 * shows the confirmation for `{ chat, price, count, total }` and resolves
 * `{ confirmed, remember }`.
 * `confirm(chat, count)` resolves `{ ok: true, stars }` (`stars` 0 for a
 * free chat) or `{ ok: false }` when the user did not confirm.
 */
export const createGate = ({
  price,
  ask,
  storage,
  now = () => Date.now(),
} = {}) => {
  const known = new Map(); // chat -> { at, stars }
  const priceOf = async (chat) => {
    const hit = known.get(chat);
    if (hit && now() - hit.at < PRICE_KEEP_MS) {
      return hit.stars;
    }
    const stars = Math.max(0, Math.floor(Number(await price(chat)) || 0));
    known.set(chat, { at: now(), stars });
    return stars;
  };
  return {
    priceOf,
    /** Remember a price the page already read. */
    note: (chat, stars) => known.set(String(chat), { at: now(), stars }),
    forget: (chat) => known.delete(String(chat)),
    confirm: async (chat, count) => {
      const stars = await priceOf(String(chat)).catch(() => 0);
      if (stars <= 0) {
        return { ok: true, stars: 0 };
      }
      const total = totalOf(stars, count);
      if (isSilenced(readPrefs(storage), chat, stars)) {
        return { ok: true, stars: total };
      }
      const answer = await ask({
        chat: String(chat),
        price: stars,
        count: Math.max(1, count),
        total,
      });
      if (!answer?.confirmed) {
        return { ok: false };
      }
      if (answer.remember) {
        writeSaved(
          PAID_PREFS_KEY,
          silenced(readPrefs(storage), chat, stars),
          storage
        );
      }
      return { ok: true, stars: total };
    },
  };
};

/**
 * `api` with the gate before each of its send calls: a call into a paid
 * chat carries `allowPaidStars` = the confirmed total, one the user did
 * not confirm answers `DECLINED` without reaching the server. Calls to a
 * free chat, another network or anything else pass through untouched.
 */
export const guardApi = (api, gate) => {
  const guarded = {};
  for (const name of SEND_CALLS) {
    const call = api[name];
    if (typeof call !== 'function') {
      continue;
    }
    guarded[name] = async (body, ...rest) => {
      const chat = chatOf(name, body);
      if (!chat) {
        return call(body, ...rest);
      }
      const verdict = await gate.confirm(chat, countOf(name, body));
      if (!verdict.ok) {
        return { ...DECLINED };
      }
      // The body never carries a number but the confirmed one.
      const { allowPaidStars: _ignored, ...clean } = body;
      const answer = await call(
        verdict.stars > 0 ? { ...clean, allowPaidStars: verdict.stars } : clean,
        ...rest
      );
      // The price is not the one confirmed: read it again next time.
      if (answer?.code === 'paid-required') {
        gate.forget(chat);
      }
      return answer;
    };
  }
  return { ...api, ...guarded };
};

// ---- the page's gate ----------------------------------------------------------

// What the page plugs in: the price of a chat (./dom.js) and the question
// shown to the user (./chat-paid-send.js). Without a question on screen the
// answer is "no", so nothing is paid.
let deps = {
  price: async () => 0,
  ask: async () => ({ confirmed: false }),
};

/** Plug in `price(chat)` and/or `ask(offer)`; returns a function undoing it. */
export const bindPaid = (next) => {
  const before = deps;
  deps = { ...deps, ...next };
  return () => {
    deps = before;
  };
};

/** The one gate of the page. */
export const paidGate = createGate({
  price: (chat) => deps.price(chat),
  ask: (offer) => deps.ask(offer),
});
