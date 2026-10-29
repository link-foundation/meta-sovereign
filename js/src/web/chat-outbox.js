import { getLocalStorage } from '../storage/local-storage.js';

// The composer's outbox, without React: what happens to a message after
// Send, as Telegram, Signal and Element do it (docs/CHAT-REFERENCES.md,
// "Sending exactly once" and "Failures and retries"):
//
//   - a chat's messages leave one at a time, in the order typed;
//   - a failure that passes by itself (no answer from the server, a
//     network error, Telegram's "wait N seconds") is tried again with the
//     same clientId — 1 s, then doubling up to 60 s; a flood wait waits
//     exactly as long as Telegram asked. Later messages of that chat wait
//     behind it, so the order holds (Signal's job queue);
//   - a failure that does not pass by itself (no right to write, unknown
//     chat, too long) stops there and needs the user: the messages queued
//     behind it fail too, "not sent because the one before failed"
//     (Matrix's cascade), and Resend all sends them again in order;
//   - the outbox and the drafts are saved in the browser, so a reload
//     resumes the queue with the same clientIds (the server and Telegram
//     drop a repeat) and keeps what was typed.

import { isConnectionFailure } from './request-policy.js';

export const OUTBOX_KEY = 'metaSovereignOutbox';
export const DRAFTS_KEY = 'metaSovereignDrafts';

const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 60_000;
// A failure without a known cause may be lasting; try a few times only.
const SEND_FAILED_TRIES = 4;
// Telegram can ask to wait for hours; past this the user decides.
const MAX_FLOOD_WAIT_S = 300;

/** The wait before try number `attempts + 1`: 1 s, 2 s, 4 s … 60 s. */
export const retryDelay = (attempts) =>
  Math.min(FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_MS);

const failed = (item, result, code = result.code ?? null) => ({
  ...item,
  status: 'failed',
  error: result.error ?? code ?? 'failed',
  code,
  retryAfter: result.retryAfter ?? null,
  retryAt: null,
});

const waiting = (item, result, attempts, retryAt) => ({
  ...item,
  status: 'waiting',
  attempts,
  retryAt,
  error: result.error ?? result.code ?? null,
  code: result.code ?? null,
  retryAfter: result.retryAfter ?? null,
});

/**
 * One failed send's next state: `waiting` (with `retryAt`) when it will
 * be tried again by itself, `failed` when the user has to decide.
 */
export const afterFailure = (item, result, now = Date.now()) => {
  const attempts = (item.attempts ?? 0) + 1;
  const code = result?.code ?? null;
  if (code === 'flood-wait') {
    const seconds = Number(result.retryAfter) || 1;
    return seconds > MAX_FLOOD_WAIT_S
      ? failed(item, result)
      : waiting(item, result, attempts, now + (seconds + 1) * 1000);
  }
  if (isConnectionFailure(code)) {
    return waiting(item, result, attempts, now + retryDelay(attempts));
  }
  if (code === 'send-failed' && attempts < SEND_FAILED_TRIES) {
    return waiting(item, result, attempts, now + retryDelay(attempts));
  }
  return failed(item, result ?? {});
};

/** A failure that waits only for the network (tried again when online). */
export const waitsForNetwork = (item) =>
  item.status === 'waiting' && isConnectionFailure(item.code);

/**
 * The messages queued behind a failed one fail with it (Matrix): they
 * would otherwise go out of order. Waiting ones are left as they are.
 */
export const cascade = (items, failedItem) => {
  const at = items.findIndex((p) => p.clientId === failedItem.clientId);
  return items.map((p, index) =>
    index > at && p.key === failedItem.key && p.status === 'queued'
      ? failed(
          p,
          { error: 'the message before it was not sent' },
          'after-failure'
        )
      : p
  );
};

/**
 * What a chat's queue does now: nothing (a message is going out, or
 * there is nothing to send), `{ item }` to send, or `{ wait }` ms until
 * the first one may be tried again.
 */
export const nextToSend = (items, key, now = Date.now()) => {
  const chat = items.filter((p) => p.key === key);
  if (chat.some((p) => p.status === 'sending')) {
    return null;
  }
  const head = chat.find(
    (p) => p.status === 'queued' || p.status === 'waiting'
  );
  if (!head) {
    return null;
  }
  if (head.status === 'waiting' && head.retryAt > now) {
    return { wait: head.retryAt - now };
  }
  return { item: head };
};

/** Failed messages of a chat, queued again in their order. */
export const requeueFailed = (items, key) =>
  items.map((p) =>
    p.key === key && p.status === 'failed'
      ? {
          ...p,
          status: 'queued',
          attempts: 0,
          error: null,
          code: null,
          retryAfter: null,
          retryAt: null,
        }
      : p
  );

const OUTBOX_FIELDS = ['clientId', 'key', 'source', 'chat', 'text', 'at'];

/**
 * A saved outbox, as the composer resumes it: one that was going out
 * when the page closed is queued again (the same clientId, so it is not
 * posted twice); malformed entries are dropped.
 */
export const restoreOutbox = (saved) =>
  (Array.isArray(saved) ? saved : [])
    .filter(
      (p) => p && OUTBOX_FIELDS.every((f) => typeof p[f] === 'string' && p[f])
    )
    .map((p) => (p.status === 'sending' ? { ...p, status: 'queued' } : p))
    .filter((p) => ['queued', 'waiting', 'failed'].includes(p.status));

const storageOf = (storage) => {
  try {
    return storage ?? getLocalStorage() ?? null;
  } catch {
    return null; // storage blocked (private window, site data off)
  }
};

/** A JSON value from the browser's storage, or `fallback`. */
export const readSaved = (key, fallback, storage) => {
  try {
    const raw = storageOf(storage)?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

/** Save a JSON value; false when the browser keeps nothing. */
export const writeSaved = (key, value, storage) => {
  try {
    const target = storageOf(storage);
    if (!target) {
      return false;
    }
    target.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/** Drafts worth keeping: non-empty text by chat key. */
export const keptDrafts = (drafts = {}) =>
  Object.fromEntries(
    Object.entries(drafts).filter(
      ([key, text]) => typeof text === 'string' && text.trim() && key
    )
  );
