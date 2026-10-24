/**
 * Local storage management, as Telegram Desktop's Settings → Advanced →
 * Manage local storage has it (R-Y215; learned, never copied): the media
 * the server cached under `<store>/media/telegram`, counted by kind, and
 * cleared by kind or all at once; an optional size limit and an age limit
 * applied on a timer and at start, the least recently used files first.
 *
 * - `storageUsage()` → `{ ok, total: { bytes, files }, kinds: { photos |
 *   videos | voice | files | stickers | other: { bytes, files } }, chats:
 *   [{ chat, bytes, files }] (largest first, at most 100), limits: {
 *   maxGb, olderDays } }`;
 * - `storageClear({ kind } | { all: true })` → `{ ok, removed: { bytes,
 *   files } }`;
 * - `storageLimits()` / `storageLimitsSet({ maxGb, olderDays })` — the
 *   limits (maxGb 0, 1, 5 or 20; olderDays 0, 7, 30 or 365; 0 is none),
 *   kept in `<media>/.cache-limits.json`; setting them applies them;
 * - `storageEnforce()` applies the limits now → `{ ok, removed }`.
 *
 * Only metadata is read (name, size, times), plus the small `.type` file
 * the cache keeps beside a download — its mime type — to tell videos and
 * voice notes from other files. Only regular files inside the media
 * folder are counted or removed: a symbolic link is skipped and never
 * followed, every path is resolved and checked to lie inside the folder
 * before it is removed, and nothing outside it (the store's database, the
 * sessions, the exports) is touched. The kind comes from the folder the
 * file is in (`stickers`, `custom-emoji`, `avatars`, `wallpapers`, …) or,
 * in a chat's folder, from the file's name and mime type. The least
 * recently used is judged by the later of a file's access and change time.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { setInterval } from 'node:timers';

export const KINDS = Object.freeze([
  'photos',
  'videos',
  'voice',
  'files',
  'stickers',
  'other',
]);
export const MAX_GB = Object.freeze([0, 1, 5, 20]);
export const OLDER_DAYS = Object.freeze([0, 7, 30, 365]);

const LIMITS_FILE = '.cache-limits.json';
const GB = 1024 ** 3;
const DAY_MS = 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
const TYPE_BYTES = 128;
const CHATS_SHOWN = 100;
const CHAT = /^-?\d{1,20}$/;
const FOLDER_KIND = {
  stickers: 'stickers',
  'custom-emoji': 'stickers',
  music: 'files',
  ringtones: 'voice',
  avatars: 'other',
  wallpapers: 'other',
};

const empty = () => ({ bytes: 0, files: 0 });

/** The kind of a mime type the cache recorded. */
export const kindOfMime = (mime = '') => {
  const type = String(mime).split(';')[0].trim().toLowerCase();
  if (type === 'image/gif') {
    return 'stickers';
  }
  if (type.startsWith('image/')) {
    return 'photos';
  }
  if (type.startsWith('video/')) {
    return 'videos';
  }
  return type.startsWith('audio/') ? 'voice' : 'files';
};

/**
 * The kind of a cached file from its path inside the media folder
 * (`parts` of the relative path) and, when the cache recorded one, its
 * mime type. A chat's `<msg>-<size>` picture is a photo, a `<msg>-file`
 * is by its mime type.
 */
export const kindOfFile = (parts, mime = '') => {
  const [top, ...rest] = parts;
  if (Object.hasOwn(FOLDER_KIND, top)) {
    return FOLDER_KIND[top];
  }
  const name = parts.at(-1) ?? '';
  if (top === 'stories' || name.endsWith('-file')) {
    return mime ? kindOfMime(mime) : 'files';
  }
  return CHAT.test(top ?? '') && rest.length > 0 ? 'photos' : 'other';
};

/** The chat a file belongs to (its folder), or null. */
export const chatOfFile = (parts) =>
  CHAT.test(parts[0] ?? '') && parts.length > 1 ? parts[0] : null;

/** Limits from whatever was kept or sent: only the offered values. */
export const limitsFrom = (raw) => {
  const kept = raw && typeof raw === 'object' ? raw : {};
  return {
    maxGb: MAX_GB.includes(kept.maxGb) ? kept.maxGb : 0,
    olderDays: OLDER_DAYS.includes(kept.olderDays) ? kept.olderDays : 0,
  };
};

export const validLimits = (b = {}) =>
  MAX_GB.includes(b.maxGb) && OLDER_DAYS.includes(b.olderDays);

export const validClear = (b = {}) =>
  (b.all === true && b.kind === undefined) ||
  (b.all === undefined && KINDS.includes(b.kind));

/**
 * The indexes of the `files` ([{ bytes, used }]) to remove for the
 * limits: those not used since `olderDays`, then the least recently used
 * until the rest fit in `maxGb`. Pure.
 */
export const expired = (files, limits, nowMs) => {
  const { maxGb, olderDays } = limitsFrom(limits);
  const gone = new Set();
  if (olderDays > 0) {
    files.forEach((f, i) => f.used < nowMs - olderDays * DAY_MS && gone.add(i));
  }
  if (maxGb > 0) {
    let total = files.reduce(
      (sum, f, i) => (gone.has(i) ? sum : sum + f.bytes),
      0
    );
    const order = files
      .map((_, i) => i)
      .filter((i) => !gone.has(i))
      .sort((a, b) => files[a].used - files[b].used);
    for (const i of order) {
      if (total <= maxGb * GB) {
        break;
      }
      gone.add(i);
      total -= files[i].bytes;
    }
  }
  return [...gone];
};

const readType = async (file) => {
  let handle;
  try {
    handle = await fs.open(file, 'r');
    const buffer = Buffer.alloc(TYPE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TYPE_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString();
  } catch {
    return '';
  } finally {
    await handle?.close();
  }
};

// Every regular file of the folder, no link followed and no dot file at
// its top: Map of path → { parts, stat }.
const walkFiles = async (root) => {
  const found = new Map();
  const walk = async (dir, parts) => {
    const entries = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(file, [...parts, entry.name]);
      } else if (
        entry.isFile() &&
        !(parts.length === 0 && entry.name.startsWith('.'))
      ) {
        const stat = await fs.lstat(file).catch(() => null);
        if (stat?.isFile()) {
          found.set(file, { parts: [...parts, entry.name], stat });
        }
      }
    }
  };
  await walk(root, []);
  return found;
};

// The cached files, each with its `.type` file's size and name added:
// `{ file, side, bytes, used, kind, chat }`.
const scan = async (root) => {
  const found = await walkFiles(root);
  const files = [];
  for (const [file, { parts, stat }] of found) {
    const base = file.endsWith('.type') ? file.slice(0, -5) : null;
    if (base && found.has(base)) {
      continue;
    }
    const sideFile = `${file}.type`;
    const side = found.get(sideFile);
    files.push({
      file,
      side: side ? sideFile : null,
      bytes: stat.size + (side?.stat.size ?? 0),
      used: Math.max(stat.atimeMs, stat.mtimeMs),
      kind: kindOfFile(parts, side ? await readType(sideFile) : ''),
      chat: chatOfFile(parts),
    });
  }
  return files;
};

// Removes a file only when its real path is inside the real root and it is
// still a regular file, not a link. → bytes freed, or 0.
const removeInside = async (root, file) => {
  try {
    const stat = await fs.lstat(file);
    const real = await fs.realpath(path.dirname(file));
    const relative = path.relative(root, path.join(real, path.basename(file)));
    if (
      !stat.isFile() ||
      relative === '' ||
      relative.startsWith('..') ||
      path.isAbsolute(relative)
    ) {
      return 0;
    }
    await fs.unlink(file);
    return stat.size;
  } catch {
    return 0;
  }
};

const removeAll = async (root, items) => {
  const removed = empty();
  for (const item of items) {
    const bytes = await removeInside(root, item.file);
    if (bytes > 0 || item.bytes === 0) {
      removed.files += 1;
    }
    removed.bytes += bytes;
    if (item.side) {
      removed.bytes += await removeInside(root, item.side);
    }
  }
  return removed;
};

const countBy = (files, keyOf) => {
  const rows = new Map();
  for (const f of files) {
    const key = keyOf(f);
    if (key !== null) {
      const row = rows.get(key) ?? empty();
      row.bytes += f.bytes;
      row.files += 1;
      rows.set(key, row);
    }
  }
  return rows;
};

const readLimits = async (dir) => {
  try {
    return limitsFrom(
      JSON.parse(await fs.readFile(path.join(dir, LIMITS_FILE)))
    );
  } catch {
    return limitsFrom(null);
  }
};

/**
 * The storage actions of the media folder `mediaDir` (none without one).
 * `timer: false` leaves the periodic enforcement off (tests).
 */
export const createStorage = (env, { mediaDir = null, timer = true } = {}) => {
  const now = env?.now ?? (() => Date.now());
  const none = { ok: false, error: 'no media folder', code: 'unavailable' };
  // The real path of the folder, made when first needed.
  const rootOf = async () => {
    if (!mediaDir) {
      return null;
    }
    await fs.mkdir(mediaDir, { recursive: true });
    return fs.realpath(mediaDir);
  };

  const storageLimits = async () =>
    mediaDir ? { ok: true, ...(await readLimits(mediaDir)) } : none;

  const storageEnforce = async () => {
    if (!mediaDir) {
      return none;
    }
    const limits = await readLimits(mediaDir);
    if (limits.maxGb === 0 && limits.olderDays === 0) {
      return { ok: true, removed: empty() };
    }
    const root = await rootOf();
    const files = await scan(root);
    const doomed = expired(files, limits, now());
    const removed = await removeAll(
      root,
      doomed.map((i) => files[i])
    );
    return { ok: true, removed };
  };

  const storageUsage = async () => {
    const root = await rootOf();
    if (!root) {
      return none;
    }
    const files = await scan(root);
    const kinds = Object.fromEntries(KINDS.map((k) => [k, empty()]));
    for (const [kind, row] of countBy(files, (f) => f.kind)) {
      kinds[kind] = row;
    }
    const chats = [...countBy(files, (f) => f.chat)]
      .map(([chat, row]) => ({ chat, ...row }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, CHATS_SHOWN);
    const total = files.reduce(
      (sum, f) => ({ bytes: sum.bytes + f.bytes, files: sum.files + 1 }),
      empty()
    );
    return {
      ok: true,
      total,
      kinds,
      chats,
      limits: await readLimits(root),
    };
  };

  const storageClear = async (body = {}) => {
    if (!validClear(body)) {
      return { ok: false, error: 'bad request', code: 'bad-request' };
    }
    const root = await rootOf();
    if (!root) {
      return none;
    }
    const files = await scan(root);
    const picked = body.all ? files : files.filter((f) => f.kind === body.kind);
    return { ok: true, removed: await removeAll(root, picked) };
  };

  const storageLimitsSet = async (body = {}) => {
    if (!validLimits(body)) {
      return { ok: false, error: 'bad request', code: 'bad-request' };
    }
    const root = await rootOf();
    if (!root) {
      return none;
    }
    const limits = limitsFrom(body);
    await fs.writeFile(path.join(root, LIMITS_FILE), JSON.stringify(limits), {
      mode: 0o600,
    });
    const { removed } = await storageEnforce();
    return { ok: true, ...limits, removed };
  };

  if (mediaDir && timer) {
    // At start and every hour; a failure is only a missed round.
    storageEnforce().catch(() => {});
    setInterval(() => storageEnforce().catch(() => {}), HOUR_MS).unref();
  }

  return {
    storageUsage,
    storageClear,
    storageLimits,
    storageLimitsSet,
    storageEnforce,
  };
};
