/**
 * POST /api/client-log — what went wrong in the page, in the server's log
 * file, next to what the server did: a script error, a promise nobody
 * caught, a request that failed, an image that would not load.
 *
 *   body: { level, event, error?, stack?, view?, …numbers and flags }
 *
 * Only the shape of a problem is kept, never what the user reads: the
 * fields are an allow-list, strings are cut short, only numbers and
 * flags pass besides them. A page floods nothing — sixty entries a
 * minute at most — and other sites' pages may not write (an Origin
 * outside the allow-list is refused).
 */

import { classifyOrigin } from './cors.js';
import { json } from './util.js';

const LEVELS = new Set(['error', 'warn', 'info', 'debug']);
const EVENT = /^[a-z][a-z0-9_]{0,59}$/;
const KEY = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const MAX_BODY = 16 * 1024;
const PER_MINUTE = 60;
const STACK_LINES = 8;
const IDENTIFIERS = [
  'automation',
  'source',
  'chat',
  'clientId',
  'reason',
  'from',
  'to',
  'code',
];
const identifiersOf = (body) =>
  Object.fromEntries(
    IDENTIFIERS.filter(
      (key) =>
        typeof body[key] === 'string' &&
        /^[a-zA-Z0-9_.:+-]{1,100}$/.test(body[key])
    ).map((key) => [key, body[key]])
  );

const cut = (value, size) =>
  typeof value === 'string' && value ? value.slice(0, size) : null;

// A stack's frames, without the page's origin: where in our code.
const stackOf = (stack) =>
  cut(stack, 4000)
    ?.split('\n')
    .slice(0, STACK_LINES)
    .map((line) => line.replace(/https?:\/\/[^/\s)]+/g, '').slice(0, 200))
    .join('\n') ?? null;

// Numbers and flags the page counted (sizes, durations, counts).
const countsOf = (body) =>
  Object.fromEntries(
    Object.entries(body).filter(
      ([key, value]) =>
        KEY.test(key) &&
        (typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value)))
    )
  );

/** The entry to log for a page's report, or null when it is not one. */
export const clientEntry = (body) => {
  if (!body || typeof body !== 'object' || !EVENT.test(body.event ?? '')) {
    return null;
  }
  return {
    ...countsOf(body),
    ...identifiersOf(body),
    level: LEVELS.has(body.level) ? body.level : 'info',
    event: `client_${body.event}`,
    error: cut(body.error, 300),
    stack: stackOf(body.stack),
    view: cut(body.view, 40),
  };
};

const readLimited = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        resolve(
          size <= MAX_BODY ? JSON.parse(Buffer.concat(chunks).toString()) : null
        );
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });

export const createClientLogRoute = ({ now = Date.now } = {}) => {
  let windowStart = 0;
  let used = 0;
  const allowed = () => {
    if (now() - windowStart >= 60_000) {
      windowStart = now();
      used = 0;
    }
    used += 1;
    return used <= PER_MINUTE;
  };
  return async (req, res, p, ctx) => {
    if (p !== '/api/client-log' || req.method !== 'POST') {
      return false;
    }
    if (classifyOrigin(req, ctx.allowOrigins ?? []) === 'denied') {
      return json(res, 403, { error: 'origin not allowed' }) ?? true;
    }
    const entry = clientEntry(await readLimited(req));
    if (!entry) {
      return json(res, 400, { error: 'not a client log entry' }) ?? true;
    }
    if (!allowed()) {
      return json(res, 429, { error: 'too many entries' }) ?? true;
    }
    ctx.log?.(entry);
    res.writeHead(204);
    res.end();
    return true;
  };
};
