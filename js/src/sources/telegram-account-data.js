/**
 * "Export Telegram data", as Telegram Desktop has it in Settings → Advanced
 * (R-Y212; learned, never copied): the account's information, contacts and
 * the chats of the kinds the user picks (personal chats, bot chats, private
 * groups, private channels, public groups and channels) with a date range
 * and "include media up to N MB", read through a takeout session
 * (account.initTakeoutSession, requests wrapped in invokeWithTakeout,
 * account.finishTakeoutSession). Each chat is written by the per-chat export
 * (R-Y186, HTML and/or JSON) into a folder the server chooses under the
 * store directory's `exports` (never one the page names):
 * - `dataExportDefaults()` — `{ ok, job }`, the running or last export;
 * - `dataExportStart({ info, contacts, kinds, media, sizeLimitMb, from?,
 *   to?, formats })` — opens the takeout session first; Telegram may refuse
 *   with `{ ok: false, code: 'takeout-delay', seconds }`
 *   (TAKEOUT_INIT_DELAY_X), then starts it in the background → `{ ok, job }`;
 * - `dataExportStatus()` / `dataExportCancel()` / `dataExportReveal()`.
 * Only reads go to Telegram; no message text is ever logged.
 */

import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { connected } from './telegram-stickers.js';
import {
  validFormats,
  validLimit,
  validRange,
  DEFAULT_LIMIT_MB,
  FORMATS,
  MEDIA_KEYS,
} from './telegram-export.js';
import { dayOf } from './telegram-export-paths.js';
import { failure } from './telegram-export-run.js';
import { freeFolder } from './telegram-account-data-paths.js';
import {
  KINDS,
  delayOf,
  runDataExport,
  takeoutClient,
  takeoutFlags,
} from './telegram-account-data-run.js';

const bad = (code) => ({ ok: false, error: code, code });
const flag = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

const plainObject = (v) =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Whether the fields have the right shapes (not yet whether they say
// enough to export anything).
const shapeOk = (r, kindsIn) =>
  plainObject(kindsIn) &&
  Object.entries(kindsIn).every(
    ([k, v]) => KINDS.includes(k) && typeof v === 'boolean'
  ) &&
  [r.media, r.info, r.contacts].every(
    (v) => v === undefined || typeof v === 'boolean'
  ) &&
  validLimit(r.sizeLimitMb ?? DEFAULT_LIMIT_MB) &&
  validRange(r.from ?? null, r.to ?? null) &&
  validFormats(r.formats);

/**
 * The request as `{ ok: true, value }`, or `{ ok: false, code:
 * 'bad-request' }`: `info`/`contacts` booleans, `kinds` (known keys,
 * booleans, at least one thing chosen), `media` boolean with a size limit of
 * 1 to 4000 MB, `from`/`to` as `YYYY-MM-DD` or none, one or both formats.
 */
export const parseDataExport = (request) => {
  const r = request ?? {};
  const kindsIn = r.kinds ?? {};
  const from = r.from ?? null;
  const to = r.to ?? null;
  const sizeLimitMb = r.sizeLimitMb ?? DEFAULT_LIMIT_MB;
  const kinds = Object.fromEntries(KINDS.map((k) => [k, kindsIn[k] === true]));
  const info = flag(r.info, true);
  const contacts = flag(r.contacts, true);
  const anything = info || contacts || Object.values(kinds).includes(true);
  if (!shapeOk(r, kindsIn) || !anything) {
    return bad('bad-request');
  }
  const media = r.media === true;
  return {
    ok: true,
    value: {
      info,
      contacts,
      kinds,
      media,
      sizeLimitMb,
      from,
      to,
      formats: FORMATS.filter((f) => r.formats.includes(f)),
      chatOptions: {
        media: Object.fromEntries(
          MEDIA_KEYS.map((k) => [k, media && k !== 'stickers' && k !== 'gifs'])
        ),
        sizeLimitMb,
        from,
        to,
      },
    },
  };
};

const snapshot = (job) =>
  job && {
    state: job.state,
    phase: job.phase,
    folder: job.folder,
    formats: job.formats,
    chatsTotal: job.chatsTotal,
    chatsDone: job.chatsDone,
    chatsFailed: job.chatsFailed,
    chatName: job.chatName,
    messages: job.messages,
    files: job.files,
    skipped: job.skipped,
    failed: job.failed,
    bytes: job.bytes,
    current: job.current,
    code: job.code ?? null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt ?? null,
  };

const COMMANDS = { darwin: 'open', win32: 'explorer' };

const opener = (folder) =>
  new Promise((resolve) => {
    execFile(COMMANDS[process.platform] ?? 'xdg-open', [folder], () =>
      resolve()
    );
  });

const newJob = (value, folder, at) => ({
  state: 'running',
  phase: 'starting',
  folder,
  formats: value.formats,
  chatsTotal: null,
  chatsDone: 0,
  chatsFailed: 0,
  chatName: null,
  messages: 0,
  files: 0,
  skipped: 0,
  failed: 0,
  bytes: 0,
  current: null,
  startedAt: new Date(at).toISOString(),
});

const active = (job) => ['running', 'cancelling'].includes(job?.state);

// Opens the session: `{ ok: true, id }`, or the failure to answer with
// (TAKEOUT_INIT_DELAY_X is `takeout-delay` with its seconds).
const openTakeout = async (c, value) => {
  const flags = takeoutFlags(value);
  try {
    const takeout = await c.client.invoke(
      new c.Api.account.InitTakeoutSession({
        ...flags,
        ...(value.media
          ? {
              files: true,
              fileMaxSize: c.helpers.returnBigInt(
                value.sizeLimitMb * 1024 * 1024
              ),
            }
          : {}),
      })
    );
    return { ok: true, id: takeout.id };
  } catch (error) {
    const seconds = delayOf(error);
    return seconds > 0
      ? { ok: false, error: 'takeout-delay', code: 'takeout-delay', seconds }
      : failure(error);
  }
};

export const createAccountData = (
  env,
  {
    userClient,
    mediaDir = null,
    home = os.homedir(),
    now = () => Date.now(),
    reveal = opener,
  }
) => {
  const storeDir = mediaDir ? path.resolve(mediaDir, '..', '..') : null;
  const sleep =
    env.sleep ??
    ((ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)));
  let job = null;
  let starting = false;

  const finish = async (c, takeoutId, state) => {
    job.state = state;
    job.phase = 'finished';
    job.current = null;
    job.finishedAt = new Date(now()).toISOString();
    if (state === 'failed') {
      job.code = failure(job.error).code;
    }
    delete job.error;
    env.log?.({
      level: 'info',
      event: 'telegram_data_export_end',
      state,
      code: job.code ?? null,
      chats: job.chatsDone,
      messages: job.messages,
    });
    try {
      await c.client.invoke(
        new c.Api.InvokeWithTakeout({
          takeoutId,
          query: new c.Api.account.FinishTakeoutSession({
            success: state === 'done',
          }),
        })
      );
    } catch {
      // the session ends by itself; the export stands
    }
  };

  const launch = async (c, value, takeoutId) => {
    const base = storeDir ? path.join(storeDir, 'exports') : null;
    const folder = await freeFolder(
      base ?? path.join(home, 'Downloads', 'Telegram Desktop'),
      `DataExport_${dayOf(now())}`
    );
    job = newJob(value, folder, now());
    env.log?.({
      level: 'info',
      event: 'telegram_data_export_start',
      formats: value.formats,
    });
    const run = {
      env,
      c,
      client: takeoutClient(c, takeoutId),
      job,
      value,
      now,
      sleep,
    };
    // In the background: the page follows it by asking for the status.
    runDataExport(run)
      .then((state) => finish(c, takeoutId, state))
      .catch(() => {});
    return { ok: true, job: snapshot(job) };
  };

  const start = async (request) => {
    const parsed = parseDataExport(request);
    if (!parsed.ok) {
      return parsed;
    }
    if (starting || active(job)) {
      return bad('busy');
    }
    starting = true;
    try {
      return await connected(env, userClient, failure, async (c) => {
        const opened = await openTakeout(c, parsed.value);
        return opened.ok ? launch(c, parsed.value, opened.id) : opened;
      });
    } finally {
      starting = false;
    }
  };

  return {
    dataExportDefaults: async () => ({ ok: true, job: snapshot(job) }),
    dataExportStatus: async () => ({ ok: true, job: snapshot(job) }),
    dataExportStart: start,
    dataExportCancel: async () => {
      if (job?.state === 'running') {
        job.state = 'cancelling';
      }
      return { ok: true, job: snapshot(job) };
    },
    dataExportReveal: async () => {
      if (!job || active(job)) {
        return bad('no-export');
      }
      await reveal(job.folder);
      return { ok: true };
    },
  };
};
