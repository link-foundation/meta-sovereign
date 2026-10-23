/**
 * Music on a profile, as Telegram Desktop shows it (R-Y185; learned, never
 * copied):
 * - `savedMusic({ chat, offset? })` — a person's saved songs
 *   (users.getSavedMusic, a page of 30) → `{ ok, count, mine, tracks: [{ id,
 *   title, performer, duration, size, name }], next }`; the documents are
 *   kept by id so a track can be played or removed;
 * - `musicFile({ id })` — a kept track's audio, downloaded once into the
 *   app folder (up to 64 MB), for the page's audio player (GET
 *   /api/telegram/music);
 * - `messageMusicSave({ chat, message, unsave? })` — a song from a chat's
 *   audio message added to the user's own profile music (account.saveMusic;
 *   a WRITE, on a click only); the message is read for a fresh file
 *   reference first and must be a song, not a voice note;
 * - `musicRemove({ id })` — one of one's own tracks taken off the profile
 *   (account.saveMusic with unsave; a WRITE, on a click only).
 * Telegram's errors become codes the page shows as text.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { bigSize, locationOf, readCache } from './telegram-media.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

export const PAGE = 30;
export const ID = /^\d{1,20}$/;
// A track larger than this is not downloaded.
const MAX_AUDIO = 64 * 1024 * 1024;
// How many documents are kept by id at most.
const KEPT = 600;

const CODES = {
  DOCUMENT_INVALID: 'not-music',
  MESSAGE_ID_INVALID: 'no-message',
  PEER_ID_INVALID: 'no-access',
  USER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  FILE_REFERENCE_EXPIRED: 'expired',
  SAVED_MUSIC_LIMIT: 'too-many',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };
const CHAT = /^-?\d{1,20}$/;

const text = (value) => String(value?.value ?? value ?? '');
const audioOf = (doc) =>
  (doc?.attributes ?? []).find(
    (a) => a?.className === 'DocumentAttributeAudio'
  );
const nameOf = (doc) =>
  (doc?.attributes ?? []).find(
    (a) => a?.className === 'DocumentAttributeFilename'
  )?.fileName;

/** Whether a document is a song (audio, not a voice note). */
export const isSong = (doc) => {
  const audio = audioOf(doc);
  return (
    doc?.className === 'Document' &&
    !audio?.voice &&
    (Boolean(audio) || /^audio\//.test(doc.mimeType ?? ''))
  );
};

/** A song's document as the page's row. */
export const trackOf = (doc) => {
  const audio = audioOf(doc);
  const name = String(nameOf(doc) ?? '');
  return {
    id: text(doc.id),
    title: String(audio?.title ?? '') || name.replace(/\.[^.]{1,5}$/, ''),
    performer: String(audio?.performer ?? ''),
    duration: Number(audio?.duration ?? 0) || 0,
    size: Number(doc.size ?? 0) || 0,
    name,
  };
};

const expired = (error) =>
  /FILE_REFERENCE_(EXPIRED|INVALID)/.test(
    String(error?.errorMessage ?? error?.message ?? '')
  );

// A kept track's audio: downloaded once into the app folder, then from it.
const createMusicFile = (env, { userClient, mediaDir }, kept) => {
  const flights = new Map();
  const download = (key, file) =>
    connected(
      env,
      userClient,
      () => null,
      async (c) => {
        const doc = kept.get(key);
        if (!doc || Number(doc.size ?? 0) > MAX_AUDIO) {
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

  const musicFile = async ({ id } = {}) => {
    const key = String(id ?? '');
    if (!ID.test(key) || !mediaDir) {
      return null;
    }
    const file = path.join(mediaDir, 'music', key);
    const cached = await readCache(file);
    const type = cached ? String(await readCache(`${file}.type`)) : '';
    if (cached && /^audio\//.test(type)) {
      return { buffer: cached, mimeType: type };
    }
    if (!flights.has(key)) {
      flights.set(
        key,
        download(key, file)
          .catch(() => null)
          .finally(() => flights.delete(key))
      );
    }
    return flights.get(key);
  };

  return musicFile;
};

export const createProfileMusic = (env, { userClient, mediaDir }) => {
  const kept = new Map(); // id -> Document
  const keep = (doc) => {
    kept.delete(text(doc.id));
    kept.set(text(doc.id), doc);
    if (kept.size > KEPT) {
      kept.delete(kept.keys().next().value);
    }
  };
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));
  const inputOf = (c, doc) =>
    new c.Api.InputDocument({
      id: c.helpers.returnBigInt(text(doc.id)),
      accessHash: c.helpers.returnBigInt(text(doc.accessHash)),
      fileReference: Buffer.from(doc.fileReference ?? []),
    });
  // A person's InputUser from the peer a chat id resolves to.
  const userOf = (c, peer) => {
    if (peer?.className === 'InputPeerSelf') {
      return new c.Api.InputUserSelf();
    }
    return peer?.userId === undefined
      ? null
      : new c.Api.InputUser({
          userId: peer.userId,
          accessHash: peer.accessHash,
        });
  };

  const readSongs = async (c, chat, offset) =>
    env.connection.withPeer(c.client, chat, async (peer) => {
      const id = userOf(c, peer);
      if (!id) {
        return { ok: false, error: 'not a person', code: 'no-access' };
      }
      const answer = await c.client.invoke(
        new c.Api.users.GetSavedMusic({
          id,
          offset,
          limit: PAGE,
          hash: c.zero,
        })
      );
      const docs = (answer?.documents ?? []).filter(isSong);
      docs.forEach(keep);
      const total = Number(answer?.count ?? 0) || 0;
      const me = text((await c.client.getMe?.().catch(() => null))?.id);
      return {
        ok: true,
        count: total,
        mine: me !== '' && me === chat,
        tracks: docs.map(trackOf),
        next:
          docs.length > 0 && offset + docs.length < total
            ? offset + docs.length
            : null,
      };
    });

  const savedMusic = async ({ chat, offset = 0 } = {}) =>
    !CHAT.test(String(chat ?? '')) || !Number.isInteger(offset) || offset < 0
      ? BAD
      : doing(`music:${chat}`, (c) => readSongs(c, String(chat), offset));

  const messageSong = async (c, peer, id) => {
    const [message] = await c.client.getMessages(peer, { ids: [id] });
    const doc = message?.media?.document;
    return isSong(doc) ? doc : null;
  };

  const saveFrom = async (c, peer, id, unsave) => {
    const doc = await messageSong(c, peer, id);
    if (!doc) {
      return { ok: false, error: 'not music', code: 'not-music' };
    }
    await c.client.invoke(
      new c.Api.account.SaveMusic({ id: inputOf(c, doc), unsave })
    );
    return { ok: true, id: text(doc.id), saved: !unsave };
  };

  const messageMusicSave = async ({ chat, message, unsave = false } = {}) => {
    const id = Number(message);
    return !CHAT.test(String(chat ?? '')) || !(id > 0)
      ? BAD
      : doing(`music-save:${chat}:${id}`, (c) =>
          env.connection.withPeer(c.client, String(chat), async (peer) => {
            try {
              return await saveFrom(c, peer, id, unsave === true);
            } catch (error) {
              // The message is read again for a fresh file reference.
              if (!expired(error)) {
                throw error;
              }
              return saveFrom(c, peer, id, unsave === true);
            }
          })
        );
  };

  const musicRemove = async ({ id } = {}) =>
    !ID.test(String(id ?? ''))
      ? BAD
      : doing('music-remove', async (c) => {
          const doc = kept.get(String(id));
          if (!doc) {
            return { ok: false, error: 'unknown track', code: 'no-track' };
          }
          await c.client.invoke(
            new c.Api.account.SaveMusic({ id: inputOf(c, doc), unsave: true })
          );
          kept.delete(String(id));
          return { ok: true, id: String(id) };
        });

  const musicFile = createMusicFile(env, { userClient, mediaDir }, kept);

  return { savedMusic, messageMusicSave, musicRemove, musicFile };
};
