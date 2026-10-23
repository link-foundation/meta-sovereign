/**
 * The durable outbox and the one guarded send function (R-Z3).
 *
 * Every automated send (automations, the autopilot, greetings, re-engage
 * sessions, broadcast and outreach) goes through `guardedSend`:
 *
 *   1. refuse a chat on the opt-out list (nothing is written, nothing sent);
 *   2. refuse a key already `sending`, `sent` or `unknown` (a double click,
 *      a rerun, a restart): never send twice;
 *   3. write `outbox:<key>` as `{ status: 'sending' }` BEFORE the send; if
 *      that write fails nothing is sent;
 *   4. send with the key as the draft's `clientId` (Telegram turns it into
 *      the message's `random_id`, so even a lost answer cannot duplicate);
 *   5. write `sent`; a failing store write after a successful send is only
 *      logged and never becomes `failed` (the record stays `sending`, which
 *      a restart turns into `unknown`, and nothing resends either);
 *      `failed` for a definite refusal, `unknown` for a timeout or reset.
 *
 * After a crash `recoverOutbox` turns every `sending` record into
 * `unknown`. An `unknown` send is NEVER retried by itself: the page lists
 * it and the user decides (`resolveOutbox`: it arrived, or it did not).
 */

import { safeMessage } from '../server/redact.js';
import { loadSettings, optOutEntry } from './safety.js';

export const OUTBOX_PREFIX = 'outbox:';
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses that block another send under the same key. */
const BLOCKING = new Set(['sending', 'sent', 'unknown']);
export const OUTBOX_STATUSES = Object.freeze([
  'sending',
  'sent',
  'failed',
  'unknown',
]);

/** A short stable hash of a text (cyrb53), for keys. */
export const hashText = (text) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

/**
 * The deterministic idempotency key: the sender (an automation id, or
 * `greeting`, `broadcast`, `reengage`), the chat, what is sent and the
 * run/plan step (by default the UTC day, so a rerun the same day is the
 * same send and a later one is a new send the cooldown decides on).
 */
export const outboxKey = ({
  owner,
  source,
  chat,
  text = '',
  step = null,
  now = Date.now(),
}) =>
  [
    String(owner),
    source,
    chat ?? '-',
    hashText(text),
    step ?? new Date(Number(now)).toISOString().slice(0, 10),
  ].join(':');

export const outboxId = (key) => `${OUTBOX_PREFIX}${key}`;

// A timeout or a reset after the request left: it may have arrived.
const AMBIGUOUS_CODES = new Set([
  'timeout',
  'unknown',
  'network-unknown',
  'send-unknown', // R-Z4 / R-Z1: the adapter's own "may have arrived"
  'unknown-delivery', // alias of send-unknown
]);
const AMBIGUOUS_TEXT =
  /time(?:d)?[ -]?out|ETIMEDOUT|ECONNRESET|EPIPE|socket hang up|aborted|UND_ERR/i;

/** Whether a failed send may still have been delivered. */
export const isAmbiguous = (error) =>
  error?.ambiguous === true ||
  error?.outcome === 'unknown' ||
  AMBIGUOUS_CODES.has(error?.code) ||
  (Number(error?.status) >= 500 && Number(error?.status) < 600) ||
  AMBIGUOUS_TEXT.test(`${error?.code ?? ''} ${error?.message ?? ''}`);

/** Rate-limit and flood answers: a whole batch stops on one. */
export const isRateLimit = (error) =>
  ['flood-wait', 'rate-limited', 'too-many-requests'].includes(error?.code) ||
  Number(error?.status) === 429 ||
  /\b429\b|rate.?limit|flood/i.test(
    String(error?.message ?? error?.error ?? '')
  );

/** A batch stops after this many failures in a row (R-Z3). */
export const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Why a batch must stop after this outcome, or null: a rate limit, a send
 * in doubt, or too many failures in a row.
 */
export const batchStopReason = (
  outcome,
  failures,
  max = MAX_CONSECUTIVE_FAILURES
) => {
  if (outcome.status === 'sent') {
    return null;
  }
  if (isRateLimit(outcome)) {
    return 'flood-wait';
  }
  if (outcome.status === 'unknown') {
    return 'unknown-send';
  }
  return failures >= max ? 'too-many-failures' : null;
};

const inflightOf = new WeakMap();
const inflight = (store) => {
  if (!inflightOf.has(store)) {
    inflightOf.set(store, new Set());
  }
  return inflightOf.get(store);
};

const settle = async (store, record, patch, log) => {
  const next = { ...record, ...patch };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await store.put(next);
      return next;
    } catch (error) {
      log({
        event: 'outbox_write_failed',
        id: record.id,
        error: error.message,
      });
    }
  }
  return next;
};

const refused = (code, error, extra = {}) => ({
  status: 'failed',
  code,
  error,
  ...extra,
});

// Why this send must not start: the opt-out list, or an earlier send under
// the same key that went out, is going out, or may have gone out.
const refusal = (before, id, running, rules, draft) => {
  if (optOutEntry(rules, draft)) {
    return refused('opted-out', 'this chat is on the opt-out list');
  }
  if (!running.has(id) && !BLOCKING.has(before?.status)) {
    return null;
  }
  const doubt = before?.status === 'unknown' || before?.status === 'sending';
  return refused(
    doubt ? 'send-in-doubt' : 'already-sent',
    doubt
      ? 'an earlier send may have gone out; check the chat and decide'
      : 'this message was already sent',
    { outbox: before ?? null }
  );
};

const newRecord = ({ id, key, kind, owner, draft, at }) => ({
  id,
  tokens: ['outbox', kind, String(draft.source)],
  kind,
  key,
  owner: String(owner),
  source: draft.source,
  chat: draft.chat === undefined ? null : String(draft.chat),
  contact: draft.contact ?? null,
  text: String(draft.text ?? '').slice(0, 2000),
  status: 'sending',
  createdAt: at,
  at,
});

/**
 * Send one message once. `send(draft)` is the network call; `draft` has
 * `source`, `chat`, `text` (and `contact`). Returns
 * `{ status: 'sent' | 'failed' | 'unknown', outbox, result?, error?, code? }`.
 */
export const guardedSend = async ({
  store,
  kind = 'automation',
  owner = kind,
  key = null,
  draft,
  send,
  settings = null,
  // The user pressed Send on this very message. Anything else is an
  // automated send and carries `automated: true` to the sender, which
  // refuses WhatsApp Web for it (R-Z9).
  userConfirmed = false,
  clock = () => new Date(),
  log = () => {},
}) => {
  const useKey =
    key ??
    outboxKey({
      owner,
      source: draft.source,
      chat: draft.chat,
      text: draft.text,
      now: clock().getTime(),
    });
  const id = outboxId(useKey);
  const running = inflight(store);
  const stop = refusal(
    await store.get(id),
    id,
    running,
    settings ?? (await loadSettings(store)),
    draft
  );
  if (stop) {
    return stop;
  }
  running.add(id);
  try {
    const record = newRecord({
      id,
      key: useKey,
      kind,
      owner,
      draft,
      at: clock().toISOString(),
    });
    try {
      await store.put(record);
    } catch (error) {
      return refused('outbox-unavailable', `not sent: ${error.message}`);
    }
    return await deliverOnce({
      store,
      record,
      draft: { ...draft, automated: !userConfirmed },
      send,
      clock,
      log,
    });
  } finally {
    running.delete(id);
  }
};

const deliverOnce = async ({ store, record, draft, send, clock, log }) => {
  let result;
  try {
    result = await send({ clientId: record.key, ...draft });
  } catch (error) {
    const status = isAmbiguous(error) ? 'unknown' : 'failed';
    const message = safeMessage(error); // no token in the outbox (R-Z2)
    const outbox = await settle(
      store,
      record,
      {
        status,
        at: clock().toISOString(),
        error: message,
        ...(error.code ? { code: error.code } : {}),
      },
      log
    );
    return {
      status,
      outbox,
      error: message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    };
  }
  // The message is out: whatever the store does now, it stays "sent".
  const outbox = await settle(
    store,
    record,
    {
      status: 'sent',
      at: clock().toISOString(),
      ...(result?.via ? { via: result.via } : {}),
    },
    log
  );
  return { status: 'sent', outbox, result };
};

const outboxLinks = async (store) =>
  store.query((l) => l?.id?.startsWith(OUTBOX_PREFIX));

/** After a restart: a send that never finished may have gone out. */
export const recoverOutbox = async (
  store,
  { clock = () => new Date() } = {}
) => {
  const stuck = (await outboxLinks(store)).filter(
    (l) => l.status === 'sending'
  );
  for (const link of stuck) {
    await store.put({
      ...link,
      status: 'unknown',
      error: 'interrupted before the answer was recorded',
      recoveredAt: clock().toISOString(),
    });
  }
  return stuck.length;
};

/** Newest first; `status` narrows. */
export const listOutbox = async (store, { status = null } = {}) =>
  (await outboxLinks(store))
    .filter((l) => !status || l.status === status)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

/** The user's decision about an unknown send: it arrived, or it did not. */
export const resolveOutbox = async (
  store,
  id,
  decision,
  { clock = () => new Date() } = {}
) => {
  const link = await store.get(id);
  if (!link?.id?.startsWith(OUTBOX_PREFIX)) {
    throw new Error(`no outbox record ${id}`);
  }
  if (link.status !== 'unknown' || !['sent', 'failed'].includes(decision)) {
    throw new Error('only an unknown send can be settled, as sent or failed');
  }
  const next = {
    ...link,
    status: decision,
    resolvedBy: 'user',
    at: clock().toISOString(),
  };
  await store.put(next);
  return next;
};

/** A throwaway store for a call that was given none: still once per call. */
export const transientStore = () => {
  const links = new Map();
  return {
    get: async (id) => links.get(id) ?? null,
    put: async (link) => {
      links.set(link.id, link);
      return link;
    },
    query: async (filter = () => true) => [...links.values()].filter(filter),
  };
};

/**
 * One send per chat within the last day, from the cooldown ledger (run
 * records) and the outbox (including `sending` and `unknown`): the
 * daily cap counts them both, once. `[{ key, ms }]`.
 */
export const recentSends = (links, owner, now, runPrefix) => {
  const found = new Map();
  for (const l of links) {
    const id = l?.id ?? '';
    const mine =
      (id.startsWith(runPrefix) && l.status === 'sent') ||
      (id.startsWith(OUTBOX_PREFIX) &&
        l.owner === owner &&
        BLOCKING.has(l.status));
    const ms = Date.parse(l?.at);
    if (mine && now - ms < DAY_MS) {
      const key = `${l.source}:${l.chat}`;
      found.set(key, Math.min(found.get(key) ?? ms, ms));
    }
  }
  return [...found.entries()].map(([key, ms]) => ({ key, ms }));
};
