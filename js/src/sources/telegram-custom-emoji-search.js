/**
 * Custom emoji found by words, as Telegram Desktop's emoji status picker
 * and emoji panel search them for a Premium account (R-Y206; learned,
 * never copied):
 * - `customEmojiSearch({ q })` — the documents Telegram has for an emoji
 *   or a word (messages.searchCustomEmoji) → `{ ok, ids }`, decimal
 *   strings the page draws with the custom emoji pictures. Kept ten
 *   minutes by words.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const KEEP_MS = 10 * 60_000;
const KEPT_MAX = 40;
export const MAX_QUERY = 64;
const MAX_IDS = 200;

const failure = failureOf({
  PREMIUM_ACCOUNT_REQUIRED: 'premium-required',
  EMOTICON_EMPTY: 'bad-request',
});

/** The trimmed words, or null when empty or too long. */
export const queryOf = (q) => {
  const words = String(q ?? '').trim();
  return words && Array.from(words).length <= MAX_QUERY ? words : null;
};

export const createCustomEmojiSearch = (
  env,
  { userClient },
  { now = () => Date.now() } = {}
) => {
  const kept = new Map(); // words -> { at, answer }

  const customEmojiSearch = async ({ q } = {}) => {
    const words = queryOf(q);
    if (!words) {
      return { ok: false, error: 'bad request', code: 'bad-request' };
    }
    const entry = kept.get(words);
    if (entry && now() - entry.at < KEEP_MS) {
      return entry.answer;
    }
    const answer = await connected(env, userClient, failure, async (c) => {
      const list = await runIn(env, `custom-emoji:search:${words}`, () =>
        c.client.invoke(
          new c.Api.messages.SearchCustomEmoji({
            emoticon: words,
            hash: c.zero,
          })
        )
      );
      const ids = (list?.documentId ?? [])
        .map((id) => String(id?.value ?? id))
        .slice(0, MAX_IDS);
      return { ok: true, ids };
    });
    if (answer.ok) {
      kept.set(words, { at: now(), answer });
      while (kept.size > KEPT_MAX) {
        kept.delete(kept.keys().next().value);
      }
    }
    return answer;
  };

  return { customEmojiSearch };
};
