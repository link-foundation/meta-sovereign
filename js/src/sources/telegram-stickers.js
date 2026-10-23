/**
 * Stickers and saved GIFs for the panel by the message box, as Telegram
 * Desktop's (R-Y105; learned, never copied):
 *
 * - `stickerPanel({ fresh })` — the user's sticker sets
 *   (messages.getAllStickers), recently sent (getRecentStickers) and
 *   favourite ones (getFavedStickers);
 * - `stickerSet({ id })` — one set's stickers (getStickerSet), asked
 *   when the panel comes to it;
 * - `savedGifs({ fresh })` — the saved GIFs (getSavedGifs);
 * - `stickerPicture({ id | set, full })` — what the panel shows: a
 *   still sticker itself, else a sticker's or GIF's thumbnail, a set's
 *   own picture; `full` a video sticker's or GIF's video, or an
 *   animated sticker's animation (R-Y113), to play while on screen.
 *   Each downloaded once into the app folder;
 * - `stickerSave({ id, action })` — the panel's menu (R-Y115): a sticker
 *   made a favourite or not (messages.faveSticker), taken from the recent
 *   ones (saveRecentSticker), a GIF saved or not (saveGif);
 * - `stickerSetInstall({ id, install })` — a set found by a search added
 *   to the user's (messages.installStickerSet, R-Y116), or one of theirs
 *   removed (uninstallStickerSet);
 * - `stickerSetBox({ id, accessHash } | { shortName })` — the set a
 *   sticker in a chat belongs to (messages.getStickerSet, R-Y124), for
 *   the box a click on it opens: the set, its stickers and whether it is
 *   the user's. The set and its documents join the lists, so the install
 *   above and the send below accept them;
 * - `sendDocument({ chat, id, replyTo, silent, scheduleDate, clientId })`
 *   — a sticker or GIF sent as it is (messages.sendMedia); Telegram's
 *   answer goes through the live handler, so it shows in the chat.
 *
 * The documents the page may name are only those listed here (by id);
 * an expired file reference asks their list again, then tries once
 * more. Lists are kept ten minutes, a set an hour.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pickSize } from './telegram-media.js';
import { DICE, randomIdOf, replyHeader, sendError } from './telegram-send.js';
import { createStickerSearch } from './telegram-sticker-search.js';
import { createInlineBots } from './telegram-inline-bots.js';

const LISTS_MS = 10 * 60_000;
const SET_MS = 60 * 60_000;
// Pictures and videos larger than this are not downloaded for the panel.
const MAX_PICTURE = 512 * 1024;
const MAX_VIDEO = 4 * 1024 * 1024;
const ID = /^\d{1,20}$/;
// A set's id and access hash are signed 64-bit numbers; a short name.
const SET_ID = /^-?\d{1,20}$/;
const SHORT_NAME = /^[A-Za-z0-9_]{1,64}$/;
// What the panel is given: a picture, a video or an animated sticker.
const FULL_TYPE = /^(image\/|video\/|application\/x-tgsticker$)/;

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

const bytesOf = (value) => {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return typeof value?.bytes === 'string'
    ? Buffer.from(value.bytes, 'base64')
    : Buffer.alloc(0);
};

const expired = (error) =>
  /FILE_REFERENCE_(EXPIRED|INVALID)/.test(
    String(error?.errorMessage ?? error?.message ?? '')
  );

const attribute = (doc, name) =>
  (doc?.attributes ?? []).find((a) => a?.className === name) ?? null;

/** A sticker's or GIF's format: webp, tgs, webm or mp4 (or the type). */
export const formatOf = (doc) => {
  const mime = String(doc?.mimeType ?? '');
  if (mime === 'application/x-tgsticker') {
    return 'tgs';
  }
  if (mime === 'video/webm') {
    return 'webm';
  }
  if (mime === 'video/mp4') {
    return 'mp4';
  }
  return mime === 'image/webp' ? 'webp' : mime;
};

/** A document as the page's sticker or GIF. */
export const panelItem = (doc, kind = 'sticker') => {
  const size =
    attribute(doc, 'DocumentAttributeImageSize') ??
    attribute(doc, 'DocumentAttributeVideo');
  return {
    id: text(doc.id),
    kind,
    format: formatOf(doc),
    emoji: attribute(doc, 'DocumentAttributeSticker')?.alt ?? null,
    w: Number(size?.w ?? 0) || null,
    h: Number(size?.h ?? 0) || null,
  };
};

/** A sticker set as the page lists it. */
export const panelSet = (set) => ({
  id: text(set.id),
  title: String(set.title ?? ''),
  count: Number(set.count ?? 0),
  format: set.videos ? 'webm' : set.animated ? 'tgs' : 'webp',
  emoji: Boolean(set.emojis),
});

// What the panel shows for a document: the still sticker itself, else
// its thumbnail; null when there is none small enough.
const pictureOf = (doc) => {
  if (formatOf(doc) === 'webp' && Number(doc.size ?? 0) <= MAX_PICTURE) {
    return { doc, thumb: '', size: Number(doc.size) };
  }
  const thumb = pickSize(doc.thumbs ?? [], 'm');
  return thumb ? { doc, thumb, size: MAX_PICTURE } : null;
};

/** The picture's type, from its first bytes. */
export const sniff = (buffer) => {
  const head = buffer.subarray(0, 12);
  if (head.subarray(0, 4).toString() === 'RIFF') {
    return 'image/webp';
  }
  if (head[0] === 0xff && head[1] === 0xd8) {
    return 'image/jpeg';
  }
  return head.subarray(1, 4).toString() === 'PNG'
    ? 'image/png'
    : 'application/octet-stream';
};

const readCache = async (file) => {
  try {
    const buffer = await fs.readFile(file);
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
};

// Through the account's queue, at the pace of what the user is looking
// at; one request per key (the same key asked again is merged).
export const runIn = (env, key, use) =>
  env.queue ? env.queue.run(key, 'view', use) : use();

export const connect = async (env, userClient) => {
  const client = await userClient();
  if (!client) {
    return null;
  }
  const { Api, helpers } = await env.importer();
  return { client, Api, helpers, zero: helpers.returnBigInt(0) };
};

// Connects, runs `use` with the connection, and turns Telegram's errors
// into the page's codes with `fail`.
export const connected = async (env, userClient, fail, use) => {
  const c = await connect(env, userClient);
  if (!c) {
    return { ok: false, supported: false };
  }
  try {
    return await use(c);
  } catch (error) {
    return fail(error);
  }
};

// Telegram's error names, by `codes`, as the page's codes.
export const failureOf = (codes) => (error) => {
  const name = String(error?.errorMessage ?? error?.message ?? '');
  const key = Object.keys(codes).find((k) => name.includes(k));
  return { ok: false, error: key ?? 'failed', code: codes[key] ?? 'failed' };
};

export const inputSet = (c, set) =>
  new c.Api.InputStickerSetID({
    id: c.helpers.returnBigInt(text(set.id)),
    accessHash: c.helpers.returnBigInt(text(set.accessHash)),
  });

// The lists: the panel's, a set's, the saved GIFs; every document they
// name kept by id, with the list it came from.
const createLists = (env, userClient, now) => {
  const docs = new Map(); // id -> { doc, from }
  const sets = new Map(); // id -> { set, at, items }
  const refetch = new Map(); // a list's prefix -> ask it again
  const kept = { panel: null, gifs: null }; // { at, answer }
  const run = (key, use) => runIn(env, key, use);
  const fresher = (entry, ms) => entry && now() - entry.at < ms;

  const remember = (documents, from, kind) =>
    (documents ?? [])
      .filter((doc) => doc?.className === 'Document')
      .map((doc) => {
        docs.set(text(doc.id), { doc, from });
        return panelItem(doc, kind);
      });

  const ask = (c, key, Request) =>
    run(`stickers:${key}`, () =>
      c.client.invoke(new Request({ hash: c.zero }))
    );

  const stickerPanel = async ({ fresh = false } = {}) => {
    if (!fresh && fresher(kept.panel, LISTS_MS)) {
      return kept.panel.answer;
    }
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    const all = await ask(c, 'sets', c.Api.messages.GetAllStickers);
    const recent = await ask(c, 'recent', c.Api.messages.GetRecentStickers);
    const faved = await ask(c, 'faved', c.Api.messages.GetFavedStickers);
    for (const set of all?.sets ?? []) {
      sets.set(text(set.id), { ...sets.get(text(set.id)), set });
    }
    const answer = {
      ok: true,
      faved: remember(faved?.stickers, 'faved', 'sticker'),
      recent: remember(recent?.stickers, 'recent', 'sticker'),
      sets: (all?.sets ?? []).filter((s) => !s.emojis).map(panelSet),
    };
    kept.panel = { at: now(), answer };
    return answer;
  };

  const stickerSet = async ({ id, fresh = false } = {}) => {
    const key = String(id ?? '');
    const known = sets.get(key);
    if (!known?.set) {
      return { ok: false, error: 'unknown set', code: 'unknown-set' };
    }
    if (!fresh && known.items && fresher(known, SET_MS)) {
      return { ok: true, id: key, stickers: known.items };
    }
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    const answer = await run(`stickers:set:${key}`, () =>
      c.client.invoke(
        new c.Api.messages.GetStickerSet({
          stickerset: inputSet(c, known.set),
          hash: 0,
        })
      )
    );
    const items = remember(answer?.documents, `set:${key}`, 'sticker');
    sets.set(key, { set: answer?.set ?? known.set, at: now(), items });
    return { ok: true, id: key, stickers: items };
  };

  const savedGifs = async ({ fresh = false } = {}) => {
    if (!fresh && fresher(kept.gifs, LISTS_MS)) {
      return kept.gifs.answer;
    }
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    const answer = await ask(c, 'gifs', c.Api.messages.GetSavedGifs);
    const gifs = remember(answer?.gifs, 'gifs', 'gif');
    kept.gifs = { at: now(), answer: { ok: true, gifs } };
    return kept.gifs.answer;
  };

  // The document's list asked again (its file reference expired).
  const again = async (id) => {
    const from = docs.get(id)?.from ?? '';
    const other = [...refetch].find(([prefix]) => from.startsWith(prefix));
    if (other) {
      await other[1](from.slice(other[0].length));
    } else if (from.startsWith('set:')) {
      await stickerSet({ id: from.slice(4), fresh: true });
    } else if (from === 'gifs') {
      await savedGifs({ fresh: true });
    } else {
      await stickerPanel({ fresh: true });
    }
    return docs.get(id)?.doc ?? null;
  };

  // Use a document, asking its list again once if its reference expired.
  const withDoc = async (id, use) => {
    const doc = docs.get(id)?.doc;
    if (!doc) {
      return null;
    }
    try {
      return await use(doc);
    } catch (error) {
      if (!expired(error)) {
        throw error;
      }
      const fresh = await again(id);
      return fresh ? use(fresh) : null;
    }
  };

  return {
    stickerPanel,
    stickerSet,
    savedGifs,
    withDoc,
    known: (id) => docs.has(id),
    setOf: (id) => sets.get(id) ?? null,
    remember,
    // A set opened from a chat's sticker: it and its stickers kept.
    keepSet: (set, answer) => {
      const key = text(set.id);
      const items = remember(answer?.documents, `set:${key}`, 'sticker');
      sets.set(key, { set, at: now(), items });
      return items;
    },
    // Sets found by a search, so their stickers can be asked.
    learnSet: (set) => {
      if (set?.id !== undefined && !sets.get(text(set.id))?.set) {
        sets.set(text(set.id), { set });
      }
    },
    installed: (id) =>
      Boolean(kept.panel?.answer?.sets?.some((s) => s.id === id)),
    // `ask(rest)` asks the list from `prefix + rest` again.
    onAgain: (prefix, ask) => refetch.set(prefix, ask),
    // Telegram puts a sent sticker first among the recent ones.
    sent: () => {
      kept.panel = null;
    },
    // A favourite, a recent sticker or a saved GIF changed.
    changed: () => {
      kept.panel = null;
      kept.gifs = null;
    },
  };
};

const docLocation = (c, doc, thumb) =>
  new c.Api.InputDocumentFileLocation({
    id: c.helpers.returnBigInt(text(doc.id)),
    accessHash: c.helpers.returnBigInt(text(doc.accessHash)),
    fileReference: bytesOf(doc.fileReference),
    thumbSize: thumb,
  });

// The panel's pictures and videos, downloaded once into `mediaDir`.
const createPictures = (env, { userClient, mediaDir }, lists) => {
  const download = async (c, name, location, dcId, size) =>
    runIn(env, `file:sticker:${name}`, async () => {
      const buffer = await c.client.downloadFile(location, {
        dcId: Number(dcId),
        fileSize: c.helpers.returnBigInt(String(Math.max(1, size))),
      });
      return buffer?.length ? Buffer.from(buffer) : null;
    });

  // A video sticker's or GIF's video, or an animated sticker's
  // animation (R-Y113), when small enough.
  const video = async (c, id, doc) => {
    const size = Number(doc.size ?? 0);
    if (!['webm', 'mp4', 'tgs'].includes(formatOf(doc)) || size > MAX_VIDEO) {
      return null;
    }
    const buffer = await download(
      c,
      `${id}-full`,
      docLocation(c, doc, ''),
      doc.dcId,
      size
    );
    return { buffer, mimeType: doc.mimeType };
  };

  const fetchDoc = async (c, id, full) =>
    lists.withDoc(id, async (doc) => {
      if (full) {
        return video(c, id, doc);
      }
      const picture = pictureOf(doc);
      if (!picture) {
        return null;
      }
      const buffer = await download(
        c,
        `${id}-${picture.thumb || 'doc'}`,
        docLocation(c, doc, picture.thumb),
        doc.dcId,
        picture.size
      );
      return buffer ? { buffer, mimeType: sniff(buffer) } : null;
    });

  // A set's own picture, when it is a still one (an animated or video
  // set's is Lottie or a video, not for an <img>).
  const setThumb = async (c, id, set) => {
    const has = (set?.thumbs ?? []).some((t) => t?.className === 'PhotoSize');
    if (!has || set.thumbDcId === undefined) {
      return null;
    }
    const location = new c.Api.InputStickerSetThumb({
      stickerset: inputSet(c, set),
      thumbVersion: Number(set.thumbVersion ?? 0),
    });
    const buffer = await download(
      c,
      `set-${id}`,
      location,
      set.thumbDcId,
      MAX_PICTURE
    );
    const mimeType = buffer ? sniff(buffer) : '';
    return mimeType.startsWith('image/') ? { buffer, mimeType } : null;
  };

  // Else its first sticker's picture, the set asked for it if need be.
  const fetchSet = async (c, id) => {
    const thumb = await setThumb(c, id, lists.setOf(id)?.set);
    if (thumb) {
      return thumb;
    }
    if (lists.setOf(id)?.set && !lists.setOf(id).items) {
      await lists.stickerSet({ id });
    }
    const first = lists.setOf(id)?.items?.[0]?.id;
    return first ? fetchDoc(c, first, false) : null;
  };

  const fetchFresh = async ({ key, set, full }) => {
    const c = await connect(env, userClient);
    if (!c) {
      return null;
    }
    return set ? fetchSet(c, key) : fetchDoc(c, key, full);
  };

  const stickerPicture = async ({ id, set, full = false } = {}) => {
    const key = set ? String(set) : String(id ?? '');
    if (!ID.test(key) || !mediaDir) {
      return null;
    }
    const name = set ? `set-${key}` : `${key}${full ? '-full' : ''}`;
    const file = path.join(mediaDir, 'stickers', name);
    const cached = await readCache(file);
    const type = cached ? String(await readCache(`${file}.type`)) : '';
    if (cached && FULL_TYPE.test(type)) {
      return { buffer: cached, mimeType: type };
    }
    const got = await fetchFresh({ key, set, full });
    if (!got?.buffer) {
      return null;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, got.buffer);
    await fs.writeFile(`${file}.type`, got.mimeType);
    return got;
  };

  return stickerPicture;
};

const inputDocument = (c, doc) =>
  new c.Api.InputDocument({
    id: c.helpers.returnBigInt(text(doc.id)),
    accessHash: c.helpers.returnBigInt(text(doc.accessHash)),
    fileReference: bytesOf(doc.fileReference),
  });

const sendRequest = (c, doc, peer, draft) =>
  new c.Api.messages.SendMedia({
    peer,
    media: new c.Api.InputMediaDocument({ id: inputDocument(c, doc) }),
    message: '',
    randomId: randomIdOf(draft.clientId, 0, c.helpers),
    clearDraft: false,
    ...(draft.silent ? { silent: true } : {}),
    ...(draft.scheduleDate ? { scheduleDate: draft.scheduleDate } : {}),
    ...replyHeader(c.Api, draft.replyTo, null),
  });

// A sticker or GIF sent as it is; Telegram's answer to the live handler.
const createSender = (env, { userClient, apply }, lists) => {
  const sendDocument = async (draft = {}) => {
    const target = String(draft.chat ?? '');
    const key = String(draft.id ?? '');
    if (!lists.known(key) || !target) {
      return { ok: false, error: 'unknown sticker', code: 'unknown-sticker' };
    }
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    try {
      const result = await lists.withDoc(key, (doc) =>
        env.connection.withPeer(c.client, target, (peer) =>
          c.client.invoke(sendRequest(c, doc, peer, draft))
        )
      );
      if (result && typeof result === 'object') {
        await apply(c.client, result);
      }
    } catch (error) {
      throw sendError(error);
    }
    lists.sent();
    if (draft.scheduleDate) {
      env.actions?.scheduledChanged?.(target);
      return { ok: true, chat: target, scheduled: true };
    }
    return { ok: true, chat: target };
  };
  return sendDocument;
};

// What the panel's menu changes (R-Y115), as Telegram asks it.
const SAVES = {
  fave: (c, id) => new c.Api.messages.FaveSticker({ id, unfave: false }),
  unfave: (c, id) => new c.Api.messages.FaveSticker({ id, unfave: true }),
  unrecent: (c, id) =>
    new c.Api.messages.SaveRecentSticker({ id, attached: false, unsave: true }),
  saveGif: (c, id) => new c.Api.messages.SaveGif({ id, unsave: false }),
  unsaveGif: (c, id) => new c.Api.messages.SaveGif({ id, unsave: true }),
};
export const STICKER_SAVES = Object.freeze(Object.keys(SAVES));

// A sticker made a favourite or not, taken from the recent ones, a GIF
// saved or not; the lists asked again after.
const createSaver =
  (env, { userClient }, lists) =>
  async ({ id, action } = {}) => {
    const key = String(id ?? '');
    if (!lists.known(key) || !Object.hasOwn(SAVES, String(action))) {
      return { ok: false, error: 'unknown sticker', code: 'unknown-sticker' };
    }
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    await lists.withDoc(key, (doc) =>
      runIn(env, `stickers:save:${action}:${key}`, () =>
        c.client.invoke(SAVES[action](c, inputDocument(c, doc)))
      )
    );
    lists.changed();
    return { ok: true };
  };

// A set the panel showed added to the user's sets, or removed; the
// panel's lists asked again after.
const createInstaller =
  (env, { userClient }, lists) =>
  async ({ id, install = true } = {}) => {
    const key = String(id ?? '');
    const set = lists.setOf(key)?.set;
    if (!set) {
      return { ok: false, error: 'unknown set', code: 'unknown-set' };
    }
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    const stickerset = inputSet(c, set);
    await runIn(env, `stickers:install:${key}`, () =>
      c.client.invoke(
        install
          ? new c.Api.messages.InstallStickerSet({
              stickerset,
              archived: false,
            })
          : new c.Api.messages.UninstallStickerSet({ stickerset })
      )
    );
    lists.changed();
    return { ok: true, id: key, installed: Boolean(install) };
  };

// The set a chat's sticker belongs to, by id and access hash or by
// short name; Telegram's answer kept in the lists (R-Y124). The box
// says "Remove" for a set the user has (`installedDate`).
// What Telegram is asked for: the id and access hash, else the name.
const boxRequest = (c, { id, accessHash, shortName }) => {
  if (SET_ID.test(String(id ?? '')) && SET_ID.test(String(accessHash ?? ''))) {
    return inputSet(c, { id, accessHash });
  }
  return SHORT_NAME.test(String(shortName ?? ''))
    ? new c.Api.InputStickerSetShortName({ shortName: String(shortName) })
    : null;
};

const createBox =
  (env, { userClient }, lists) =>
  async (named = {}) => {
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    const stickerset = boxRequest(c, named);
    const answer = stickerset
      ? await runIn(env, `stickers:box:${named.id ?? named.shortName}`, () =>
          c.client.invoke(
            new c.Api.messages.GetStickerSet({ stickerset, hash: 0 })
          )
        )
      : null;
    const set = answer?.set;
    if (!set || set.id === undefined) {
      return { ok: false, error: 'unknown set', code: 'unknown-set' };
    }
    const items = lists.keepSet(set, answer);
    return {
      ok: true,
      set: {
        ...panelSet(set),
        shortName: String(set.shortName ?? ''),
        count: items.length || Number(set.count ?? 0),
        installed: Boolean(set.installedDate),
      },
      items,
    };
  };

// A die's animations (R-Y130): Telegram's set for its emoji
// (inputStickerSetDice), the n-th sticker rolling to the value n, the
// first one the die at rest; kept an hour.
const createDice = (env, { userClient }, lists, now) => {
  const kept = new Map(); // emoticon -> { at, answer }
  return async ({ emoticon } = {}) => {
    const key = String(emoticon ?? '');
    if (!DICE.includes(key)) {
      return { ok: false, error: 'unknown die', code: 'bad-request' };
    }
    const entry = kept.get(key);
    if (entry && now() - entry.at < SET_MS) {
      return entry.answer;
    }
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    const answer = await runIn(env, `stickers:dice:${key}`, () =>
      c.client.invoke(
        new c.Api.messages.GetStickerSet({
          stickerset: new c.Api.InputStickerSetDice({ emoticon: key }),
          hash: 0,
        })
      )
    );
    if (!answer?.set || answer.set.id === undefined) {
      return { ok: false, error: 'unknown set', code: 'unknown-set' };
    }
    const result = {
      ok: true,
      emoticon: key,
      items: lists.keepSet(answer.set, answer),
    };
    kept.set(key, { at: now(), answer: result });
    return result;
  };
};

/** `env`: the account's; `apply(client, result)` the live handler. */
export const createStickers = (
  env,
  { userClient, apply, mediaDir },
  { now = () => Date.now() } = {}
) => {
  const lists = createLists(env, userClient, now);
  return {
    stickerPanel: lists.stickerPanel,
    stickerSet: lists.stickerSet,
    savedGifs: lists.savedGifs,
    ...createStickerSearch(env, { userClient, lists, now }),
    ...createInlineBots(env, { userClient, apply, lists, now }),
    stickerPicture: createPictures(env, { userClient, mediaDir }, lists),
    sendDocument: createSender(env, { userClient, apply }, lists),
    stickerSave: createSaver(env, { userClient }, lists),
    stickerSetInstall: createInstaller(env, { userClient }, lists),
    stickerSetBox: createBox(env, { userClient }, lists),
    stickerDice: createDice(env, { userClient }, lists, now),
  };
};
