/**
 * Profile photos of Telegram peers (users, groups, channels), cached on
 * disk and served from there: GET /api/telegram/avatar?peer=&size=s|b.
 *
 * Each avatar is downloaded once and kept at
 * `<dir>/avatars/<peer>-<size>` with a `.type` file. A "no photo" result
 * is remembered for 24 h (a `.none` file); a cached avatar older than
 * 24 h is re-downloaded in the background while the cached one is served.
 *
 * Downloads go through the account's queue at `list` priority with key
 * `avatar:<peer>:<size>` — after what the user scrolls to, never blocking
 * it (R-Y34). Secrets are never logged.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const MS_PER_DAY = 24 * 60 * 60_000;
const PEER = /^-?\d{1,20}$/;

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
  importer = () => import('telegram'),
  log = () => {},
}) => {
  const avatarDir = path.join(dir, 'avatars');

  // A chat the account holds is asked for by its stored peer; someone
  // seen only as a group's member, by the message they wrote there
  // (Telegram's InputPeerUserFromMessage: no access hash of theirs is
  // needed); else by id, which GramJS finds in what it has seen.
  const inputOf = async (peer, { chat, msg } = {}) => {
    const stored = await peers.input(peer);
    if (stored) {
      return stored;
    }
    const where =
      chat && msg && !peer.startsWith('-') ? await peers.input(chat) : null;
    if (!where) {
      return peer;
    }
    const { Api, helpers } = await importer();
    return new Api.InputPeerUserFromMessage({
      peer: where,
      msgId: Number(msg),
      userId: helpers.returnBigInt(peer),
    });
  };

  const fetchAvatar = async (peer, isBig, context) => {
    const client = await clientOf();
    if (!client) {
      return null;
    }
    const buf = await client.downloadProfilePhoto(
      await inputOf(peer, context),
      { isBig }
    );
    return buf?.length ? Buffer.from(buf) : null;
  };

  const refresh = (peer, sz, context) => {
    const base = path.join(avatarDir, `${peer}-${sz}`);
    const noneFile = `${base}.none`;
    queue
      .run(`avatar:${peer}:${sz}:refresh`, 'list', async () => {
        const buf = await fetchAvatar(peer, sz === 'b', context);
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
      const code = String(error.errorMessage ?? error.message ?? '');
      done(0, { level: 'warn', failed: code.slice(0, 60) });
      buffer = /FLOOD|WAIT/.test(code) ? undefined : null;
    }
    if (buffer === undefined) {
      return null;
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
