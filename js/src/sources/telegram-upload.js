/**
 * Sending files and photos, as Telegram's apps do it (R-Y99; Telegram
 * Desktop's "Send as photo / as files", learned, never copied).
 *
 * Two steps, so a group of photos can go as one album:
 *
 * - `receiveUpload(stream, { name })` keeps one file the page uploads
 *   in a temporary folder of its own and answers `{ token, name, size }`;
 *   a file larger than Telegram takes is refused while it streams.
 * - `sendFiles({ chat, tokens, caption, asPhoto, group, replyTo })`
 *   sends them: pictures as photos (compressed, shown in the chat) when
 *   `asPhoto`, else everything as files; with `group`, photos together go
 *   as albums of up to ten, files together likewise — as Desktop groups
 *   them; the caption goes with the first. A picture Telegram will not
 *   take as a photo (too big, too long) goes as a file instead, as
 *   Desktop does. What Telegram answers is stored at once; the files are
 *   removed after.
 *
 * Captions are sent as typed (no markdown), like messages
 * (./telegram-send.js).
 */

import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { sendError } from './telegram-send.js';

// Telegram takes files up to 2 GB from an account (4 GB with Premium).
export const MAX_UPLOAD = 2000 * 1024 * 1024;
export const MAX_FILES = 100;
export const ALBUM_SIZE = 10;
export const MAX_CAPTION = 4096;
const KEEP_MS = 60 * 60 * 1000;

const IMAGE = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i;
// GIFs and WebP go as animations and stickers' kin, not as photos.
const PHOTO = /\.(jpe?g|png|bmp|heic|heif)$/i;
const NOT_A_PHOTO =
  /PHOTO_INVALID_DIMENSIONS|PHOTO_SAVE_FILE_INVALID|IMAGE_PROCESS_FAILED|PHOTO_EXT_INVALID|PHOTO_CROP_SIZE_SMALL/;

export const isImageName = (name) => IMAGE.test(String(name ?? ''));

/** A file's name as given, made safe: no folders, no control characters. */
export const safeName = (name) => {
  const base = path.basename(String(name ?? '').replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean && clean !== '.' && clean !== '..'
    ? clean.slice(0, 200)
    : 'file';
};

const tooLarge = () =>
  Object.assign(new Error('file too large'), { code: 'too-large' });

// Counts what passes and stops past `max`.
const limiter = (max) => {
  let seen = 0;
  return new Transform({
    transform(chunk, _encoding, done) {
      seen += chunk.length;
      done(seen > max ? tooLarge() : null, chunk);
    },
  });
};

/**
 * Batches as Desktop sends them: with `group`, consecutive photos (or
 * consecutive files) together, ten at most; else one by one.
 */
export const batchesOf = (files, { asPhoto, group }) => {
  const batches = [];
  for (const file of files) {
    const photo = Boolean(asPhoto) && PHOTO.test(file.name);
    const last = batches.at(-1);
    if (
      group &&
      last &&
      last.photo === photo &&
      last.files.length < ALBUM_SIZE
    ) {
      last.files.push(file);
    } else {
      batches.push({ photo, files: [file] });
    }
  }
  return batches;
};

const messagesOf = (sent) =>
  (Array.isArray(sent) ? sent : [sent]).filter((m) => m && m.id !== undefined);

/**
 * `env` is the account's; `userClient()` the user client or null;
 * `dialogOf(chat)` the chat as listed; `tools` its `toLinks` and
 * `writeChanged`. `importer()` gives GramJS (its uploads' `CustomFile`).
 */
export const createFileSender = (
  env,
  { userClient, dialogOf, tools },
  { tmp = os.tmpdir(), now = () => Date.now() } = {}
) => {
  const uploads = new Map();

  const drop = async (token) => {
    const entry = uploads.get(token);
    uploads.delete(token);
    if (entry) {
      await rm(entry.dir, { recursive: true, force: true }).catch(() => {});
    }
  };

  // Uploads never sent (the page closed) go after an hour.
  const sweep = () =>
    Promise.all(
      [...uploads]
        .filter(([, entry]) => now() - entry.at > KEEP_MS)
        .map(([token]) => drop(token))
    );

  const receiveUpload = async (stream, { name, max = MAX_UPLOAD } = {}) => {
    await sweep();
    const dir = await mkdtemp(path.join(tmp, 'ms-upload-'));
    const file = path.join(dir, 'data');
    let size = 0;
    const counter = new Transform({
      transform(chunk, _encoding, done) {
        size += chunk.length;
        done(null, chunk);
      },
    });
    try {
      await pipeline(stream, limiter(max), counter, createWriteStream(file));
    } catch (error) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    const token = randomBytes(16).toString('hex');
    uploads.set(token, {
      dir,
      path: file,
      name: safeName(name),
      size,
      at: now(),
    });
    return { ok: true, token, name: safeName(name), size };
  };

  const sendBatch = async ({ client, CustomFile, peer, batch, options }) => {
    const files = batch.files.map(
      (f) => new CustomFile(f.name, f.size, f.path)
    );
    const send = (photo) =>
      client.sendFile(peer, {
        file: files.length === 1 ? files[0] : files,
        caption: options.caption,
        forceDocument: !photo,
        parseMode: false,
        clearDraft: true,
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
        workers: 4,
      });
    try {
      return await send(batch.photo);
    } catch (error) {
      if (
        batch.photo &&
        NOT_A_PHOTO.test(String(error?.errorMessage ?? error?.message))
      ) {
        return send(false);
      }
      throw error;
    }
  };

  // Batch by batch, each stored as Telegram answers it; the caption and
  // the reply go with the first.
  const sendAll = async ({ client, target, batches, caption, replyTo }) => {
    const telegram = await env.importer();
    const CustomFile =
      telegram.client?.uploads?.CustomFile ?? telegram.CustomFile;
    const ids = [];
    for (const [index, batch] of batches.entries()) {
      const first = index === 0;
      const sent = await env.connection.withPeer(client, target, (peer) =>
        sendBatch({
          client,
          CustomFile,
          peer,
          batch,
          options: {
            caption: first ? caption : '',
            replyTo: first ? replyTo : null,
          },
        })
      );
      const messages = messagesOf(sent);
      await tools.writeChanged(
        env.store,
        tools.toLinks(await dialogOf(target), messages)
      );
      ids.push(...messages.map((m) => Number(m.id)));
    }
    return ids;
  };

  const sendFiles = async ({
    chat,
    tokens = [],
    caption = '',
    asPhoto = true,
    group = true,
    replyTo = null,
  } = {}) => {
    const files = tokens.map((token) => ({ token, ...uploads.get(token) }));
    const client =
      chat && files.length > 0 && files.every((f) => f.path)
        ? await userClient()
        : null;
    if (!client) {
      await Promise.all(tokens.map(drop));
      return { ok: false, supported: Boolean(chat && files.length > 0) };
    }
    const target = String(chat);
    try {
      const ids = await sendAll({
        client,
        target,
        batches: batchesOf(files, { asPhoto, group }),
        caption: String(caption ?? '').slice(0, MAX_CAPTION),
        replyTo,
      });
      return { ok: true, chat: target, ids };
    } catch (error) {
      throw sendError(error);
    } finally {
      await Promise.all(tokens.map(drop));
    }
  };

  return { receiveUpload, sendFiles };
};
