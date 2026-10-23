/**
 * The words emoji are found by in the emoji panel's search, in the
 * page's language, as Telegram's apps find them (R-Y117; learned, never
 * copied): Telegram's own list (messages.getEmojiKeywords), asked once
 * a day per language and kept in memory.
 *
 * - `emojiKeywords({ lang })` — `{ ok, lang, keywords }`, `keywords`
 *   `{ word: [emoji…] }`, the words in lower case.
 */

import { connect, runIn } from './telegram-stickers.js';

const KEEP_MS = 24 * 60 * 60_000;
// Telegram's lists are a few thousand words; more than this is not one.
const MAX_WORDS = 50_000;

/** Telegram's answer as `{ word: [emoji…] }`. */
export const keywordMap = (answer) => {
  const map = Object.create(null);
  let words = 0;
  for (const entry of answer?.keywords ?? []) {
    if (entry?.className !== 'EmojiKeyword' || words >= MAX_WORDS) {
      continue;
    }
    const word = String(entry.keyword ?? '')
      .trim()
      .toLowerCase();
    const emoji = (entry.emoticons ?? []).map(String).filter(Boolean);
    if (word && emoji.length) {
      map[word] = [...new Set([...(map[word] ?? []), ...emoji])];
      words += 1;
    }
  }
  return map;
};

export const createEmojiKeywords = (
  env,
  { userClient },
  { now = () => Date.now() } = {}
) => {
  const kept = new Map(); // lang -> { at, answer }
  const asking = new Map(); // lang -> the answer coming

  const ask = async (lang) => {
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    const got = await runIn(env, `emoji:keywords:${lang}`, () =>
      c.client.invoke(new c.Api.messages.GetEmojiKeywords({ langCode: lang }))
    );
    const answer = { ok: true, lang, keywords: keywordMap(got) };
    kept.set(lang, { at: now(), answer });
    return answer;
  };

  const emojiKeywords = async ({ lang = 'en' } = {}) => {
    const key = String(lang);
    const entry = kept.get(key);
    if (entry && now() - entry.at < KEEP_MS) {
      return entry.answer;
    }
    if (!asking.has(key)) {
      asking.set(
        key,
        ask(key).finally(() => asking.delete(key))
      );
    }
    return asking.get(key);
  };

  return { emojiKeywords };
};
