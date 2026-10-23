/**
 * The whole file of a document an Instant View page used: its video, audio
 * or file (R-Y224; learned, never copied). Read-only: downloaded through
 * the Telegram client (up to 64 MB), never from the page's own site; the
 * last two are kept so a player's range requests share one download.
 *   `createWholeFiles(env, context, files)(key)` -> `{ buffer, mimeType,
 *   name }`, `{ error: 'too-large', size }` or null; `key` is
 *   `document:<id>` of the `files` map the page remembered.
 */

import { runIn, connected } from './telegram-stickers.js';
import { bigSize, fileLocation, nameOf } from './telegram-media.js';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_KEPT = 2;

const plain = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

export const createWholeFiles = (env, context, files) => {
  const kept = new Map(); // key -> { buffer, mimeType, name }
  const reading = new Map(); // key -> the download going on

  const download = async (c, file) => {
    const size = Number(plain(file.size)) || 0;
    if (size > MAX_BYTES) {
      return { error: 'too-large', size };
    }
    const buffer = await runIn(
      env,
      `instant-view-file:document:${plain(file.id)}:full`,
      () =>
        c.client.downloadFile(fileLocation(c.Api, c.helpers, file), {
          dcId: Number(file.dcId),
          fileSize: bigSize(c.helpers, size),
        })
    );
    return buffer?.length
      ? {
          buffer: Buffer.from(buffer),
          mimeType: plain(file.mimeType) || 'application/octet-stream',
          name: nameOf(file),
        }
      : null;
  };

  return async (key) => {
    if (kept.has(key)) {
      return kept.get(key);
    }
    if (!reading.has(key)) {
      reading.set(
        key,
        connected(
          env,
          context.userClient,
          () => null,
          (c) => download(c, files.get(key))
        ).finally(() => reading.delete(key))
      );
    }
    const got = await reading.get(key);
    if (got?.buffer) {
      kept.set(key, got);
      if (kept.size > MAX_KEPT) {
        kept.delete(kept.keys().next().value);
      }
    }
    return got;
  };
};
