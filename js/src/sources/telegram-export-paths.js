/**
 * Where an exported chat history goes and what its files are called
 * (R-Y186; Telegram Desktop's "Export chat history", learned, never
 * copied): the default folder `~/Downloads/Telegram Desktop/
 * ChatExport_<YYYY-MM-DD>`, the folder the user typed checked (absolute,
 * and never inside the app's own store directory), and file names made
 * safe and unique inside the export.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');

/** `2026-10-23` in the local time zone. */
export const dayOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** `2026-10-23T14:05:09`, Desktop's local date format. */
export const localIso = (ms) => {
  const d = new Date(ms);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${dayOf(ms)}T${time}`;
};

/** `23-10-2026_14-05-09`, what Desktop puts in a media file's name. */
export const stampOf = (ms) => {
  const d = new Date(ms);
  const day = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${day}_${time}`;
};

const partsOf = (day) => String(day).split('-').map(Number);

/** The first instant of local day `YYYY-MM-DD`. */
export const dayStartMs = (day) => {
  const [y, m, d] = partsOf(day);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};

/** The last instant of local day `YYYY-MM-DD`. */
export const dayEndMs = (day) => {
  const [y, m, d] = partsOf(day);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
};

export const isDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return false;
  }
  const ms = dayStartMs(value);
  return Number.isFinite(ms) && dayOf(ms) === value;
};

/** Desktop's default folder for an export started at `now`. */
export const defaultFolder = (now = Date.now(), home = os.homedir()) =>
  path.join(home, 'Downloads', 'Telegram Desktop', `ChatExport_${dayOf(now)}`);

const exists = async (file) => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};

/** The default folder, or `… (1)`, `… (2)` when it is already there. */
export const freeDefaultFolder = async (now, home) => {
  const base = defaultFolder(now, home);
  let candidate = base;
  for (let n = 1; (await exists(candidate)) && n < 1000; n += 1) {
    candidate = `${base} (${n})`;
  }
  return candidate;
};

// The nearest existing parent's real path (symlinks followed) with the
// part below it put back, so a link into the store cannot hide it.
const realOf = async (target) => {
  let rest = '';
  let here = target;
  for (;;) {
    try {
      return path.join(await fs.realpath(here), rest);
    } catch {
      const parent = path.dirname(here);
      if (parent === here) {
        return target;
      }
      rest = path.join(path.basename(here), rest);
      here = parent;
    }
  }
};

const inside = (child, parent) => {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
};

/**
 * The folder the user typed as `{ ok: true, folder }`, or `{ ok: false,
 * code }`: `bad-folder` (not text, too long, the file system's root),
 * `relative-folder` (not absolute; a leading `~/` is the home folder) or
 * `inside-store` (in the app's own store directory).
 */
export const checkFolder = async (
  value,
  { storeDir = null, home = os.homedir() } = {}
) => {
  const typed = typeof value === 'string' ? value.trim() : '';
  if (!typed || typed.length > 1024 || typed.includes('\0')) {
    return { ok: false, code: 'bad-folder' };
  }
  const expanded = /^~(?=$|[\\/])/.test(typed)
    ? path.join(home, typed.slice(1))
    : typed;
  if (!path.isAbsolute(expanded)) {
    return { ok: false, code: 'relative-folder' };
  }
  const folder = path.resolve(expanded);
  if (path.dirname(folder) === folder) {
    return { ok: false, code: 'bad-folder' };
  }
  if (storeDir) {
    const protectedDir = await realOf(path.resolve(storeDir));
    if (inside(await realOf(folder), protectedDir)) {
      return { ok: false, code: 'inside-store' };
    }
  }
  return { ok: true, folder };
};

/** A file name without separators, control characters or a leading dot. */
export const safeName = (name, fallback = 'file') => {
  const cleaned = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '_')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
};

/** Hands out `folder/name` paths that are unique within one export. */
export const createNamer = () => {
  const used = new Set();
  return (folder, wanted) => {
    const parsed = path.parse(wanted);
    let name = wanted;
    for (let n = 1; used.has(`${folder}/${name.toLowerCase()}`); n += 1) {
      name = `${parsed.name} (${n})${parsed.ext}`;
    }
    used.add(`${folder}/${name.toLowerCase()}`);
    return `${folder}/${name}`;
  };
};
