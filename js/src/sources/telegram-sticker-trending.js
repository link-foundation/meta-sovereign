/**
 * Trending stickers and the other extras of the sticker panel, as
 * Telegram Desktop offers them (R-Y206; learned, never copied):
 * - `featuredStickers({ emojis, old, offset, limit })` — the trending
 *   sticker sets (messages.getFeaturedStickers), further ones a page at a
 *   time (getOldFeaturedStickers), or the trending custom emoji sets
 *   (getFeaturedEmojiStickers) → `{ ok, count, sets, unread, next }`; each
 *   set is `{ id, title, count, format, emoji, installed, unread }`;
 * - `featuredRead({ ids })` — sets seen in the list
 *   (messages.readFeaturedStickers), so they lose their "new" mark;
 * - `recentStickersClear()` — "Clear recent stickers"
 *   (messages.clearRecentStickers);
 * - `attachedStickers({ chat, id })` — the sticker sets used in a photo
 *   or video of a stored message (messages.getAttachedStickers).
 * The sets are learned by the sticker module, so their stickers are asked
 * as any set's, and Add installs them as the panel's Add does. Telegram's
 * errors become codes the page shows as text.
 */

import { connected, failureOf, panelSet, runIn } from './telegram-stickers.js';

const CODES = {
  STICKER_ID_INVALID: 'bad-request',
  MEDIA_INVALID: 'no-stickers',
  FILE_REFERENCE_EXPIRED: 'expired',
  FILE_REFERENCE_INVALID: 'expired',
  OFFSET_INVALID: 'bad-request',
};

const failure = failureOf(CODES);
const bad = (code = 'bad-request') => ({ ok: false, error: code, code });

export const SET_ID = /^-?\d{1,20}$/;
export const MAX_PAGE = 100;
export const MAX_READ = 200;
const CHAT = /^-?\d{1,20}$/;
const MESSAGE = /^\d{1,12}$/;

const textOf = (value) => String(value?.value ?? value);

/** A message's media that can carry stickers: `photo` or `document`, or null. */
export const stickeredOf = (raw) => {
  const media = raw?.media;
  if (media?.className === 'MessageMediaPhoto' && media.photo?.id) {
    return { kind: 'photo', file: media.photo };
  }
  const doc = media?.document;
  const marked = (doc?.attributes ?? []).some(
    (a) => a?.className === 'DocumentAttributeHasStickers'
  );
  return media?.className === 'MessageMediaDocument' && doc?.id && marked
    ? { kind: 'document', file: doc }
    : null;
};

const bytesOf = (value) => {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return typeof value?.bytes === 'string'
    ? Buffer.from(value.bytes, 'base64')
    : Buffer.alloc(0);
};

const stickeredMedia = (c, { kind, file }) => {
  const fields = {
    id: c.helpers.returnBigInt(textOf(file.id)),
    accessHash: c.helpers.returnBigInt(textOf(file.accessHash)),
    fileReference: bytesOf(file.fileReference),
  };
  return kind === 'photo'
    ? new c.Api.InputStickeredMediaPhoto({ id: new c.Api.InputPhoto(fields) })
    : new c.Api.InputStickeredMediaDocument({
        id: new c.Api.InputDocument(fields),
      });
};

// A covered set (stickerSetCovered and its variants) as the page lists it.
const listed = (covered, unread) => {
  const set = covered?.set ?? covered;
  return {
    ...panelSet(set),
    // For the set's box, which names a set by id and access hash.
    accessHash: textOf(set.accessHash),
    installed: Boolean(set.installedDate) && !set.archived,
    unread: unread.has(textOf(set.id)),
  };
};

const featuredRequest = (c, { emojis, old, offset, limit }) => {
  if (emojis) {
    return new c.Api.messages.GetFeaturedEmojiStickers({ hash: c.zero });
  }
  return old
    ? new c.Api.messages.GetOldFeaturedStickers({ offset, limit, hash: c.zero })
    : new c.Api.messages.GetFeaturedStickers({ hash: c.zero });
};

const pageOf = (body) => {
  const offset = Number(body.offset ?? 0);
  const limit = Number(body.limit ?? 20);
  const ok =
    Number.isInteger(offset) &&
    offset >= 0 &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= MAX_PAGE;
  return ok ? { offset, limit } : null;
};

/**
 * `stickers`: the sticker module's hooks `{ learn(set), changed() }`
 * (./telegram-stickers.js).
 */
export const createStickerTrending = (env, { userClient, stickers: hooks }) => {
  const featuredStickers = async (body = {}) => {
    const page = pageOf(body);
    if (!page) {
      return bad();
    }
    const asked = { emojis: body.emojis === true, old: body.old === true };
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(
        env,
        `stickers:featured:${asked.emojis}:${asked.old}:${page.offset}`,
        () => c.client.invoke(featuredRequest(c, { ...asked, ...page }))
      );
      const unread = new Set((answer?.unread ?? []).map(textOf));
      const covered = answer?.sets ?? [];
      covered.forEach((s) => hooks.learn(s?.set ?? s));
      const sets = covered.map((s) => listed(s, unread));
      return {
        ok: true,
        count: Number(answer?.count ?? sets.length),
        sets,
        unread: [...unread],
        next:
          asked.old && !asked.emojis && sets.length >= page.limit
            ? page.offset + sets.length
            : null,
      };
    });
  };

  const featuredRead = async ({ ids } = {}) => {
    const list = Array.isArray(ids) ? ids.map(String) : [];
    if (
      list.length === 0 ||
      list.length > MAX_READ ||
      !list.every((id) => SET_ID.test(id))
    ) {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, 'stickers:featured-read', () =>
        c.client.invoke(
          new c.Api.messages.ReadFeaturedStickers({
            id: list.map((id) => c.helpers.returnBigInt(id)),
          })
        )
      );
      return { ok: true };
    });
  };

  const recentStickersClear = async () =>
    connected(env, userClient, failure, async (c) => {
      await runIn(env, 'stickers:recent-clear', () =>
        c.client.invoke(new c.Api.messages.ClearRecentStickers({}))
      );
      hooks.changed();
      return { ok: true };
    });

  const attachedStickers = async ({ chat, id } = {}) => {
    if (!CHAT.test(String(chat ?? '')) || !MESSAGE.test(String(id ?? ''))) {
      return bad();
    }
    const stored = await env.store?.get?.(`msg:telegram:${chat}:${id}`);
    const media = stickeredOf(stored?.raw);
    if (!media) {
      return bad('no-stickers');
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `stickers:attached:${chat}:${id}`, () =>
        c.client.invoke(
          new c.Api.messages.GetAttachedStickers({
            media: stickeredMedia(c, media),
          })
        )
      );
      const covered = Array.isArray(answer) ? answer : [];
      covered.forEach((s) => hooks.learn(s?.set ?? s));
      return { ok: true, sets: covered.map((s) => listed(s, new Set())) };
    });
  };

  return {
    featuredStickers,
    featuredRead,
    recentStickersClear,
    attachedStickers,
  };
};
