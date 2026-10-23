/**
 * 0005 — collision-free Facebook / Messenger and LinkedIn message ids,
 * ISO Facebook times, repaired text (R-Z10, R-Z17).
 *
 * Before R-Z10 a Facebook message was `msg:facebook:<timestamp_ms>` (two
 * messages in one millisecond, or in two threads, were one link) with the
 * number stored as `timestamp`, and a LinkedIn message
 * `msg:linkedin:<conversation>-<date text>` (two in one second collided).
 * Now: `msg:facebook:<thread folder>:<ms>:<sender digest>:<n>` and
 * `msg:linkedin:<conversation>:<ISO time>:<sender digest>:<n>`.
 *
 * Computed only from stored fields. The thread is the last part of the
 * stored `chat` (the old `thread_path`); the sender digest is taken over
 * the sender with its latin-1 mojibake repaired (only when that
 * round-trips, so honest text is never changed); n is 0 (a collision kept
 * one survivor). The link is first rewritten in place (ISO `timestamp`,
 * `chat`, repaired `sender` / `body`, children / tokens for the new id),
 * then moved with `ctx.rekeyMany`, so the old id stays resolvable through
 * `alias:`. A Facebook message without `timestamp_ms` (id
 * `<sender>-<seconds>`) and a LinkedIn message whose date cannot be read
 * cannot be computed: they are counted (`unresolved`) and left as they
 * are. Re-importing the archive does not duplicate a migrated message
 * (the importer checks the old id and its alias). Idempotent.
 */

import {
  fixMojibake,
  linkedinDate,
  shortHash,
} from '../../sources/archive/text.js';

export const id = '0005-archive-ids';
export const from = 4;
export const to = 5;
export const description =
  'Facebook / LinkedIn: collision-free message ids (old ids stay resolvable), Facebook timestamps as ISO text, repaired mojibake.';

const FB = 'msg:facebook:';
const LI = 'msg:linkedin:';
// The new ids end in a 14-digit hex sender digest and the counter.
const NEW_ID = /:[0-9a-f]{14}:\d+$/;

const lastPart = (chat) =>
  String(chat ?? '')
    .split('/')
    .filter(Boolean)
    .at(-1);

const isoOfMs = (value) => {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// The children of a link for its new external id and chat.
const childrenFor = (link, network, key, sender, chat) =>
  (link.children ?? []).map((child) => {
    for (const [kind, value] of [
      ['sender', sender],
      ['chat', chat],
      ['body', key],
      ['ts', key],
    ]) {
      if (child.startsWith(`${kind}:${network}:`)) {
        return `${kind}:${network}:${value}`;
      }
    }
    return child;
  });

const movedTo = (link, network, key, fields) => {
  const sender = fields.sender ?? link.sender;
  const chat = fields.chat ?? link.chat;
  return {
    ...link,
    ...fields,
    tokens: ['message', network, key],
    children: childrenFor(link, network, key, sender, chat),
  };
};

// -> { next, pair } | { next } (time or text only) | { unresolved } | null
const facebookStep = (link) => {
  const patch = {};
  if (typeof link.timestamp === 'number') {
    patch.timestamp = isoOfMs(link.timestamp) ?? link.timestamp;
  }
  const oldKey = link.id.slice(FB.length);
  if (NEW_ID.test(link.id)) {
    return Object.keys(patch).length ? { next: { ...link, ...patch } } : null;
  }
  const ms = /^\d+$/.test(oldKey) ? oldKey : null;
  if (!ms) {
    // `<sender>-<seconds>` is an archive row without timestamp_ms; other
    // shapes (live Messenger ids) are not archive ids at all.
    const archiveRow = /-\d+$/.test(oldKey);
    return {
      unresolved: archiveRow,
      next: Object.keys(patch).length ? { ...link, ...patch } : null,
    };
  }
  const sender = fixMojibake(link.sender ?? 'unknown');
  const thread = lastPart(link.chat) || 'unknown';
  const key = `${thread}:${ms}:${shortHash(sender)}:0`;
  const fields = {
    ...patch,
    timestamp: patch.timestamp ?? isoOfMs(ms) ?? link.timestamp,
    chat: thread,
    sender,
    ...(link.senderName ? { senderName: fixMojibake(link.senderName) } : {}),
    body: fixMojibake(link.body),
  };
  return {
    next: movedTo(link, 'facebook', key, fields),
    pair: [link.id, `${FB}${key}`],
  };
};

const isOldLinkedIn = (link) =>
  typeof link.raw?.id === 'string' &&
  typeof link.raw.date === 'string' &&
  link.id === `${LI}${link.raw.id}-${link.raw.date}`;

const linkedinStep = (link) => {
  if (!isOldLinkedIn(link)) {
    return null;
  }
  const iso = linkedinDate(link.raw.date);
  if (!iso) {
    return { unresolved: true };
  }
  const key = `${link.raw.id}:${iso}:${shortHash(link.sender)}:0`;
  return {
    next: movedTo(link, 'linkedin', key, { timestamp: iso }),
    pair: [link.id, `${LI}${key}`],
  };
};

export const up = async (ctx) => {
  const pairs = [];
  let unresolved = 0;
  for (const [prefix, step] of [
    [FB, facebookStep],
    [LI, linkedinStep],
  ]) {
    await ctx.scan({ prefix }, async (batch) => {
      const out = [];
      for (const link of batch) {
        const result = step(link);
        unresolved += result?.unresolved ? 1 : 0;
        if (result?.next) {
          out.push(result.next);
        }
        if (result?.pair) {
          pairs.push(result.pair);
        }
      }
      await ctx.putMany(out);
    });
  }
  const moved = await ctx.rekeyMany(pairs);
  ctx.log('archive_ids', { moved, unresolved });
};
