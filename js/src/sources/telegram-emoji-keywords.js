/**
 * The words emoji are found by in the emoji panel's search and in the
 * ":word" suggestions of the message box, in the page's language, as
 * Telegram's apps find them (R-Y117, R-Y206; learned, never copied):
 * Telegram's own list (messages.getEmojiKeywords), asked once a day per
 * language and kept in memory and in the app's store. A list kept in the
 * store is brought up to date by what changed since its version
 * (messages.getEmojiKeywordsDifference) instead of being asked whole.
 *
 * - `emojiKeywords({ lang })` — `{ ok, lang, version, keywords }`,
 *   `keywords` `{ word: [emoji…] }`, the words in lower case.
 */

import { connect, runIn } from './telegram-stickers.js';

const KEEP_MS = 24 * 60 * 60_000;
// Telegram's lists are a few thousand words; more than this is not one.
const MAX_WORDS = 50_000;

const wordOf = (entry) =>
  String(entry.keyword ?? '')
    .trim()
    .toLowerCase();

/** Telegram's answer as `{ word: [emoji…] }`. */
export const keywordMap = (answer) => {
  const map = Object.create(null);
  let words = 0;
  for (const entry of answer?.keywords ?? []) {
    if (entry?.className !== 'EmojiKeyword' || words >= MAX_WORDS) {
      continue;
    }
    const word = wordOf(entry);
    const emoji = (entry.emoticons ?? []).map(String).filter(Boolean);
    if (word && emoji.length) {
      map[word] = [...new Set([...(map[word] ?? []), ...emoji])];
      words += 1;
    }
  }
  return map;
};

/** `map` with a difference's added and deleted words applied (a copy). */
export const applyDifference = (map, answer) => {
  const next = Object.create(null);
  Object.assign(next, map);
  for (const entry of answer?.keywords ?? []) {
    const word = wordOf(entry ?? {});
    const emoji = (entry?.emoticons ?? []).map(String).filter(Boolean);
    if (!word) {
      continue;
    }
    if (entry.className === 'EmojiKeyword' && emoji.length) {
      next[word] = [...new Set([...(next[word] ?? []), ...emoji])];
    } else if (entry.className === 'EmojiKeywordDeleted') {
      const left = (next[word] ?? []).filter((e) => !emoji.includes(e));
      if (left.length) {
        next[word] = left;
      } else {
        delete next[word];
      }
    }
  }
  return next;
};

const storeId = (lang) => `emojikw:${lang}`;

// The list kept in the store for a language, else null.
const readStored = async (env, lang) => {
  try {
    const link = await env.store?.get?.(storeId(lang));
    if (!link || !Number.isInteger(link.version) || !link.keywords) {
      return null;
    }
    const keywords = Object.create(null);
    Object.assign(keywords, link.keywords);
    return { version: link.version, keywords };
  } catch {
    return null;
  }
};

const writeStored = async (env, lang, version, keywords) => {
  try {
    await env.store?.put?.({
      id: storeId(lang),
      tokens: ['emoji', 'keywords', 'telegram'],
      kind: 'emoji-keywords',
      lang,
      version,
      keywords: { ...keywords },
    });
  } catch {
    // The list still serves from memory.
  }
};

// The list for a language: the stored one made current, else whole.
const fetchList = async (env, c, lang) => {
  const stored = await readStored(env, lang);
  if (stored) {
    const got = await runIn(env, `emoji:keywords-diff:${lang}`, () =>
      c.client.invoke(
        new c.Api.messages.GetEmojiKeywordsDifference({
          langCode: lang,
          fromVersion: stored.version,
        })
      )
    );
    const version = Number(got?.version ?? stored.version);
    if (version === stored.version) {
      return stored;
    }
    return { version, keywords: applyDifference(stored.keywords, got) };
  }
  const got = await runIn(env, `emoji:keywords:${lang}`, () =>
    c.client.invoke(new c.Api.messages.GetEmojiKeywords({ langCode: lang }))
  );
  return { version: Number(got?.version ?? 0), keywords: keywordMap(got) };
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
    const { version, keywords } = await fetchList(env, c, lang);
    await writeStored(env, lang, version, keywords);
    const answer = { ok: true, lang, version, keywords };
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
