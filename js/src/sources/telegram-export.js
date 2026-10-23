/**
 * "Export chat history", as Telegram Desktop has it in a chat's menu
 * (R-Y186; learned, never copied). The user picks what to include
 * (photos, videos, voice messages, round video messages, stickers, GIFs,
 * files), a size limit for videos and files, a date range, the format
 * (HTML, JSON or both) and a folder; the server then reads the chat's
 * whole history in the background and writes it there:
 * - `exportDefaults()` — `{ ok, folder, job }`: Desktop's default folder
 *   (`~/Downloads/Telegram Desktop/ChatExport_<YYYY-MM-DD>`) and the
 *   running or last export;
 * - `exportStart({ chat, chatName?, media, sizeLimitMb, from?, to?,
 *   formats, folder })` — checks everything first (`bad-request`,
 *   `relative-folder`, `inside-store`, `bad-folder`, `busy` when one is
 *   running; one export at a time), then starts it → `{ ok, job }`;
 * - `exportStatus()` — `{ ok, job }`, `job` null when none ran;
 * - `exportCancel()` — stops it (what was written stays) → `{ ok, job }`;
 * - `exportReveal()` — opens the finished export's folder in the file
 *   manager.
 * Only reads go to Telegram (./telegram-export-run.js): messages.getHistory
 * page by page and the files' downloads, through the account's queue. The
 * progress is an `export:telegram:<chat>` link (the events stream carries
 * it); no message text is ever logged.
 */

import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { connected } from './telegram-stickers.js';
import {
  checkFolder,
  freeDefaultFolder,
  isDay,
} from './telegram-export-paths.js';
import { execute, failure, newRun } from './telegram-export-run.js';

export const MEDIA_KEYS = Object.freeze([
  'photos',
  'videos',
  'voice',
  'roundVideo',
  'stickers',
  'gifs',
  'files',
]);
export const FORMATS = Object.freeze(['html', 'json']);
export const MAX_LIMIT_MB = 4000;
export const DEFAULT_LIMIT_MB = 8;
const PUT_EVERY_MS = 300;
const CHAT = /^-?\d{1,20}$/;

const bad = (code) => ({ ok: false, error: code, code });

const validMedia = (media) =>
  Boolean(media) &&
  typeof media === 'object' &&
  !Array.isArray(media) &&
  Object.entries(media).every(
    ([k, v]) => MEDIA_KEYS.includes(k) && typeof v === 'boolean'
  );

export const validRange = (from, to) =>
  [from, to].every((d) => d === null || isDay(d)) &&
  (from === null || to === null || from <= to);

export const validFormats = (formats) =>
  Array.isArray(formats) &&
  formats.length > 0 &&
  new Set(formats).size === formats.length &&
  formats.every((f) => FORMATS.includes(f));

export const validLimit = (limit) =>
  Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT_MB;

/**
 * The request as `{ ok: true, value }`, or `{ ok: false, code:
 * 'bad-request' }`: a chat id, the kinds (known keys, booleans), a size
 * limit of 1 to 4000 MB, `from` and `to` as `YYYY-MM-DD` or none, one or
 * both formats.
 */
export const parseExport = (request) => {
  const r = request ?? {};
  const from = r.from ?? null;
  const to = r.to ?? null;
  const sizeLimitMb = r.sizeLimitMb ?? DEFAULT_LIMIT_MB;
  const name = r.chatName ?? '';
  const ok =
    CHAT.test(String(r.chat ?? '')) &&
    validMedia(r.media) &&
    validLimit(sizeLimitMb) &&
    validRange(from, to) &&
    validFormats(r.formats) &&
    typeof name === 'string' &&
    name.length <= 256;
  return ok
    ? {
        ok: true,
        value: {
          chat: String(r.chat),
          chatName: name,
          media: Object.fromEntries(
            MEDIA_KEYS.map((k) => [k, r.media[k] === true])
          ),
          sizeLimitMb,
          from,
          to,
          formats: FORMATS.filter((f) => r.formats.includes(f)),
          folder: r.folder,
        },
      }
    : bad('bad-request');
};

const snapshot = (job) =>
  job && {
    chat: job.chat,
    state: job.state,
    folder: job.folder,
    formats: job.formats,
    messages: job.messages,
    total: job.total,
    files: job.files,
    skipped: job.skipped,
    failed: job.failed,
    bytes: job.bytes,
    current: job.current,
    code: job.code ?? null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt ?? null,
  };

const linkOf = (job, at) => ({
  id: `export:telegram:${job.chat}`,
  tokens: ['export', 'telegram', job.chat],
  kind: 'export',
  source: 'telegram',
  ...snapshot(job),
  at,
});

const COMMANDS = { darwin: 'open', win32: 'explorer' };

// Opens a folder in the file manager.
const opener = (folder) =>
  new Promise((resolve) => {
    execFile(COMMANDS[process.platform] ?? 'xdg-open', [folder], () =>
      resolve()
    );
  });

const newJob = (value, folder, at) => ({
  chat: value.chat,
  chatName: value.chatName,
  options: value,
  state: 'running',
  folder,
  formats: value.formats,
  messages: 0,
  total: null,
  files: 0,
  skipped: 0,
  failed: 0,
  bytes: 0,
  current: null,
  startedAt: new Date(at).toISOString(),
});

const active = (job) => ['running', 'cancelling'].includes(job?.state);

export const createHistoryExport = (
  env,
  {
    userClient,
    mediaDir = null,
    home = os.homedir(),
    now = () => Date.now(),
    reveal = opener,
  }
) => {
  // The app's store directory: media lives in `<store>/media/telegram`.
  const storeDir = mediaDir ? path.resolve(mediaDir, '..', '..') : null;
  const sleep =
    env.sleep ??
    ((ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)));
  let job = null;
  let starting = false;

  const publish = async (force = false) => {
    const at = now();
    if (!force && at - (job.putAt ?? 0) < PUT_EVERY_MS) {
      return;
    }
    job.putAt = at;
    await env.store
      ?.put(linkOf(job, new Date(at).toISOString()))
      .catch(() => {});
  };

  const launch = async (value, folder, c) => {
    job = newJob(value, folder, now());
    env.log?.({
      level: 'info',
      event: 'telegram_export_start',
      formats: value.formats,
    });
    await publish(true);
    // In the background: the page follows it through the events stream.
    execute(newRun({ env, c, job, now, sleep, publish })).catch(() => {});
    return { ok: true, job: snapshot(job) };
  };

  const start = async (request) => {
    const parsed = parseExport(request);
    if (!parsed.ok) {
      return parsed;
    }
    const { value } = parsed;
    const place = await checkFolder(value.folder, { storeDir, home });
    if (!place.ok) {
      return bad(place.code);
    }
    if (starting || active(job)) {
      return bad('busy');
    }
    starting = true;
    try {
      return await connected(env, userClient, failure, (c) =>
        launch(value, place.folder, c)
      );
    } finally {
      starting = false;
    }
  };

  return {
    exportDefaults: async () => ({
      ok: true,
      folder: await freeDefaultFolder(now(), home),
      job: snapshot(job),
    }),
    exportStatus: async () => ({ ok: true, job: snapshot(job) }),
    exportStart: start,
    exportCancel: async () => {
      if (job?.state === 'running') {
        job.state = 'cancelling';
        await publish(true);
      }
      return { ok: true, job: snapshot(job) };
    },
    exportReveal: async () => {
      if (!job || active(job)) {
        return bad('no-export');
      }
      await reveal(job.folder);
      return { ok: true };
    },
  };
};
