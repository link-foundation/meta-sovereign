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
 * "Send without sound" and "Schedule message" go with every batch
 * (R-Y102); scheduled ones are not stored — Telegram holds them.
 *
 * Captions are formatted as messages are (R-Y101,
 * ./telegram-format.js): GramJS is handed the parsed text and entities
 * as its parse mode, so an album's caption keeps them too.
 *
 * A voice message (R-Y108): `sendVoice({ chat, token, duration, waveform,
 * replyTo })` sends one upload — Ogg Opus, as the page recorded it — as
 * Telegram's voice note: its length in seconds and its waveform (100
 * values 0..31, packed five bits each, as Telegram keeps it).
 *
 * A round video (R-Y150): `sendRound({ chat, token, duration, size,
 * replyTo })` sends one upload (WebM or MP4) as a video note
 * (./telegram-round.js).
 */

import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { apiEntities, parseFormatted } from './telegram-format.js';
import { sendError } from './telegram-send.js';
import { withSendAs } from './telegram-send-as-client.js';
import { roundFileOf, roundOptions } from './telegram-round.js';

// Telegram takes files up to 2 GB from an account (4 GB with Premium).
export const MAX_UPLOAD = 2000 * 1024 * 1024;
export const MAX_FILES = 100;
export const ALBUM_SIZE = 10;
export const MAX_CAPTION = 4096;
// A voice message: an hour at most, a waveform of up to 100 values 0..31.
export const MAX_VOICE_SECONDS = 3600;
export const WAVEFORM_SIZE = 100;
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

// GramJS's parse mode for a caption: ours (the markdown made entities),
// or none when it has no formatting — sent as typed.
const captionMode = (caption, Api) => {
  const formatted = parseFormatted(caption);
  if (!caption || formatted.entities.length === 0) {
    return false;
  }
  return {
    parse: () => [formatted.text, apiEntities(Api, formatted.entities)],
    unparse: (text) => text,
  };
};

/**
 * A waveform as Telegram keeps it: each value 0..31 in five bits, the
 * first in the lowest bits of the first byte (as the apps read it back:
 * ../web/message-parts.js `decodeWaveform`).
 */
export const packWaveform = (values) => {
  const list = (Array.isArray(values) ? values : []).slice(0, WAVEFORM_SIZE);
  const bytes = new Uint8Array(Math.ceil((list.length * 5) / 8));
  list.forEach((value, i) => {
    const v = Math.max(0, Math.min(31, Math.round(Number(value) || 0)));
    const bit = i * 5;
    const at = bit >> 3;
    const pair = v << (bit & 7);
    bytes[at] |= pair & 0xff;
    if (pair > 0xff) {
      bytes[at + 1] |= pair >> 8;
    }
  });
  return Buffer.from(bytes);
};

// A voice's length (whole seconds, one at least), waveform and when.
const voiceOptions = ({
  duration = 0,
  waveform = [],
  replyTo = null,
  silent = false,
  scheduleDate = null,
}) => ({
  seconds: Math.max(
    1,
    Math.min(MAX_VOICE_SECONDS, Math.round(Number(duration) || 0))
  ),
  waveform: packWaveform(waveform),
  extra: {
    ...(replyTo ? { replyTo } : {}),
    ...(silent ? { silent: true } : {}),
    ...(scheduleDate ? { scheduleDate } : {}),
  },
});

// GramJS's sendFile options for a voice note: Ogg Opus, its length and
// waveform as Telegram's audio attribute says them.
const voiceFileOf = (upload, options) => (telegram) => {
  const CustomFile =
    telegram.client?.uploads?.CustomFile ?? telegram.CustomFile;
  return {
    file: new CustomFile('voice.ogg', upload.size, upload.path),
    voiceNote: true,
    forceDocument: false,
    mimeType: 'audio/ogg',
    attributes: [
      new telegram.Api.DocumentAttributeAudio({
        voice: true,
        duration: options.seconds,
        waveform: options.waveform,
      }),
    ],
    clearDraft: true,
    ...options.extra,
  };
};

const messagesOf = (sent) =>
  (Array.isArray(sent) ? sent : [sent]).filter((m) => m && m.id !== undefined);

// The voice sent; what Telegram answers stored (a scheduled one is
// Telegram's to hold, R-Y102).
const voiceSent = async ({ env, client, dialogOf, tools }, target, fileOf) => {
  const telegram = await env.importer();
  const options = fileOf(telegram);
  const sent = await env.connection.withPeer(client, target, (peer) =>
    client.sendFile(peer, options)
  );
  const messages = messagesOf(sent);
  if (options.scheduleDate) {
    env.actions?.scheduledChanged?.(target);
    return { ok: true, chat: target, ids: [], scheduled: true };
  }
  await tools.writeChanged(
    env.store,
    tools.toLinks(await dialogOf(target), messages)
  );
  return { ok: true, chat: target, ids: messages.map((m) => Number(m.id)) };
};

// One batch through GramJS's sendFile; a photo Telegram does not take
// as one goes as a file.
const sendBatch = async ({ client, Api, CustomFile, peer, batch, options }) => {
  const files = batch.files.map((f) => new CustomFile(f.name, f.size, f.path));
  const send = (photo) =>
    client.sendFile(peer, {
      file: files.length === 1 ? files[0] : files,
      caption: options.caption,
      forceDocument: !photo,
      parseMode: captionMode(options.caption, Api),
      clearDraft: true,
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      ...(options.silent ? { silent: true } : {}),
      ...(options.scheduleDate ? { scheduleDate: options.scheduleDate } : {}),
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

// One recorded upload sent as a single message: a voice note (R-Y108)
// or a round video (R-Y150).
const singleSender =
  ({ env, userClient, dialogOf, tools, uploads, drop }, fileOf, optionsOf) =>
  async (args = {}) => {
    const { chat, token, sendAs = null, ...rest } = args;
    const upload = uploads.get(token);
    const client = chat && upload?.path ? await userClient() : null;
    if (!client) {
      await drop(token);
      return { ok: false, supported: Boolean(chat && upload) };
    }
    try {
      const sender = await withSendAs(env, client, sendAs);
      return await voiceSent(
        { env, client: sender, dialogOf, tools },
        String(chat),
        fileOf(upload, optionsOf(rest))
      );
    } catch (error) {
      throw sendError(error);
    } finally {
      await drop(token);
    }
  };

// Scheduled ones: the chat's list is asked afresh (R-Y102).
const scheduledNote = (env, scheduleDate, chat) => {
  if (!scheduleDate) {
    return {};
  }
  env.actions?.scheduledChanged?.(chat);
  return { scheduled: true };
};

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

  // Batch by batch, each stored as Telegram answers it; the caption and
  // the reply go with the first.
  const sendAll = async ({
    client,
    target,
    batches,
    caption,
    replyTo,
    when,
  }) => {
    const telegram = await env.importer();
    const CustomFile =
      telegram.client?.uploads?.CustomFile ?? telegram.CustomFile;
    const ids = [];
    for (const [index, batch] of batches.entries()) {
      const first = index === 0;
      const sent = await env.connection.withPeer(client, target, (peer) =>
        sendBatch({
          client,
          Api: telegram.Api,
          CustomFile,
          peer,
          batch,
          options: {
            caption: first ? caption : '',
            replyTo: first ? replyTo : null,
            ...when,
          },
        })
      );
      const messages = messagesOf(sent);
      // Scheduled ones are Telegram's to hold, not the chat's (R-Y102).
      if (!when.scheduleDate) {
        await tools.writeChanged(
          env.store,
          tools.toLinks(await dialogOf(target), messages)
        );
      }
      ids.push(...messages.map((m) => Number(m.id)));
    }
    return ids;
  };

  const clientFor = async (chat, files) =>
    chat && files.length > 0 && files.every((f) => f.path)
      ? userClient()
      : null;

  const sendFiles = async ({
    chat,
    tokens = [],
    caption = '',
    asPhoto = true,
    group = true,
    replyTo = null,
    silent = false,
    scheduleDate = null,
    sendAs = null,
  } = {}) => {
    const files = tokens.map((token) => ({ token, ...uploads.get(token) }));
    const client = await clientFor(chat, files);
    if (!client) {
      await Promise.all(tokens.map(drop));
      return { ok: false, supported: Boolean(chat && files.length > 0) };
    }
    const target = String(chat);
    try {
      const ids = await sendAll({
        client: await withSendAs(env, client, sendAs),
        target,
        batches: batchesOf(files, { asPhoto, group }),
        caption: String(caption ?? '').slice(0, MAX_CAPTION),
        replyTo,
        when: { silent, scheduleDate },
      });
      return {
        ok: true,
        chat: target,
        ids,
        ...scheduledNote(env, scheduleDate, target),
      };
    } catch (error) {
      throw sendError(error);
    } finally {
      await Promise.all(tokens.map(drop));
    }
  };

  const sender = { env, userClient, dialogOf, tools, uploads, drop };
  const sendVoice = singleSender(sender, voiceFileOf, voiceOptions);
  const sendRound = singleSender(sender, roundFileOf, roundOptions);

  // `held`: the uploads, for an action that sends one itself (R-Y129).
  return {
    receiveUpload,
    sendFiles,
    sendVoice,
    sendRound,
    held: { uploads, drop },
  };
};
