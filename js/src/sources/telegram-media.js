/**
 * Pictures of Telegram messages, store first (R-Y36): a photo, a link
 * preview's photo, a file's thumbnail or a small picture sent as a file
 * (a sticker), for the chat to show inline as Telegram's apps do.
 *
 * Where a picture is comes from the stored message (`raw.media`, R-Y28):
 * its id, access hash, file reference and data centre. So showing it is
 * one download, never a re-read of the message first; only when Telegram
 * says the file reference expired is the message read again (by its
 * stored peer, through the queue) and the download tried once more.
 *
 * Each picture is downloaded once: it is kept in the app folder
 * (`<store>/media/telegram/<chat>/<id>-<size>`) and served from there.
 * Downloads go through the account's queue at `list` priority — after
 * what the user scrolls to, before anything read ahead (R-Y34). Videos,
 * voice notes and large files are never downloaded here.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { importTelegram } from './telegram-layer.js';

// Pictures larger than this are not downloaded (a thumbnail is).
const MAX_BYTES = 2 * 1024 * 1024;
// Photo sizes, the largest first, for `size=x`; `m` prefers the medium.
const SIZE_ORDER = ['w', 'y', 'x', 'm', 's'];
const SIZES = new Set(['s', 'm', 'x', 'y', 'w']);

const CHAT = /^-?\d{1,20}$/;

const whole = (n, min, max = Infinity) =>
  Number.isInteger(n) && n >= min && n <= max;

const text = (value) =>
  value === null || value === undefined ? null : String(value.value ?? value);

// GramJS sizes its download parts by `fileSize.lesser(…)`: a plain
// number throws ("fileSize.lesser is not a function"), so every photo,
// sticker and file would fail.
export const bigSize = (helpers, size) =>
  helpers.returnBigInt(String(Math.max(0, Math.floor(Number(size) || 0))));

const bytesOf = (value) => {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value?.bytes === 'string') {
    return Buffer.from(value.bytes, 'base64');
  }
  return Buffer.alloc(0);
};

const sizeBytes = (s) =>
  Array.isArray(s?.sizes) ? Math.max(...s.sizes) : Number(s?.size ?? 0);

// Downloadable sizes (not the inline stripped one) and their type.
const realSizes = (sizes = []) =>
  sizes.filter(
    (s) =>
      s?.className === 'PhotoSize' || s?.className === 'PhotoSizeProgressive'
  );

/** The size type to download for `want` among `sizes`, or null. */
export const pickSize = (sizes, want = 'm') => {
  const real = realSizes(sizes).filter((s) => sizeBytes(s) <= MAX_BYTES);
  const has = (type) => real.some((s) => s.type === type);
  if (has(want)) {
    return want;
  }
  const from = SIZE_ORDER.indexOf(want);
  const order =
    from < 0
      ? SIZE_ORDER
      : [...SIZE_ORDER.slice(from + 1), ...SIZE_ORDER.slice(0, from).reverse()];
  return order.find(has) ?? real.at(-1)?.type ?? null;
};

const isSmallImage = (doc) =>
  /^image\/(jpeg|png|webp|gif)$/.test(doc?.mimeType ?? '') &&
  Number(doc?.size ?? Infinity) <= MAX_BYTES;

// A photo: of the message, or of its link preview.
const photoOf = (media) => {
  if (media?.className === 'MessageMediaPhoto') {
    return media.photo;
  }
  if (media?.className === 'MessageMediaGame') {
    return media.game?.photo;
  }
  return media?.className === 'MessageMediaWebPage'
    ? media.webpage?.photo
    : null;
};

const documentPicture = (doc, want) => {
  if (isSmallImage(doc) && want !== 's') {
    return { kind: 'document', file: doc, thumb: '', mimeType: doc.mimeType };
  }
  const thumb = pickSize(doc.thumbs ?? [], want);
  return thumb
    ? { kind: 'document', file: doc, thumb, mimeType: 'image/jpeg' }
    : null;
};

/**
 * The media a message shows: its own, or for paid media (R-Y176) the
 * `part`th item once unlocked (a locked one has no file), else null.
 */
export const mediaOf = (raw, part = 0) => {
  const media = raw?.media;
  if (media?.className !== 'MessageMediaPaidMedia') {
    return media;
  }
  const item = media.extendedMedia?.[part];
  return item?.className === 'MessageExtendedMedia' ? item.media : null;
};

/**
 * What to download for a stored message: `{ kind, file, thumb, mimeType }`
 * (`file` the photo or document as stored), or null when it has no picture.
 */
export const pictureOf = (raw, want = 'm', part = 0) => {
  const media = mediaOf(raw, part);
  const photo = photoOf(media);
  if (photo?.id !== undefined && photo.sizes) {
    const thumb = pickSize(photo.sizes, want);
    return thumb
      ? { kind: 'photo', file: photo, thumb, mimeType: 'image/jpeg' }
      : null;
  }
  const doc =
    media?.className === 'MessageMediaDocument' ? media.document : null;
  return doc?.id ? documentPicture(doc, want) : null;
};

export const locationOf = (Api, helpers, picture) => {
  const big = (value) => helpers.returnBigInt(text(value));
  const fields = {
    id: big(picture.file.id),
    accessHash: big(picture.file.accessHash),
    fileReference: bytesOf(picture.file.fileReference),
    thumbSize: picture.thumb,
  };
  return picture.kind === 'photo'
    ? new Api.InputPhotoFileLocation(fields)
    : new Api.InputDocumentFileLocation(fields);
};

const expired = (error) =>
  /FILE_REFERENCE_(EXPIRED|INVALID)/.test(
    String(error?.errorMessage ?? error?.message ?? '')
  );

export const readCache = async (file) => {
  try {
    const buffer = await fs.readFile(file);
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
};

/**
 * `read({ chat, id, size })` → `{ buffer, mimeType }`, or null when the
 * message has no picture. `client()` is the connected GramJS client (or
 * null), `peerOf(chat)` the stored input peer, `refresh(chat, ids)` reads
 * messages again into the store.
 */
export const createMediaReader = ({
  store,
  dir,
  queue,
  client: clientOf,
  refresh,
  importer = importTelegram,
  log = () => {},
}) => {
  const download = async (client, picture) => {
    const { Api, helpers } = await importer();
    const buffer = await client.downloadFile(
      locationOf(Api, helpers, picture),
      {
        dcId: Number(picture.file.dcId),
        fileSize: bigSize(helpers, MAX_BYTES),
      }
    );
    return buffer?.length ? Buffer.from(buffer) : null;
  };

  const fetchPicture = async (chat, id, want, part) => {
    const linkId = `msg:telegram:${chat}:${id}`;
    const picture = pictureOf((await store.get(linkId))?.raw, want, part);
    const client = picture ? await clientOf() : null;
    if (!client) {
      return null;
    }
    const key = `media:${chat}:${id}:${picture.thumb}${part ? `:p${part}` : ''}`;
    try {
      return {
        buffer: await queue.run(key, 'list', () => download(client, picture)),
        mimeType: picture.mimeType,
      };
    } catch (error) {
      if (!expired(error) || !refresh) {
        throw error;
      }
      // The file reference is old: read the message again, then retry.
      log({ event: 'telegram_media_reference_expired' });
      await refresh({ chat, ids: [id], priority: 'list' });
      const fresh = pictureOf((await store.get(linkId))?.raw, want, part);
      return fresh
        ? {
            buffer: await queue.run(`${key}:again`, 'list', () =>
              download(client, fresh)
            ),
            mimeType: fresh.mimeType,
          }
        : null;
    }
  };

  const read = async ({ chat, id, size = 'm', part = 0 } = {}) => {
    const target = String(chat ?? '');
    const msg = Number(id);
    const want = SIZES.has(size) ? size : 'm';
    // All name a path in the app folder: digits only. `part` is the item
    // of a paid-media message (R-Y176).
    if (!CHAT.test(target) || !whole(msg, 1) || !whole(part, 0, 9)) {
      return null;
    }
    const file = path.join(
      dir,
      target,
      `${msg}-${want}${part ? `-p${part}` : ''}`
    );
    const cached = await readCache(file);
    if (cached) {
      const meta = await readCache(`${file}.type`);
      return { buffer: cached, mimeType: meta?.toString() || 'image/jpeg' };
    }
    const got = await fetchPicture(target, msg, want, part);
    if (!got?.buffer) {
      return null;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, got.buffer);
    await fs.writeFile(`${file}.type`, got.mimeType);
    return got;
  };

  return { read };
};

// Documents up to this size are downloaded and served.
const MAX_FILE_BYTES = 64 * 1024 * 1024;

// Document kind for the log (best-effort from mime and attributes).
export const docKind = (doc) => {
  const mime = doc?.mimeType ?? '';
  const attrs = doc?.attributes ?? [];
  if (attrs.some((a) => a?.className === 'DocumentAttributeAnimated')) {
    return 'gif';
  }
  if (
    attrs.some(
      (a) => a?.className === 'DocumentAttributeAudio' && a.voice === true
    )
  ) {
    return 'voice';
  }
  if (mime.startsWith('video/')) {
    return 'video';
  }
  if (mime.startsWith('audio/')) {
    return 'audio';
  }
  if (
    mime === 'application/x-tgsticker' ||
    (mime === 'image/webp' &&
      attrs.some((a) => a?.className === 'DocumentAttributeSticker'))
  ) {
    return 'sticker';
  }
  return 'file';
};

export const fileLocation = (Api, helpers, doc) => {
  const big = (value) => helpers.returnBigInt(text(value));
  return new Api.InputDocumentFileLocation({
    id: big(doc.id),
    accessHash: big(doc.accessHash),
    fileReference: bytesOf(doc.fileReference),
    thumbSize: '',
  });
};

/**
 * `read({ chat, id })` → `{ buffer, mimeType }`, or null when the
 * message has no document, or `{ error: 'too-large', size }` when the
 * file exceeds 64 MB. Concurrent requests for the same file share one
 * download. An expired file reference triggers one re-read and retry.
 */
export const createFileReader = ({
  store,
  dir,
  queue,
  client: clientOf,
  refresh,
  importer = importTelegram,
  log = () => {},
}) => {
  // Concurrent requests for the same chat:id share one download promise.
  const inFlight = new Map();

  const download = async (client, doc) => {
    const { Api, helpers } = await importer();
    const size = Number(doc.size ?? 0);
    const priority = size <= MAX_BYTES ? 'view' : 'list';
    const key = `file:${text(doc.id)}`;
    const buffer = await queue.run(key, priority, () =>
      client.downloadFile(fileLocation(Api, helpers, doc), {
        dcId: Number(doc.dcId),
        fileSize: bigSize(helpers, size),
      })
    );
    return buffer?.length ? Buffer.from(buffer) : null;
  };

  const getDoc = async (chat, id) => {
    const link = await store.get(`msg:${SOURCE}:${chat}:${id}`);
    const media = mediaOf(link?.raw);
    return media?.className === 'MessageMediaDocument' ? media.document : null;
  };

  const downloadWithRetry = async (client, chat, id) => {
    const doc = await getDoc(chat, id);
    if (!doc?.id) {
      return null;
    }
    try {
      return { buffer: await download(client, doc), mimeType: doc.mimeType };
    } catch (error) {
      if (!expired(error) || !refresh) {
        throw error;
      }
      log({ event: 'telegram_file_reference_expired' });
      await refresh({ chat, ids: [id], priority: 'list' });
      const fresh = await getDoc(chat, id);
      if (!fresh?.id) {
        return null;
      }
      return {
        buffer: await download(client, fresh),
        mimeType: fresh.mimeType,
      };
    }
  };

  const read = async ({ chat, id } = {}) => {
    const target = String(chat ?? '');
    const msg = Number(id);
    if (!CHAT.test(target) || !Number.isInteger(msg) || msg <= 0) {
      return null;
    }
    const file = path.join(dir, target, `${msg}-file`);
    const cachedBuf = await readCache(file);
    if (cachedBuf) {
      const typeBuf = await readCache(`${file}.type`);
      const started = Date.now();
      const doc = await getDoc(target, msg);
      log({
        event: 'telegram_file',
        kind: docKind(doc),
        bytes: cachedBuf.length,
        cached: true,
        duration_ms: Date.now() - started,
      });
      return {
        buffer: cachedBuf,
        mimeType: typeBuf?.toString() || 'application/octet-stream',
      };
    }

    // Check size before downloading.
    const doc = await getDoc(target, msg);
    if (!doc?.id) {
      return null;
    }
    const size = Number(doc.size ?? 0);
    if (size > MAX_FILE_BYTES) {
      return { error: 'too-large', size };
    }

    const flightKey = `${target}:${msg}`;
    if (inFlight.has(flightKey)) {
      return inFlight.get(flightKey);
    }
    const started = Date.now();
    const client = await clientOf();
    if (!client) {
      return null;
    }
    const kind = docKind(doc);
    const p = downloadWithRetry(client, target, msg)
      .then(async (got) => {
        if (!got?.buffer) {
          return null;
        }
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, got.buffer);
        await fs.writeFile(`${file}.type`, got.mimeType ?? '');
        log({
          event: 'telegram_file',
          kind,
          bytes: got.buffer.length,
          cached: false,
          duration_ms: Date.now() - started,
        });
        return got;
      })
      .catch((error) => {
        log({
          level: 'warn',
          event: 'telegram_file_failed',
          error: error.errorMessage ?? error.message,
        });
        return null;
      })
      .finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, p);
    return p;
  };

  return { read };
};

// SOURCE used in store key lookups inside this module.
const SOURCE = 'telegram';
