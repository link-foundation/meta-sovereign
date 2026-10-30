/**
 * Custom emoji in messages, as Telegram's apps draw them (R-Y120;
 * learned, never copied). A message's `MessageEntityCustomEmoji` names a
 * document by id; this asks Telegram for those documents
 * (messages.getCustomEmojiDocuments), ids asked close together in one
 * request (up to 200), each document kept by id, and gives the page:
 *
 * - `customEmojiPicture({ id, full })` — the emoji's still picture: a
 *   webp sticker itself, else its thumbnail; `full` the animation (a
 *   .tgs, for the page's Lottie player) or the video (a webm), null for
 *   a still one. Each downloaded once into the app folder, with the
 *   sticker pictures' size limits.
 *
 * The page may name any id the message carried; one Telegram does not
 * know is refused (null). An expired file reference asks again once.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pickSize, downloadBytes, downloadSize } from './telegram-media.js';
import { connect, formatOf, runIn, sniff } from './telegram-stickers.js';
import { floodSeconds, isDisconnected } from './telegram-history.js';

const MAX_IDS = 200;
const MAX_DOCUMENTS = 1024;
const BATCH_MS = 25;
const MAX_PICTURE = 512 * 1024;
const MAX_VIDEO = 4 * 1024 * 1024;
const ID = /^\d{1,20}$/;
const TYPE = /^(image\/|video\/|application\/x-tgsticker$)/;
const failureCode = (error) =>
  String(
    error?.errorMessage ?? error?.code ?? error?.name ?? 'download-failed'
  ).slice(0, 60);

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

const readCache = async (file) => {
  try {
    const buffer = await fs.readFile(file);
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
};

// The documents, by id; ids asked within `delay` ms go in one request.
const createDocuments = (env, userClient, delay) => {
  const docs = new Map(); // id -> document, or null (Telegram has none)
  let batch = null;

  const ask = async (ids) => {
    const c = await connect(env, userClient);
    if (!c) {
      return;
    }
    const answer = await runIn(env, `custom-emoji:${ids[0]}`, () =>
      c.client.invoke(
        new c.Api.messages.GetCustomEmojiDocuments({
          documentId: ids.map((id) => c.helpers.returnBigInt(id)),
        })
      )
    );
    const list = Array.isArray(answer) ? answer : (answer?.documents ?? []);
    for (const id of ids) {
      docs.set(id, null);
    }
    for (const doc of list) {
      if (doc?.className === 'Document' && docs.has(text(doc.id))) {
        docs.set(text(doc.id), doc);
      }
    }
    while (docs.size > MAX_DOCUMENTS) {
      docs.delete(docs.keys().next().value);
    }
  };

  const open = () => {
    const made = { ids: new Set(), sent: false };
    made.done = new Promise((resolve) =>
      globalThis.setTimeout(resolve, delay)
    ).then(() => {
      made.sent = true;
      return ask([...made.ids]);
    });
    return made;
  };

  const lookup = async (id) => {
    if (docs.has(id)) {
      const doc = docs.get(id);
      docs.delete(id);
      docs.set(id, doc);
      return doc;
    }
    if (!batch || batch.sent || batch.ids.size >= MAX_IDS) {
      batch = open();
    }
    batch.ids.add(id);
    await batch.done;
    return docs.get(id) ?? null;
  };

  return { lookup, forget: (id) => docs.delete(id) };
};

const pictureOf = (doc) => {
  if (formatOf(doc) === 'webp' && Number(doc.size ?? 0) <= MAX_PICTURE) {
    return { thumb: '', size: Number(doc.size) };
  }
  const thumb = pickSize(doc.thumbs ?? [], 'm');
  return thumb ? { thumb, size: downloadBytes(doc, thumb) } : null;
};

const location = (c, doc, thumb) =>
  new c.Api.InputDocumentFileLocation({
    id: c.helpers.returnBigInt(text(doc.id)),
    accessHash: c.helpers.returnBigInt(text(doc.accessHash)),
    fileReference: bytesOf(doc.fileReference),
    thumbSize: thumb,
  });

const download = (env, c, name, doc, thumb, size) =>
  runIn(env, `file:custom-emoji:${name}`, async () => {
    const buffer = await c.client.downloadFile(location(c, doc, thumb), {
      dcId: Number(doc.dcId),
      ...downloadSize(c.helpers, size),
    });
    return buffer?.length ? Buffer.from(buffer) : null;
  });

// What the page shows for a document, or null when there is none.
const pictureFor = async (env, c, id, doc, full) => {
  if (full) {
    const size = Number(doc.size ?? 0);
    if (!['webm', 'tgs'].includes(formatOf(doc)) || size > MAX_VIDEO) {
      return null;
    }
    const buffer = await download(env, c, `${id}-full`, doc, '', size);
    return buffer ? { buffer, mimeType: doc.mimeType } : null;
  }
  const picture = pictureOf(doc);
  if (!picture) {
    return null;
  }
  const buffer = await download(
    env,
    c,
    `${id}-${picture.thumb || 'doc'}`,
    doc,
    picture.thumb,
    picture.size
  );
  return buffer ? { buffer, mimeType: sniff(buffer) } : null;
};

/** `env`: the account's; `userClient` its user client (null for a bot). */
export const createCustomEmoji = (
  env,
  { userClient, mediaDir },
  { delay = BATCH_MS } = {}
) => {
  const documents = createDocuments(env, userClient, delay);
  const inFlight = new Map();
  const load = async (key, full) => {
    const started = Date.now();
    try {
      const got = await fetchFresh(key, full);
      env.log?.({
        event: 'telegram_custom_emoji',
        full,
        duration_ms: Date.now() - started,
        bytes: got?.buffer?.length ?? 0,
        pending: inFlight.size,
      });
      return got;
    } catch (error) {
      const retrying = isDisconnected(error) || floodSeconds(error) > 0;
      env.log?.({
        level: retrying ? 'info' : 'warn',
        event: retrying
          ? 'telegram_custom_emoji_retrying'
          : 'telegram_custom_emoji_failed',
        full,
        duration_ms: Date.now() - started,
        code: failureCode(error),
      });
      throw error;
    }
  };

  const fetchFresh = async (id, full, retry = true) => {
    const doc = await documents.lookup(id);
    const c = doc ? await connect(env, userClient) : null;
    if (!c) {
      return null;
    }
    try {
      return await pictureFor(env, c, id, doc, full);
    } catch (error) {
      if (!expired(error) || !retry) {
        throw error;
      }
      documents.forget(id);
      return fetchFresh(id, full, false);
    }
  };

  const read = async (key, full) => {
    const name = `${key}${full ? '-full' : ''}`;
    const file = path.join(mediaDir, 'custom-emoji', name);
    const cached = await readCache(file);
    const type = cached ? String(await readCache(`${file}.type`)) : '';
    if (cached && TYPE.test(type)) {
      return { buffer: cached, mimeType: type };
    }
    const got = await load(key, full);
    if (!got?.buffer) {
      return null;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, got.buffer);
    await fs.writeFile(`${file}.type`, got.mimeType);
    return got;
  };

  const customEmojiPicture = ({ id, full = false } = {}) => {
    const key = String(id ?? '');
    if (!ID.test(key) || !mediaDir) {
      return Promise.resolve(null);
    }
    const name = `${key}:${Boolean(full)}`;
    // Share disk checks, document lookups, downloads and cache writes, even
    // when the same emoji appears in several rows or a retry arrives early.
    if (!inFlight.has(name)) {
      inFlight.set(
        name,
        read(key, full).finally(() => inFlight.delete(name))
      );
    }
    return inFlight.get(name);
  };

  return { customEmojiPicture };
};
