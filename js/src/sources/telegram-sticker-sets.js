/**
 * The user's sticker and custom emoji sets, as Telegram Desktop's
 * Settings → Stickers and emoji manages them (R-Y169; learned, never
 * copied):
 * - `setsList({ emojis })` — the installed sets in the user's order
 *   (messages.getAllStickers, or getEmojiStickers for emoji sets) →
 *   `{ ok, sets: [{ id, title, count, format, emoji, official }] }`;
 * - `setsReorder({ ids, emojis })` — a new order (messages.reorderStickerSets);
 * - `setArchive({ id })` — a set archived (messages.installStickerSet with
 *   archived), `setRemove({ id })` — removed (uninstallStickerSet),
 *   `setAdd({ id })` — an archived set installed again;
 * - `archivedList({ emojis, offsetId, limit })` — the archived sets, a page
 *   at a time (messages.getArchivedStickers) → `{ ok, count, sets, next }`.
 * Only sets this list (or the panel) showed may be named, by id. The
 * panel's lists are asked again after every change. Telegram's errors
 * become codes the page shows as text.
 */

import {
  connected,
  failureOf,
  inputSet,
  panelSet,
  runIn,
} from './telegram-stickers.js';

const CODES = {
  STICKERSET_INVALID: 'unknown-set',
  STICKERSET_NOT_MODIFIED: 'not-modified',
  STICKERS_TOO_MUCH: 'too-many',
  STICKERSETS_INVALID: 'bad-request',
  OFFSET_INVALID: 'bad-request',
};

const asFailure = failureOf(CODES);
// Nothing to change is no failure.
const failure = (error) => {
  const out = asFailure(error);
  return out.code === 'not-modified' ? { ok: true } : out;
};
const bad = (code) => ({ ok: false, error: code, code });

export const SET_ID = /^-?\d{1,20}$/;
export const MAX_SETS = 1000;
export const MAX_PAGE = 100;

const textOf = (value) => String(value?.value ?? value);

/** A set as the settings list it. */
export const settingsSet = (set) => ({
  ...panelSet(set),
  official: Boolean(set.official),
});

/** The ids of a new order: distinct set ids, one to 1000; else null. */
export const orderOf = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_SETS) {
    return null;
  }
  const list = ids.map(String);
  const valid = list.every((id) => SET_ID.test(id));
  return valid && new Set(list).size === list.length ? list : null;
};

const createLister = (env, userClient, hooks) => ({
  setsList: async ({ emojis = false } = {}) =>
    connected(env, userClient, failure, async (c) => {
      const Request = emojis
        ? c.Api.messages.GetEmojiStickers
        : c.Api.messages.GetAllStickers;
      const answer = await runIn(env, `stickers:settings:${emojis}`, () =>
        c.client.invoke(new Request({ hash: c.zero }))
      );
      const sets = (answer?.sets ?? []).filter(
        (s) => Boolean(s.emojis) === Boolean(emojis) && !s.masks
      );
      sets.forEach((set) => hooks.learn(set));
      return { ok: true, sets: sets.map(settingsSet) };
    }),

  archivedList: async (body = {}) => {
    const offsetId = String(body.offsetId ?? '0');
    const limit = Number(body.limit ?? 20);
    if (
      !SET_ID.test(offsetId) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_PAGE
    ) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `stickers:archived:${offsetId}`, () =>
        c.client.invoke(
          new c.Api.messages.GetArchivedStickers({
            ...(body.emojis ? { emojis: true } : {}),
            offsetId: c.helpers.returnBigInt(offsetId),
            limit,
          })
        )
      );
      const sets = (answer?.sets ?? []).map((s) => s.set ?? s);
      sets.forEach((set) => hooks.learn(set));
      return {
        ok: true,
        count: Number(answer?.count ?? sets.length),
        sets: sets.map(settingsSet),
        next: sets.length >= limit ? textOf(sets.at(-1).id) : null,
      };
    });
  },
});

const createReorder =
  (env, userClient, hooks) =>
  async ({ ids, emojis = false } = {}) => {
    const order = orderOf(ids);
    if (!order) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, 'stickers:reorder', () =>
        c.client.invoke(
          new c.Api.messages.ReorderStickerSets({
            ...(emojis ? { emojis: true } : {}),
            order: order.map((id) => c.helpers.returnBigInt(id)),
          })
        )
      );
      hooks.changed();
      return { ok: true };
    });
  };

// Archive, Remove and Add: one known set, one request.
const createChange =
  (env, userClient, hooks, name, request) =>
  async (body = {}) => {
    const id = String(body.id ?? '');
    if (!SET_ID.test(id)) {
      return bad('bad-request');
    }
    const set = hooks.known(id);
    if (!set) {
      return bad('unknown-set');
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `stickers:${name}:${id}`, () =>
        c.client.invoke(request(c, inputSet(c, set)))
      );
      hooks.changed();
      return { ok: true, id };
    });
  };

/**
 * `stickers`: the sticker module's hooks `{ learn(set), known(id),
 * changed() }` (./telegram-stickers.js).
 */
export const createStickerSets = (env, { userClient, stickers }) => {
  const change = (name, request) =>
    createChange(env, userClient, stickers, name, request);
  return {
    ...createLister(env, userClient, stickers),
    setsReorder: createReorder(env, userClient, stickers),
    setArchive: change(
      'archive',
      (c, stickerset) =>
        new c.Api.messages.InstallStickerSet({ stickerset, archived: true })
    ),
    setAdd: change(
      'add',
      (c, stickerset) =>
        new c.Api.messages.InstallStickerSet({ stickerset, archived: false })
    ),
    setRemove: change(
      'remove',
      (c, stickerset) => new c.Api.messages.UninstallStickerSet({ stickerset })
    ),
  };
};
