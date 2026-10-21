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
 *   own picture; `full` a video sticker's or GIF's video (to play while
 *   pointed at). Each downloaded once into the app folder;
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
import { randomIdOf, replyHeader, sendError } from './telegram-send.js';

const LISTS_MS = 10 * 60_000;
const SET_MS = 60 * 60_000;
// Pictures and videos larger than this are not downloaded for the panel.
const MAX_PICTURE = 512 * 1024;
const MAX_VIDEO = 4 * 1024 * 1024;
const ID = /^\d{1,20}$/;

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
const runIn = (env, key, use) =>
  env.queue ? env.queue.run(key, 'view', use) : use();

const connect = async (env, userClient) => {
  const client = await userClient();
  if (!client) {
    return null;
  }
  const { Api, helpers } = await env.importer();
  return { client, Api, helpers, zero: helpers.returnBigInt(0) };
};

const inputSet = (c, set) =>
  new c.Api.InputStickerSetID({
    id: c.helpers.returnBigInt(text(set.id)),
    accessHash: c.helpers.returnBigInt(text(set.accessHash)),
  });

// The lists: the panel's, a set's, the saved GIFs; every document they
// name kept by id, with the list it came from.
const createLists = (env, userClient, now) => {
  const docs = new Map(); // id -> { doc, from }
  const sets = new Map(); // id -> { set, at, items }
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
    if (from.startsWith('set:')) {
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
    // Telegram puts a sent sticker first among the recent ones.
    sent: () => {
      kept.panel = null;
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

  // A video sticker's or GIF's video, when small enough.
  const video = async (c, id, doc) => {
    const size = Number(doc.size ?? 0);
    if (!['webm', 'mp4'].includes(formatOf(doc)) || size > MAX_VIDEO) {
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
    if (cached && /^(image|video)\//.test(type)) {
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

const sendRequest = (c, doc, peer, draft) =>
  new c.Api.messages.SendMedia({
    peer,
    media: new c.Api.InputMediaDocument({
      id: new c.Api.InputDocument({
        id: c.helpers.returnBigInt(text(doc.id)),
        accessHash: c.helpers.returnBigInt(text(doc.accessHash)),
        fileReference: bytesOf(doc.fileReference),
      }),
    }),
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
    stickerPicture: createPictures(env, { userClient, mediaDir }, lists),
    sendDocument: createSender(env, { userClient, apply }, lists),
  };
};
