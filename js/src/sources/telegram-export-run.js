/**
 * One export running in the background (R-Y186): the chat's history read
 * page by page, oldest first (messages.getHistory, through the account's
 * queue at `prefetch` priority, waiting out "wait N seconds"), each message
 * written to the folder with its file downloaded as the user's choices
 * allow. `r` is the run: `{ env, c, job, now, sleep, publish, ... }`.
 * Cancel is a `cancelling` state the loops look at between steps; what was
 * written stays. No message text is ever logged.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { renameDurable } from '../storage/durable.js';
import { rawMessage, floodSeconds } from './telegram-history.js';
import { bigSize, locationOf, fileLocation } from './telegram-media.js';
import { failureOf } from './telegram-stickers.js';
import { createNamer, dayEndMs, dayStartMs } from './telegram-export-paths.js';
import { entitiesOf, messageOf, segmentsOf } from './telegram-export-shape.js';
import {
  NOTE_FAILED,
  fileInfoOf,
  inlineMediaOf,
  mediaFields,
  skipNote,
  wantedName,
} from './telegram-export-media.js';
import { chatMeta, keyOfChat, openOutput } from './telegram-export-output.js';

const PAGE = 100;
const MAX_WAIT_S = 3600;
const MAX_WAITS = 24;

export const failure = failureOf({
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  CHAT_ADMIN_REQUIRED: 'no-access',
  FLOOD_WAIT: 'flood',
});

const unixOf = (value) =>
  typeof value === 'string'
    ? Math.floor(Date.parse(value) / 1000) || 0
    : Number(value) || 0;

const nameOfUser = (u) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') ||
  u.username ||
  (u.deleted ? 'Deleted Account' : `user${u.id}`);

// What a page's users and chats tell: names and the chat's kind.
const absorb = (page, ctx) => {
  for (const u of page?.users ?? []) {
    const key = `user${u.id}`;
    ctx.names.set(key, nameOfUser(u));
    ctx.entities.set(key, {
      title: nameOfUser(u),
      bot: Boolean(u.bot),
      self: Boolean(u.self),
      username: u.username,
    });
    if (u.self) {
      ctx.self = key;
    }
  }
  for (const c of page?.chats ?? []) {
    const key = c.className?.startsWith('Channel')
      ? `channel${c.id}`
      : `chat${c.id}`;
    ctx.names.set(key, c.title ?? key);
    ctx.entities.set(key, {
      title: c.title,
      username: c.username,
      megagroup: Boolean(c.megagroup),
    });
  }
};

/** A new run of `job` on the connection `c`. */
export const newRun = ({ env, c, job, now, sleep, publish }) => ({
  env,
  c,
  job,
  now,
  sleep,
  publish,
  ctx: {
    names: new Map(),
    entities: new Map(),
    self: null,
    peer: keyOfChat(job.chat),
  },
  counts: {},
  name: createNamer(),
  out: null,
  fromMs: job.options.from === null ? null : dayStartMs(job.options.from),
  toMs: job.options.to === null ? null : dayEndMs(job.options.to),
});

export const stopping = (r) => r.job.state === 'cancelling';

// A wait Telegram asked for, cut short by Cancel.
const waitFor = async (r, seconds) => {
  const end = r.now() + seconds * 1000;
  while (r.now() < end && !stopping(r)) {
    await r.sleep(Math.min(1000, Math.max(0, end - r.now())));
  }
};

const waitSeconds = (error) =>
  error?.code === 'flood-wait'
    ? Number(error.retryAfter) || 1
    : floodSeconds(error);

// `use` through the queue; after "wait N seconds" wait and ask again.
export const asked = async (r, key, use) => {
  for (let tries = 0; ; tries += 1) {
    try {
      return await (r.env.queue
        ? r.env.queue.run(key, 'prefetch', use)
        : use());
    } catch (error) {
      const seconds = waitSeconds(error);
      if (seconds <= 0 || tries >= MAX_WAITS || stopping(r)) {
        throw error;
      }
      r.env.log?.({ level: 'info', event: 'telegram_export_waiting', seconds });
      await waitFor(r, Math.min(seconds, MAX_WAIT_S));
      if (stopping(r)) {
        throw error;
      }
    }
  }
};

const download = async (r, info, target) => {
  const { c, job } = r;
  const part = `${target}.part`;
  const location =
    info.kind === 'photo'
      ? locationOf(c.Api, c.helpers, info)
      : fileLocation(c.Api, c.helpers, info.file);
  const method = info.kind === 'photo' ? 'media' : 'file';
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await asked(r, `${method}:export:${job.chat}:${info.file.id}`, () =>
      c.client.downloadFile(location, {
        dcId: Number(info.file.dcId),
        fileSize: bigSize(c.helpers, info.size),
        outputFile: part,
      })
    );
    await renameDurable(part, target); // (R-Z19)
  } catch (error) {
    await fs.rm(part, { force: true });
    throw error;
  }
  job.bytes += (await fs.stat(target)).size;
};

// The message's file: downloaded, or the note why it is not.
const fileOf = async (r, info, at) => {
  const { job } = r;
  const note = skipNote(info, job.options);
  if (note) {
    job.skipped += 1;
    return mediaFields(info, note);
  }
  r.counts[info.folder] = (r.counts[info.folder] ?? 0) + 1;
  const relative = r.name(
    info.folder,
    wantedName(info, { index: r.counts[info.folder], at })
  );
  job.current = path.basename(relative);
  await r.publish();
  try {
    await download(r, info, path.join(job.folder, relative));
    job.files += 1;
    return mediaFields(info, relative);
  } catch (error) {
    if (stopping(r)) {
      throw error;
    }
    job.failed += 1;
    return mediaFields(info, NOTE_FAILED);
  }
};

const fieldsOf = async (r, raw) => {
  const info = raw.className === 'MessageService' ? null : fileInfoOf(raw);
  const inline = inlineMediaOf(raw);
  return info
    ? { ...inline, ...(await fileOf(r, info, unixOf(raw.date))) }
    : inline;
};

const writeMessage = async (r, raw) => {
  const media = await fieldsOf(r, raw);
  await r.out.add(
    messageOf(raw, r.ctx, media),
    segmentsOf(raw.message, entitiesOf(raw))
  );
  r.job.messages += 1;
  await r.publish();
};

const readPage = (r, cursor, n) =>
  asked(r, `messages:export:${r.job.chat}:${n}`, () =>
    r.env.connection.withPeer(r.c.client, r.job.chat, (peer) =>
      r.c.client.invoke(
        new r.c.Api.messages.GetHistory({
          peer,
          offsetId: cursor.offsetId,
          offsetDate: cursor.offsetDate,
          addOffset: -PAGE,
          limit: PAGE,
          maxId: 0,
          minId: 0,
          hash: r.c.zero,
        })
      )
    )
  );

// The first answer: how many there are, and the folder opened under the
// chat's name and kind.
const begin = async (r, page) => {
  const ranged = r.fromMs !== null || r.toMs !== null;
  r.job.total = ranged
    ? null
    : Number(page.count ?? page.messages?.length ?? 0);
  r.out = await openOutput({
    folder: r.job.folder,
    formats: r.job.formats,
    meta: chatMeta({
      chat: r.job.chat,
      chatName: r.job.chatName,
      entities: r.ctx.entities,
    }),
  });
};

// Writes the page's messages; `last` is the newest id seen, `done` that the
// end of the range or a Cancel was reached.
const consume = async (r, fresh, last) => {
  let newest = last;
  for (const message of fresh) {
    if (stopping(r)) {
      return { last: newest, done: true };
    }
    const raw = rawMessage(message);
    const at = unixOf(raw.date) * 1000;
    newest = Math.max(newest, Number(raw.id));
    if (r.toMs !== null && at > r.toMs) {
      return { last: newest, done: true };
    }
    if (r.fromMs === null || at >= r.fromMs) {
      await writeMessage(r, raw);
    }
  }
  return { last: newest, done: false };
};

const freshOf = (page, last) =>
  (page.messages ?? [])
    .filter((m) => m.className !== 'MessageEmpty' && Number(m.id) > last)
    .sort((a, b) => Number(a.id) - Number(b.id));

// Oldest first: each page is the messages after the cursor (a negative
// add_offset), the newest of them the next cursor; it ends when nothing
// newer comes.
const readAll = async (r) => {
  let cursor =
    r.fromMs === null
      ? { offsetId: 1, offsetDate: 0 }
      : { offsetId: 0, offsetDate: Math.floor(r.fromMs / 1000) };
  let last = 0;
  for (let n = 1; !stopping(r); n += 1) {
    const page = await readPage(r, cursor, n);
    absorb(page, r.ctx);
    if (n === 1) {
      await begin(r, page);
    }
    const fresh = freshOf(page, last);
    const step = fresh.length > 0 ? await consume(r, fresh, last) : null;
    if (!step || step.done) {
      return;
    }
    last = step.last;
    cursor = { offsetId: last, offsetDate: 0 };
  }
};

const finish = async (r, state, error = null) => {
  const { job } = r;
  job.state = state;
  job.current = null;
  job.finishedAt = new Date(r.now()).toISOString();
  if (error) {
    job.code = failure(error).code;
  }
  r.env.log?.({
    level: 'info',
    event: 'telegram_export_end',
    state,
    code: job.code ?? null,
    messages: job.messages,
    files: job.files,
    skipped: job.skipped,
    failed: job.failed,
    bytes: job.bytes,
  });
  await r.publish(true);
};

/** Runs the export to its end; never throws (the job's state tells). */
export const execute = async (r) => {
  try {
    await readAll(r);
    await r.out?.close();
    await finish(r, stopping(r) ? 'cancelled' : 'done');
  } catch (error) {
    await r.out?.close().catch(() => {});
    await finish(r, stopping(r) ? 'cancelled' : 'failed', error);
  }
};
