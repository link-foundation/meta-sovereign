/**
 * Notification sounds, as Telegram Desktop's "Sound" in a chat's
 * notifications has them (R-Y181; learned, never copied):
 *
 * - `ringtoneList()` — the account's saved ringtones
 *   (account.getSavedRingtones) → `{ ok, ringtones: [{ id, title,
 *   duration, size }], limits: { sizeBytes, seconds, count } }`;
 * - `ringtoneAdd({ token })` — the page's upload (R-Y99) sent as a new
 *   ringtone (account.uploadRingtone, then account.saveRingtone) →
 *   `{ ok, ringtone }`; Telegram takes a short, small audio file;
 * - `ringtoneRemove({ id })` — account.saveRingtone with unsave;
 * - `ringtoneFile({ id })` — a saved ringtone's audio, downloaded once
 *   into the app folder, for the page to play when a notification shows.
 * Telegram's errors become codes the page shows as text. The sound of one
 * chat is set with that chat's notification settings
 * (./telegram-notify-settings.js).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { locationOf, bigSize, readCache } from './telegram-media.js';
import { uploadedFile } from './telegram-chat-edit.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  RINGTONE_INVALID: 'invalid',
  RINGTONE_MIME_INVALID: 'bad-type',
  RINGTONE_SIZE_TOO_BIG: 'too-big',
  RINGTONE_DURATION_TOO_LONG: 'too-long',
  RINGTONE_NOT_FOUND: 'unknown',
  DOCUMENT_INVALID: 'invalid',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

export const ID = /^\d{1,20}$/;
// What Telegram takes (its app config's ringtone_size_max,
// ringtone_duration_max, ringtone_saved_count_max).
export const LIMITS = Object.freeze({
  sizeBytes: 300 * 1024,
  seconds: 5,
  count: 100,
});

const TYPES = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

const attribute = (doc, name) =>
  (doc?.attributes ?? []).find((a) => a?.className === name) ?? null;

/** The mime type for an audio file's name, or null when not an audio. */
export const mimeOfName = (name) =>
  TYPES[
    String(name ?? '')
      .split('.')
      .pop()
      .toLowerCase()
  ] ?? null;

/** A saved ringtone's document as the page's row. */
export const ringtoneRow = (doc) => {
  const name = attribute(doc, 'DocumentAttributeFilename')?.fileName;
  return {
    id: text(doc.id),
    title: String(name ?? '').replace(/\.[^.]{1,5}$/, '') || text(doc.id),
    duration: Number(attribute(doc, 'DocumentAttributeAudio')?.duration ?? 0),
    size: Number(doc.size ?? 0),
  };
};

export const createRingtones = (env, { userClient, uploads, mediaDir }) => {
  const known = new Map(); // id -> Document
  const flights = new Map();

  const list = (c) =>
    runIn(env, 'ringtones:list', async () => {
      const got = await c.client.invoke(
        new c.Api.account.GetSavedRingtones({ hash: c.zero })
      );
      known.clear();
      for (const doc of got?.ringtones ?? []) {
        known.set(text(doc.id), doc);
      }
      return [...known.values()].map(ringtoneRow);
    });

  const ringtoneList = async () =>
    connected(env, userClient, failure, async (c) => ({
      ok: true,
      ringtones: await list(c),
      limits: LIMITS,
    }));

  const input = (c, doc) =>
    new c.Api.InputDocument({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
    });

  const ringtoneAdd = async ({ token } = {}) => {
    const key = String(token ?? '');
    const entry = uploads?.uploadOf?.(key);
    const mimeType = mimeOfName(entry?.name);
    try {
      if (!entry || !mimeType) {
        return { ok: false, error: 'not an audio file', code: 'bad-type' };
      }
      if (Number(entry.size) > LIMITS.sizeBytes) {
        return { ok: false, error: 'too big', code: 'too-big' };
      }
      return await connected(env, userClient, failure, (c) =>
        runIn(env, 'ringtones:add', async () => {
          const file = await uploadedFile({ ...c, env }, uploads, key);
          const doc = await c.client.invoke(
            new c.Api.account.UploadRingtone({
              file,
              fileName: entry.name,
              mimeType,
            })
          );
          await c.client.invoke(
            new c.Api.account.SaveRingtone({
              id: input(c, doc),
              unsave: false,
            })
          );
          known.set(text(doc.id), doc);
          return { ok: true, ringtone: ringtoneRow(doc) };
        })
      );
    } finally {
      await uploads?.dropUpload?.(key);
    }
  };

  const ringtoneRemove = async ({ id } = {}) => {
    const key = String(id ?? '');
    if (!ID.test(key)) {
      return { ok: false, error: 'bad request', code: 'failed' };
    }
    return connected(env, userClient, failure, async (c) => {
      if (!known.has(key)) {
        await list(c);
      }
      const doc = known.get(key);
      if (!doc) {
        return { ok: false, error: 'unknown ringtone', code: 'unknown' };
      }
      await runIn(env, 'ringtones:remove', () =>
        c.client.invoke(
          new c.Api.account.SaveRingtone({ id: input(c, doc), unsave: true })
        )
      );
      known.delete(key);
      return { ok: true };
    });
  };

  const fetchAudio = (key, file) =>
    connected(
      env,
      userClient,
      () => null,
      async (c) => {
        if (!known.has(key)) {
          await list(c);
        }
        const doc = known.get(key);
        if (!doc || Number(doc.size ?? 0) > LIMITS.sizeBytes * 2) {
          return null;
        }
        const buffer = await c.client.downloadFile(
          locationOf(c.Api, c.helpers, {
            kind: 'document',
            file: doc,
            thumb: '',
          }),
          {
            dcId: Number(doc.dcId),
            fileSize: bigSize(c.helpers, Number(doc.size ?? 0)),
          }
        );
        if (!buffer?.length) {
          return null;
        }
        const mimeType = String(doc.mimeType ?? 'audio/mpeg');
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, buffer);
        await fs.writeFile(`${file}.type`, mimeType);
        return { buffer: Buffer.from(buffer), mimeType };
      }
    );

  const ringtoneFile = async ({ id } = {}) => {
    const key = String(id ?? '');
    if (!ID.test(key) || !mediaDir) {
      return null;
    }
    const file = path.join(mediaDir, 'ringtones', key);
    const cached = await readCache(file);
    const type = cached ? String(await readCache(`${file}.type`)) : '';
    if (cached && /^audio\//.test(type)) {
      return { buffer: cached, mimeType: type };
    }
    if (!flights.has(key)) {
      flights.set(
        key,
        fetchAudio(key, file)
          .catch(() => null)
          .finally(() => flights.delete(key))
      );
    }
    return flights.get(key);
  };

  return { ringtoneList, ringtoneAdd, ringtoneRemove, ringtoneFile };
};
