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

import { AsyncLocalStorage } from 'node:async_hooks';
import { actionNamesOf } from './telegram-service-names.js';

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
 *   - `mode: 'newer'` — messages read far back, then toward the newest
 *     (a jump to a date): they join the stretch only once they reach it.
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

// A stretch read far back (a jump to a date, R-Y106): it moves `oldest`
// back once it reaches the stored stretch; otherwise nothing changes.
const coverNewer = (record, got) => {
  if (
    !record ||
    !known(record.oldest) ||
    got.length === 0 ||
    Math.max(...got) < Number(record.oldest)
  ) {
    return record;
  }
  return {
    ...record,
    oldest: Math.min(Number(record.oldest), ...got),
    newest: Math.max(Number(record.newest), ...got),
  };
};

export const coverSlice = (record, { ids, limit, mode, at }) => {
  const got = numbers(ids);
  const full = got.length >= limit;
  const before = record ?? {};
  if (mode === 'newer') {
    return coverNewer(record, got);
  }
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

/**
 * How fast each priority may ask Telegram (R-Y34): the least time since
 * the last request of any priority, and how many requests of the last
 * minute it still lets through — so background work runs only while the
 * minute is quiet and never in a burst. Far below what Telegram allows
 * an account; its own apps ask about as often while the user scrolls.
 */
export const PACE = Object.freeze({
  view: { gapMs: 250, perMinute: 60 },
  list: { gapMs: 500, perMinute: 45 },
  prefetch: { gapMs: 1500, perMinute: 30 },
  background: { gapMs: 3000, perMinute: 20 },
});
/** No pacing (tests). */
export const NO_PACE = Object.freeze(
  Object.fromEntries(
    PRIORITIES.map((p) => [p, { gapMs: 0, perMinute: Infinity }])
  )
);
const MINUTE_MS = 60_000;
// After Telegram asked to wait, everything goes this much slower for
// SLOW_FOR_MS (background and prefetch; the user's own requests half).
export const SLOW_FOR_MS = 60 * MINUTE_MS;
const SLOW_FACTOR = 4;
// A wait this short is waited out by what the user looks at.
const VIEW_WAITS_MS = 3000;
// Telegram's wait is for the method that was asked too often; the
// others pause this long too, so a burst cools down.
const ALL_WAIT_MS = 30_000;
// A request with no answer by then is given up, so the queue moves on:
// GramJS can lose its connection without a word and then never answer.
// A file may take its time.
export const STUCK_MS = Object.freeze({ file: 10 * MINUTE_MS, other: 60_000 });

/** The method a queue key names: `messages:42:…` → `messages`. */
export const methodOf = (key) => String(key ?? '').split(':')[0];

export const floodSeconds = (error) => {
  const text = `${error?.errorMessage ?? ''} ${error?.message ?? ''}`;
  const match =
    /FLOOD_(?:PREMIUM_)?WAIT_(\d+)/.exec(text) ??
    /A wait of (\d+) seconds is required/.exec(text);
  return match ? Number(match[1]) : Number(error?.seconds) || 0;
};

// GramJS while its connection is down ("Cannot send requests while
// disconnected"): it reconnects by itself within seconds, so a request
// waits for it — 1 s, 2 s, 4 s, 8 s — instead of failing (R-Y75), as
// Telegram's apps queue requests until they are connected again.
const DISCONNECTED_RETRIES = 4;
export const isDisconnected = (error) =>
  /while disconnected|not connected|connection (?:was )?closed/i.test(
    String(error?.message ?? error ?? '')
  );

const floodError = (retryAfter) =>
  Object.assign(new Error('Telegram asked to wait'), {
    code: 'flood-wait',
    retryAfter,
  });

/**
 * One Telegram request at a time, the most urgent first, at the pace of
 * `PACE`. The same `key` asked again while waiting is merged (and takes
 * the higher priority); its first part names the method (`methodOf`).
 * After Telegram's "wait N seconds" — from a request of the queue or
 * from anywhere else (`note`) — that method is not asked for that long,
 * nothing at all for up to ALL_WAIT_MS (what waits is turned down with
 * `code: 'flood-wait'` and `retryAfter`), and then everything goes
 * slower for an hour. `onHold(holds)` saves the holds, `hold(holds)`
 * restores them after a restart. A request with no answer within
 * `stuck` is turned down (`code: 'telegram-stuck'`) and `onStuck(job)`
 * told, so the connection can be opened anew. A request asked by one in
 * flight (the peer a refresh needs looked up) is part of it and runs at
 * once: queued, it would wait for the request waiting for it.
 */
// The queue's clock: when each request of the last minute began, and
// Telegram's waits (`holdUntil`: nothing; `methods`: one method).
const createPacing = ({ pace, now }) => {
  const started = [];
  let holdUntil = 0;
  let slowUntil = 0;
  const methods = new Map();

  const paceOf = (priority) => {
    const base = pace[priority] ?? pace.prefetch;
    if (now() >= slowUntil) {
      return base;
    }
    const factor = rank(priority) >= rank('prefetch') ? SLOW_FACTOR : 2;
    return { gapMs: base.gapMs * factor, perMinute: base.perMinute / factor };
  };

  // When `job` may go: after its gap, within its share of the minute.
  const readyAt = (job) => {
    while (started.length > 0 && started[0] <= now() - MINUTE_MS) {
      started.shift();
    }
    const { gapMs, perMinute } = paceOf(job.priority);
    const last = started.at(-1) ?? -Infinity;
    const over = started.length - Math.floor(perMinute) + 1;
    const budget = over > 0 ? started[over - 1] + MINUTE_MS : -Infinity;
    return Math.max(
      last + gapMs,
      budget,
      heldUntil(job.method),
      job.notBefore ?? 0
    );
  };

  function heldUntil(method) {
    return Math.max(holdUntil, methods.get(method) ?? 0);
  }

  const holds = () => ({
    holdUntil,
    slowUntil,
    methods: Object.fromEntries(
      [...methods].filter(([, until]) => until > now())
    ),
  });

  /** Restore (or add) holds: `{ holdUntil, slowUntil, methods }`. */
  const hold = (saved = {}) => {
    holdUntil = Math.max(holdUntil, Number(saved.holdUntil) || 0);
    slowUntil = Math.max(slowUntil, Number(saved.slowUntil) || 0);
    for (const [method, until] of Object.entries(saved.methods ?? {})) {
      methods.set(method, Math.max(methods.get(method) ?? 0, Number(until)));
    }
  };

  const state = () => ({
    heldFor: Math.max(0, holdUntil - now()),
    methods: Object.fromEntries(
      [...methods]
        .filter(([, until]) => until > now())
        .map(([method, until]) => [method, Math.ceil((until - now()) / 1000)])
    ),
    slowFor: Math.max(0, slowUntil - now()),
    lastMinute: started.filter((at) => at > now() - MINUTE_MS).length,
  });

  return {
    readyAt,
    heldUntil,
    hold,
    holds,
    state,
    began: () => started.push(now()),
  };
};

// The job's answer, or its turn-down once it is stuck (`STUCK_MS`).
const answerWithin = (job, { stuck, log, onStuck, setTimer, clearTimer }) => {
  let given = null;
  let over = false;
  const ms = stuck[job.method] ?? stuck.other;
  const gaveUp = new Promise((resolve, reject) => {
    given = setTimer(() => {
      if (over) {
        return; // answered meanwhile: nothing to turn down
      }
      log({
        level: 'warn',
        event: 'telegram_request_stuck',
        method: job.method,
        priority: job.priority,
        seconds: Math.round(ms / 1000),
      });
      onStuck(job);
      reject(
        Object.assign(new Error('Telegram did not answer'), {
          code: 'telegram-stuck',
        })
      );
    }, ms);
    given?.unref?.();
  });
  gaveUp.catch(() => {}); // only the race below reports it
  return Promise.race([job.task(), gaveUp]).finally(() => {
    over = true;
    clearTimer(given);
  });
};

// A request in the queue: what it asks and the promise it answers.
const newJob = (key, priority, task, seq) => {
  const job = { key, method: methodOf(key), priority, task, seq };
  job.promise = new Promise((resolve, reject) => {
    job.resolve = resolve;
    job.reject = reject;
  });
  return job;
};

export const createFetchQueue = ({
  now = () => Date.now(),
  log = () => {},
  pace = PACE,
  onHold = () => {},
  stuck = STUCK_MS,
  onStuck = () => {},
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
} = {}) => {
  const waiting = [];
  const byKey = new Map();
  const inJob = new AsyncLocalStorage();
  const pacing = createPacing({ pace, now });
  const { readyAt, heldUntil, hold, holds } = pacing;
  let busy = false;
  let timer = null;

  const take = () => {
    waiting.sort(
      (a, b) => rank(a.priority) - rank(b.priority) || a.seq - b.seq
    );
    return waiting[0];
  };

  const drop = (job) => {
    waiting.splice(waiting.indexOf(job), 1);
    byKey.delete(job.key);
  };

  /** Telegram's answer to any request: a "wait" holds the queue. */
  const note = (error, { method = null, priority = null } = {}) => {
    const seconds = floodSeconds(error);
    if (seconds > 0) {
      const until = now() + seconds * 1000;
      hold({
        holdUntil: Math.min(until, now() + ALL_WAIT_MS),
        slowUntil: until + SLOW_FOR_MS,
        methods: method ? { [method]: until } : {},
      });
      onHold(holds());
      // The client's own watch and the queue see the same error once.
      if (!error.floodNoted) {
        log({
          level: 'warn',
          event: 'telegram_flood_wait',
          seconds,
          method,
          priority,
        });
      }
      Object.assign(error, { floodNoted: true });
      pump();
    }
    return seconds;
  };

  const runJob = async (job) => {
    pacing.began();
    try {
      job.resolve(
        await inJob.run(job, () =>
          answerWithin(job, { stuck, log, onStuck, setTimer, clearTimer })
        )
      );
      job.done = true;
    } catch (error) {
      job.done = true;
      note(error, job);
      const tries = job.reconnectTries ?? 0;
      if (isDisconnected(error) && tries < DISCONNECTED_RETRIES) {
        // Back in line once the connection had time to come back.
        job.reconnectTries = tries + 1;
        job.done = false;
        job.notBefore = now() + 1000 * 2 ** tries;
        byKey.set(job.key, job);
        waiting.push(job);
        return;
      }
      job.reject(error);
    }
  };

  // Turn down what waits while Telegram asked to wait (a short wait is
  // waited out by the user's own requests).
  const turnDownHeld = () => {
    for (const job of [...waiting]) {
      const left = heldUntil(job.method) - now();
      if (left > 0 && (job.priority !== 'view' || left > VIEW_WAITS_MS)) {
        drop(job);
        job.reject(floodError(Math.ceil(left / 1000)));
      }
    }
  };

  const wake = (ms) => {
    clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      pump();
    }, ms);
    timer?.unref?.();
  };

  async function pump() {
    if (busy) {
      return;
    }
    busy = true;
    try {
      for (;;) {
        turnDownHeld();
        const job = take();
        if (!job) {
          return;
        }
        const wait = readyAt(job) - now();
        if (wait > 0) {
          wake(wait);
          return;
        }
        drop(job);
        await runJob(job);
      }
    } finally {
      busy = false;
    }
  }

  let seq = 0;
  const run = (key, priority, task) => {
    // Asked by a request in flight (a peer looked up for it): it is part
    // of that request, and the queue it would wait in waits for it.
    const asking = inJob.getStore();
    if (asking && !asking.done) {
      return Promise.resolve().then(task);
    }
    const queued = byKey.get(key);
    if (queued) {
      if (rank(priority) < rank(queued.priority)) {
        queued.priority = priority;
        pump();
      }
      return queued.promise;
    }
    const job = newJob(key, priority, task, (seq += 1));
    byKey.set(key, job);
    waiting.push(job);
    pump();
    return job.promise;
  };

  return {
    run,
    note,
    hold,
    /** How many requests wait at `priority` or more urgent. */
    pending: (priority = 'background') =>
      waiting.filter((job) => rank(job.priority) <= rank(priority)).length,
    /** How long nothing (or nothing of `method`) is asked, in ms. */
    heldFor: (method = null) => Math.max(0, heldUntil(method) - now()),
    holds,
    /** For the status: the waits, the slow hour, the last minute's count. */
    state: () => ({ ...pacing.state(), waiting: waiting.length }),
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

// A rich message (layer 232, R-Y220) is a tree of page blocks (lists in
// lists, text in text), deeper than the other fields: it gets its own
// depth. The pictures' inline previews (stripped or cached sizes, document
// thumbnails, waveforms) are bytes the page never reads; they are left
// out so a long answer does not weigh the store down.
const RICH_DEPTH = -24;
const slimFile = (file) => {
  for (const list of [file?.sizes, file?.thumbs, file?.videoThumbs]) {
    for (const size of Array.isArray(list) ? list : []) {
      delete size?.bytes;
    }
  }
  for (const one of Array.isArray(file?.attributes) ? file.attributes : []) {
    delete one?.waveform;
  }
  return file;
};

const slimRich = (rich) => {
  for (const file of [...(rich.photos ?? []), ...(rich.documents ?? [])]) {
    slimFile(file);
  }
  return rich;
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
    const rich = key === 'richMessage';
    let plain = plainOf(item, rich ? RICH_DEPTH : depth + 1, seen);
    if (rich && plain) {
      plain = slimRich(plain);
    }
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
  // The names a service message's action holds ids of (R-Y221).
  const names = actionNamesOf(message);
  return names && raw ? { ...raw, actionNames: names } : raw;
};
