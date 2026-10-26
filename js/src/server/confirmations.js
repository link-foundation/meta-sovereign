/**
 * Explicit confirmation for every write to a third-party service.
 *
 * Reading (pulling messages, contacts, exports) happens as needed, but
 * nothing is sent, posted, published or changed on another service
 * unless the user confirmed that exact action. Each such route works in
 * two requests:
 *
 *   1. without `confirmToken` it does nothing and answers
 *      `428 Precondition Required` with a preview of what would happen
 *      and a single-use token bound to exactly that request body;
 *   2. the app shows the preview, asks the user, and repeats the request
 *      with `confirmToken`. A token works once, for that body only, and
 *      expires after five minutes.
 *
 * Store writes (sync, `PUT /links`) never trigger a send by themselves.
 */

import { createHash, randomBytes } from 'node:crypto';
import { json } from './util.js';

export const CONFIRM_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 500;

// Key order must not matter: the app may rebuild the body.
const stable = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

/** The body without the token itself. */
export const withoutToken = (body = {}) => {
  const { confirmToken: _token, ...rest } = body ?? {};
  return rest;
};

export const createConfirmations = ({
  ttlMs = CONFIRM_TTL_MS,
  now = () => Date.now(),
  maxPending = MAX_PENDING,
} = {}) => {
  const pending = new Map();
  const digest = (action, payload) =>
    createHash('sha256')
      .update(`${action}\u0000${stable(payload)}`)
      .digest('hex');
  const prune = () => {
    const at = now();
    for (const [token, entry] of pending) {
      if (entry.expires <= at || pending.size >= maxPending) {
        pending.delete(token);
      }
    }
  };
  return {
    /** `data` (e.g. the previewed plan) comes back from consume(). */
    issue(action, payload, data = null) {
      prune();
      const token = randomBytes(18).toString('base64url');
      const expires = now() + ttlMs;
      pending.set(token, { digest: digest(action, payload), expires, data });
      return { token, expiresAt: new Date(expires).toISOString() };
    },
    /** `{data}` once for a live token issued for this action+payload. */
    consume(token, action, payload) {
      const entry = typeof token === 'string' ? pending.get(token) : null;
      if (!entry) {
        return null;
      }
      pending.delete(token);
      const valid =
        entry.expires > now() && entry.digest === digest(action, payload);
      return valid ? { data: entry.data } : null;
    },
  };
};

/**
 * Route guard. With a valid token for `action` it resolves to
 * `{data}` — whatever `prepare()` returned as `data` when the preview
 * was made, so the route performs exactly what the user saw. Otherwise
 * it calls `prepare()` (→ `{preview, data}`), answers 428 with the
 * preview and a fresh token, and resolves to null: the route must stop.
 */
export const confirmed = async (ctx, res, { action, body, prepare }) => {
  ctx.confirmations ??= createConfirmations();
  const payload = withoutToken(body);
  const accepted = body?.confirmToken
    ? ctx.confirmations.consume(body.confirmToken, action, payload)
    : null;
  if (accepted) {
    return accepted;
  }
  const { preview = null, data = null } = (await prepare?.()) ?? {};
  json(res, 428, {
    needsConfirmation: true,
    action,
    preview,
    confirm: ctx.confirmations.issue(action, payload, data),
    ...(body?.confirmToken
      ? { error: 'the confirmation expired or does not match this request' }
      : {}),
  });
  return null;
};

/**
 * A preview can carry the token for the write it previews, so the
 * user confirms what is on screen without another (slow) round trip:
 * the follow-up must repeat `payload` exactly and add `confirmToken`.
 */
export const offerConfirmation = (ctx, action, payload, data = null) => {
  ctx.confirmations ??= createConfirmations();
  return ctx.confirmations.issue(action, withoutToken(payload), data);
};
