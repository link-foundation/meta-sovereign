/**
 * Profile photos of Telegram peers (users, groups, channels), cached on
 * disk and served from there: GET /api/telegram/avatar?peer=&size=s|b.
 *
 * Each avatar is downloaded once and kept at
 * `<dir>/avatars/<peer>-<size>` with a `.type` file. A "no photo" result
 * is remembered for 24 h (a `.none` file), a failed download is tried
 * again after 5 minutes; a cached avatar older than
 * 24 h is re-downloaded in the background while the cached one is served.
 *
 * Downloads go through the account's queue at `list` priority with key
 * `avatar:<peer>:<size>` — after what the user scrolls to, never blocking
 * it (R-Y34). Secrets are never logged.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { importTelegram } from './telegram-layer.js';

const MS_PER_DAY = 24 * 60 * 60_000;
const PEER = /^-?\d{1,20}$/;
// A download that failed is tried again after this long.
const RETRY_MS = 5 * 60_000;

const peerKind = (peer) => {
  if (peer.startsWith('-100')) {
    return 'channel';
  }
  if (peer.startsWith('-')) {
    return 'group';
  }
  return 'user';
};

const readCache = async (file) => {
  try {
    const buffer = await fs.readFile(file);
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
};

const fileAge = async (file) => {
  try {
    const s = await fs.stat(file);
    return Date.now() - s.mtimeMs;
  } catch {
    return Infinity;
  }
};

// A chat the account holds is asked for by its stored peer; someone
// seen only as a group's member, by the message they wrote there
// (Telegram's InputUserFromMessage: no access hash of theirs is
// needed); else by id, which GramJS finds in what it has seen.
const inputOf = async ({ peers, importer }, peer, { chat, msg } = {}) => {
  const stored = await peers.input(peer);
  if (stored) {
    return { entity: stored };
  }
  const where =
    chat && msg && !peer.startsWith('-') ? await peers.input(chat) : null;
  if (!where) {
    return { entity: peer };
  }
  const { Api, helpers } = await importer();
  return {
    byMessage: new Api.InputUserFromMessage({
      peer: where,
      msgId: Number(msg),
      userId: helpers.returnBigInt(peer),
    }),
    Api,
  };
};

// GramJS cannot look up a user by message itself (it casts the input
// to an id and fails), so the user is asked for first; their photo is
// then read from the answer, and their peer kept for next time.
const entityOf = async (client, deps, peer, context) => {
  const { entity, byMessage, Api } = await inputOf(deps, peer, context);
  if (!byMessage) {
    return entity;
  }
  const [user] = await client.invoke(
    new Api.users.GetUsers({ id: [byMessage] })
  );
  if (!user || user.className === 'UserEmpty') {
    return null;
  }
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  await Promise.resolve(
    deps.peers.remember?.(peer, user, { isUser: true, name: name || null })
  ).catch(() => {});
  return user;
};

/**
 * `read({ peer, size })` → `{ buffer, mimeType }` or null when the peer
 * has no photo. `size` is `'s'` (small, default) or `'b'` (big). `dir`
 * is the telegram media folder; `queue`, `client`, `peers` are the
 * account's shared instances.
 */
export const createAvatarReader = ({
  dir,
  queue,
  client: clientOf,
  peers,
  importer = importTelegram,
  log = () => {},
  retryMs = RETRY_MS,
}) => {
  const avatarDir = path.join(dir, 'avatars');

  const fetchAvatar = async (peer, isBig, context) => {
    const client = await clientOf();
    if (!client) {
      return undefined;
    }
    const entity = await entityOf(client, { peers, importer }, peer, context);
    if (!entity) {
      return null;
    }
    const buf = await client.downloadProfilePhoto(entity, { isBig });
    return buf?.length ? Buffer.from(buf) : null;
  };

  const refresh = (peer, sz, context) => {
    const base = path.join(avatarDir, `${peer}-${sz}`);
    const noneFile = `${base}.none`;
    queue
      .run(`avatar:${peer}:${sz}:refresh`, 'list', async () => {
        const buf = await fetchAvatar(peer, sz === 'b', context);
        if (buf === undefined) {
          return;
        }
        await fs.mkdir(avatarDir, { recursive: true });
        if (buf?.length) {
          await fs.writeFile(base, buf);
          await fs.writeFile(`${base}.type`, 'image/jpeg');
          // Clear an old .none if present.
          await fs.unlink(noneFile).catch(() => {});
        } else {
          await fs.writeFile(noneFile, '');
        }
      })
      .catch(() => {});
  };

  // Where a group member wrote, for Telegram to find them by.
  const contextOf = (chat, msg) =>
    PEER.test(String(chat ?? '')) &&
    Number.isInteger(Number(msg)) &&
    Number(msg) > 0
      ? { chat: String(chat), msg: Number(msg) }
      : {};

  // Kept on disk: the photo (re-read in the background once a day old).
  const fromDisk = async (base, peer, sz, context) => {
    const cached = await readCache(base);
    if (!cached) {
      return null;
    }
    const typeBuf = await readCache(`${base}.type`);
    if ((await fileAge(base)) >= MS_PER_DAY) {
      refresh(peer, sz, context);
    }
    return { buffer: cached, mimeType: typeBuf?.toString() || 'image/jpeg' };
  };

  // Read from Telegram and kept; "none" is kept too, unless Telegram
  // only asked to wait.
  const download = async (base, peer, sz, context) => {
    const started = Date.now();
    const done = (bytes, extra = {}) =>
      log({
        event: 'telegram_avatar',
        peer_kind: peerKind(peer),
        size: sz,
        bytes,
        by_message: Boolean(context.msg),
        duration_ms: Date.now() - started,
        ...extra,
      });
    let buffer;
    try {
      buffer = await queue.run(`avatar:${peer}:${sz}`, 'list', () =>
        fetchAvatar(peer, sz === 'b', context)
      );
    } catch (error) {
      // A failure is not "no photo": it is asked again a while later.
      const code = String(error.errorMessage ?? error.message ?? '');
      done(0, { level: 'warn', failed: code.slice(0, 60) });
      failedAt.set(base, Date.now());
      return undefined;
    }
    if (buffer === undefined) {
      return undefined;
    }
    await fs.mkdir(avatarDir, { recursive: true });
    if (!buffer?.length) {
      await fs.writeFile(`${base}.none`, '');
      done(0);
      return null;
    }
    await fs.writeFile(base, buffer);
    await fs.writeFile(`${base}.type`, 'image/jpeg');
    done(buffer.length);
    return { buffer, mimeType: 'image/jpeg' };
  };

  // One download per photo, however many rows ask for it at once.
  const inFlight = new Map();
  // When a download last failed, to wait a little before the next.
  const failedAt = new Map();

  const read = async ({ peer, size = 's', chat, msg } = {}) => {
    const p = String(peer ?? '');
    const sz = size === 'b' ? 'b' : 's';
    if (!PEER.test(p)) {
      return null;
    }
    const base = path.join(avatarDir, `${p}-${sz}`);
    // "No photo" is remembered for 24 h: skip the download.
    if ((await fileAge(`${base}.none`)) < MS_PER_DAY) {
      return null;
    }
    const context = contextOf(chat, msg);
    const kept = await fromDisk(base, p, sz, context);
    if (kept) {
      return kept;
    }
    if (Date.now() - (failedAt.get(base) ?? -Infinity) < retryMs) {
      return undefined;
    }
    if (!inFlight.has(base)) {
      inFlight.set(
        base,
        download(base, p, sz, context).finally(() => inFlight.delete(base))
      );
    }
    return inFlight.get(base);
  };

  return { read };
};
