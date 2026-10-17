/**
 * What of each Telegram chat is already in the store, so Telegram is
 * asked only for what is missing (R-Y24 .. R-Y28).
 *
 * Every message ever loaded stays in the store (`data.lino` and
 * `data.bin`), with everything Telegram said about it (`raw`). A chat's
 * `history:telegram:<chat>` link records the stretch of it that is
 * stored without holes, from `newest` back to `oldest`, and `complete`
 * once that stretch reaches the chat's first message. Opening a chat
 * again, or scrolling back over what was read before, is then answered
 * from the store; Telegram is asked for older pages, for a chat never
 * opened, and — for channels, whose updates the account-wide catch-up
 * does not carry — for what came after `newest`.
 *
 * Requests to Telegram go one at a time through `createFetchQueue`, the
 * most urgent first: the chat the user is looking at, then the chat
 * list, then chats visible in it, then the slow background download.
 */

const SOURCE = 'telegram';

export const historyLinkId = (chat) => `history:${SOURCE}:${chat}`;

/** The `history:` link for a chat, with the covered stretch. */
export const historyLink = (chat, cover) => ({
  id: historyLinkId(chat),
  tokens: ['history', SOURCE, String(chat)],
  kind: 'history',
  source: SOURCE,
  chat: String(chat),
  newest: cover.newest ?? null,
  oldest: cover.oldest ?? null,
  complete: Boolean(cover.complete),
  at: cover.at ?? null,
});

const numbers = (ids) => ids.map(Number).filter(Number.isFinite);

/**
 * The covered stretch after one slice of a chat was read:
 *
 *   - `mode: 'newest'` — the newest `limit` messages: joins the stretch
 *     when it overlaps it, otherwise starts a new one (what lies between
 *     was never read); fewer than `limit` means the whole chat.
 *   - `mode: 'since'` — messages after `newest` (`minId`): a full page
 *     may leave a hole behind it, so the stretch starts again there.
 *   - `mode: 'older'` — the page before `oldest` (`offsetId`); fewer than
 *     `limit` means the first message was reached.
 */
const known = (value) => value !== null && value !== undefined;

// A page older than the stretch: it moves `oldest` back.
const coverOlder = (before, got, full) => ({
  ...before,
  oldest: got.length ? Math.min(...got) : (before.oldest ?? null),
  complete: Boolean(before.complete) || !full,
});

// Nothing came: a `since` read found nothing new, a `newest` one an
// empty chat (or one already whole).
const coverNothing = (before, mode, at) =>
  mode === 'since'
    ? { ...before, at }
    : {
        ...before,
        complete: !known(before.newest) || Boolean(before.complete),
        at,
      };

export const coverSlice = (record, { ids, limit, mode, at }) => {
  const got = numbers(ids);
  const full = got.length >= limit;
  const before = record ?? {};
  if (mode === 'older') {
    return coverOlder(before, got, full);
  }
  if (got.length === 0) {
    return coverNothing(before, mode, at);
  }
  const min = Math.min(...got);
  const max = Math.max(...got);
  const whole = mode === 'newest' && !full;
  const joins =
    known(before.newest) &&
    (mode === 'since' ? !full : min <= Number(before.newest));
  if (!joins) {
    return { newest: max, oldest: min, complete: whole, at };
  }
  return {
    newest: Math.max(Number(before.newest), max),
    oldest: Math.min(Number(before.oldest ?? min), min),
    complete: Boolean(before.complete) || whole,
    at,
  };
};

// Channels and supergroups: their updates are not in the account-wide
// difference, so what came after `newest` is asked for again — at most
// this often per chat.
export const CHANNEL_FRESH_MS = 60_000;
export const isChannelChat = (chat) => String(chat).startsWith('-100');

/**
 * What one request for a chat's history needs from Telegram, given its
 * `history:` record: `null` when the store already has it, otherwise
 * the `getMessages` options and the slice mode.
 */
const olderPlan = (record, before, limit) => {
  if (record?.complete && Number(record.oldest ?? 0) <= Number(before)) {
    return null;
  }
  const from = known(record?.oldest)
    ? Math.min(Number(record.oldest), Number(before))
    : Number(before);
  return { mode: 'older', options: { limit, offsetId: from } };
};

export const historyPlan = (record, { before = null, limit, now }) => {
  if (known(before)) {
    return olderPlan(record, before, limit);
  }
  if (!known(record?.newest)) {
    return record?.complete ? null : { mode: 'newest', options: { limit } };
  }
  const fresh = now - (Date.parse(record.at ?? '') || 0) < CHANNEL_FRESH_MS;
  if (!isChannelChat(record.chat) || fresh) {
    return null;
  }
  return { mode: 'since', options: { limit, minId: Number(record.newest) } };
};

// ---- the request queue ----------------------------------------------

export const PRIORITIES = ['view', 'list', 'prefetch', 'background'];
const rank = (priority) => {
  const at = PRIORITIES.indexOf(priority);
  return at < 0 ? PRIORITIES.indexOf('prefetch') : at;
};

const floodSeconds = (error) => {
  const text = `${error?.errorMessage ?? ''} ${error?.message ?? ''}`;
  const match = /FLOOD_(?:PREMIUM_)?WAIT_(\d+)/.exec(text);
  return match ? Number(match[1]) : Number(error?.seconds) || 0;
};

/**
 * One Telegram request at a time, the most urgent first. The same `key`
 * asked again while waiting is merged (and takes the higher priority).
 * After Telegram's "wait N seconds", background and prefetch work stops
 * for that long; what the user looks at is still tried.
 */
export const createFetchQueue = ({
  now = () => Date.now(),
  log = () => {},
} = {}) => {
  const waiting = [];
  const byKey = new Map();
  let busy = false;
  let holdUntil = 0;

  const held = (job) =>
    rank(job.priority) >= rank('prefetch') && now() < holdUntil;

  const take = () => {
    waiting.sort(
      (a, b) => rank(a.priority) - rank(b.priority) || a.seq - b.seq
    );
    return waiting.shift();
  };

  const runJob = async (job) => {
    if (held(job)) {
      const error = Object.assign(new Error('Telegram asked to wait'), {
        code: 'flood-wait',
        retryAfter: Math.ceil((holdUntil - now()) / 1000),
      });
      job.reject(error);
      return;
    }
    try {
      job.resolve(await job.task());
    } catch (error) {
      const seconds = floodSeconds(error);
      if (seconds > 0) {
        holdUntil = Math.max(holdUntil, now() + seconds * 1000);
        log({ event: 'telegram_flood_wait', seconds, priority: job.priority });
      }
      job.reject(error);
    }
  };

  const pump = async () => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      while (waiting.length > 0) {
        const job = take();
        byKey.delete(job.key);
        await runJob(job);
      }
    } finally {
      busy = false;
    }
  };

  let seq = 0;
  const run = (key, priority, task) => {
    const queued = byKey.get(key);
    if (queued) {
      if (rank(priority) < rank(queued.priority)) {
        queued.priority = priority;
      }
      return queued.promise;
    }
    const job = { key, priority, task, seq: (seq += 1) };
    job.promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    byKey.set(key, job);
    waiting.push(job);
    pump();
    return job.promise;
  };

  return {
    run,
    /** How many requests wait at `priority` or more urgent. */
    pending: (priority = 'background') =>
      waiting.filter((job) => rank(job.priority) <= rank(priority)).length,
    heldFor: () => Math.max(0, holdUntil - now()),
  };
};

// ---- everything Telegram said about a message -------------------------

const SKIPPED_KEYS = new Set([
  'originalArgs',
  'CONSTRUCTOR_ID',
  'SUBCLASS_OF_ID',
  'classType',
  'flags',
  'flags2',
]);
const MAX_DEPTH = 8;

const isBigInteger = (value) =>
  typeof value?.toJSNumber === 'function' &&
  typeof value?.toString === 'function';

const isBytes = (value) =>
  value instanceof Uint8Array || globalThis.Buffer?.isBuffer?.(value);

const plainOf = (value, depth, seen) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value !== 'object' || depth > MAX_DEPTH || seen.has(value)) {
    return null;
  }
  if (isBigInteger(value)) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (isBytes(value)) {
    return { bytes: globalThis.Buffer.from(value).toString('base64') };
  }
  seen.add(value);
  const out = Array.isArray(value)
    ? value.map((item) => plainOf(item, depth + 1, seen))
    : objectOf(value, depth, seen);
  seen.delete(value);
  return out;
};

function objectOf(value, depth, seen) {
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      key.startsWith('_') ||
      SKIPPED_KEYS.has(key) ||
      typeof item === 'function'
    ) {
      continue;
    }
    const plain = plainOf(item, depth + 1, seen);
    if (plain !== null) {
      out[key] = plain;
    }
  }
  return out;
}

/**
 * A GramJS message (a TL object) as plain JSON — every field Telegram
 * sent (entities, media, forward and reply headers, views, reactions,
 * edit date, …), so the store can be analysed and learned from offline.
 * Client-side caches (`_sender`, `_chat`, …), TL bookkeeping and
 * duplicated `originalArgs` are left out; numbers too big for JS become
 * strings and bytes `{ bytes: <base64> }`.
 */
export const rawMessage = (message) => {
  if (!message || typeof message !== 'object') {
    return null;
  }
  const raw = plainOf(message, 0, new WeakSet());
  delete raw?.sender; // the sender's entity: a person link has it
  return raw;
};
