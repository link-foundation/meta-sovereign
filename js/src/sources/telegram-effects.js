/**
 * Message effects, as Telegram Desktop and the mobile apps have them
 * (R-Y149; learned, never copied): a message in a private chat can be
 * sent with an effect (an emoji bursting over it when it arrives).
 * - `availableEffects()` — the effects Telegram offers
 *   (messages.getAvailableEffects, hash 0) → `{ ok, effects: [{ id,
 *   emoticon, premiumRequired? }], premium }`; ids are decimal strings,
 *   kept in memory for a few minutes. `premium` says whether the account
 *   has Premium (the page shows the Premium-only ones locked).
 * The animation documents are not fetched: the page plays the emoji.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const KEEP_MS = 10 * 60_000;

/** An effect id as the server takes it: a decimal string of a long. */
export const EFFECT_ID = /^\d{1,20}$/;

export const createEffects = (env, { userClient }) => {
  let kept = null; // { at, answer }
  const now = () => (env.now ?? Date.now)();

  const ask = (c) =>
    runIn(env, 'available-effects', async () => {
      const answer = await c.client.invoke(
        new c.Api.messages.GetAvailableEffects({ hash: 0 })
      );
      const effects = (answer?.effects ?? [])
        .filter((one) => one?.emoticon)
        .map((one) => ({
          id: String(one.id),
          emoticon: String(one.emoticon),
          ...(one.premiumRequired ? { premiumRequired: true } : {}),
        }));
      const me = await c.client.getMe?.().catch(() => null);
      return { ok: true, effects, premium: Boolean(me?.premium) };
    });

  const availableEffects = async () => {
    if (kept && now() - kept.at < KEEP_MS) {
      return kept.answer;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await ask(c);
      kept = { at: now(), answer };
      return answer;
    });
  };

  return { availableEffects };
};
