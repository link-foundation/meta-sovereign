/**
 * Searching stickers and GIFs from the panel by the message box, as
 * Telegram Desktop's (R-Y112; learned, never copied):
 *
 * - `stickerSearch({ q, lang })` — an emoji finds the stickers Telegram
 *   has for it (messages.getStickers); words find stickers by their
 *   keywords (messages.searchStickers) and sticker sets by name, the
 *   user's or not (messages.searchStickerSets), each set's stickers
 *   then asked as any set's are;
 * - `gifSearch({ q, offset })` — GIFs found by Telegram's @gif bot
 *   (messages.getInlineBotResults), a page at a time, as Telegram's
 *   apps search them.
 *
 * What is found is kept ten minutes and may be sent as the panel's own
 * (the documents named by id); an expired file reference asks the
 * search again. Nothing is sent to the bot but the words searched.
 */

import { connect, panelSet, runIn } from './telegram-stickers.js';

const SEARCH_MS = 10 * 60_000;
const KEEP = 40;
const LIMIT = 50;

/** Whether the words are an emoji (no letters or digits in them). */
export const isEmojiQuery = (q) =>
  /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(q) &&
  !/[\p{L}\p{N}]/u.test(q);

// The few searches kept, oldest dropped first.
const createKept = (now) => {
  const kept = new Map();
  return {
    get: (key) => {
      const entry = kept.get(key);
      return entry && now() - entry.at < SEARCH_MS ? entry.answer : null;
    },
    set: (key, answer) => {
      kept.delete(key);
      kept.set(key, { at: now(), answer });
      while (kept.size > KEEP) {
        kept.delete(kept.keys().next().value);
      }
      return answer;
    },
  };
};

// A request Telegram refuses (one it does not know, words it will not
// search): nothing found; a wait or a lost session goes on up.
const tolerant = async (use) => {
  try {
    return await use();
  } catch (error) {
    if (error?.code !== 400) {
      throw error;
    }
    return null;
  }
};

const documentsOf = (answer) =>
  (answer?.stickers ?? []).filter((d) => d?.className === 'Document');

// Stickers and sets for words or an emoji.
const findStickers = async (c, q, lang) => {
  if (isEmojiQuery(q)) {
    const got = await tolerant(() =>
      c.client.invoke(
        new c.Api.messages.GetStickers({ emoticon: q, hash: c.zero })
      )
    );
    return { documents: documentsOf(got), sets: [] };
  }
  const found = await tolerant(() =>
    c.client.invoke(
      new c.Api.messages.SearchStickers({
        q,
        emoticon: '',
        langCode: [lang],
        offset: 0,
        limit: LIMIT,
        hash: c.zero,
      })
    )
  );
  const covered = await tolerant(() =>
    c.client.invoke(new c.Api.messages.SearchStickerSets({ q, hash: c.zero }))
  );
  return {
    documents: documentsOf(found),
    sets: (covered?.sets ?? []).map((s) => s?.set).filter(Boolean),
  };
};

// Telegram's @gif bot, found once.
const createGifBot = (c) => {
  let bot = null;
  return async () => {
    if (!bot) {
      const answer = await c.client.invoke(
        new c.Api.contacts.ResolveUsername({ username: 'gif' })
      );
      const user = (answer?.users ?? [])[0];
      if (!user?.bot) {
        return null;
      }
      bot = new c.Api.InputUser({
        userId: user.id,
        accessHash: user.accessHash,
      });
    }
    return bot;
  };
};

export const createStickerSearch = (env, { userClient, lists, now }) => {
  const kept = createKept(now);
  const bots = new WeakMap(); // client -> its @gif bot
  const run = (key, use) => runIn(env, key, use);

  const stickerSearch = async ({ q, lang = 'en', fresh = false } = {}) => {
    const words = String(q ?? '').trim();
    const key = `stickers:${lang}:${words}`;
    if (!words) {
      return { ok: true, stickers: [], sets: [] };
    }
    if (!fresh && kept.get(key)) {
      return kept.get(key);
    }
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    const found = await run(`stickers:search:${key}`, () =>
      findStickers(c, words, lang)
    );
    found.sets.forEach(lists.learnSet);
    return kept.set(key, {
      ok: true,
      stickers: lists.remember(
        found.documents,
        `stickersearch:${JSON.stringify([words, lang])}`,
        'sticker'
      ),
      sets: found.sets
        .filter((s) => !s.emojis)
        .map((s) => ({
          ...panelSet(s),
          installed: lists.installed(String(s.id)),
        })),
    });
  };

  const gifSearch = async ({ q, offset = '', fresh = false } = {}) => {
    const words = String(q ?? '').trim();
    const at = String(offset ?? '');
    const key = `gifs:${at}:${words}`;
    if (!words) {
      return { ok: true, gifs: [], next: null };
    }
    if (!fresh && kept.get(key)) {
      return kept.get(key);
    }
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    if (!bots.has(c.client)) {
      bots.set(c.client, createGifBot(c));
    }
    const answer = await run(`gifs:search:${key}`, async () => {
      const bot = await bots.get(c.client)();
      return bot
        ? c.client.invoke(
            new c.Api.messages.GetInlineBotResults({
              bot,
              peer: new c.Api.InputPeerSelf(),
              query: words,
              offset: at,
            })
          )
        : null;
    });
    if (!answer) {
      return { ok: false, supported: false };
    }
    const documents = (answer.results ?? [])
      .map((r) => r?.document)
      .filter((d) => d?.className === 'Document');
    return kept.set(key, {
      ok: true,
      gifs: lists.remember(
        documents,
        `gifsearch:${JSON.stringify([words, at])}`,
        'gif'
      ),
      next: answer.nextOffset ? String(answer.nextOffset) : null,
    });
  };

  lists.onAgain('stickersearch:', (rest) => {
    const [q, lang] = JSON.parse(rest);
    return stickerSearch({ q, lang, fresh: true });
  });
  lists.onAgain('gifsearch:', (rest) => {
    const [q, offset] = JSON.parse(rest);
    return gifSearch({ q, offset, fresh: true });
  });

  return { stickerSearch, gifSearch };
};
