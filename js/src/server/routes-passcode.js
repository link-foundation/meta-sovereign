// The local passcode's routes and its gate (R-Y183; learned from Telegram
// Desktop, never copied). ./passcode.js keeps the salted scrypt hash and
// the rate limit; nothing here logs or returns a passcode.
//
// Its routes:
//   GET  /api/passcode/status  -> { enabled, locked, autoLockMinutes,
//                                 retryAfterMs }  (open while locked)
//   POST /api/passcode/unlock {passcode} -> { ok: true }, or 401 { ok:
//                                 false, code: 'wrong', retryAfterMs }, or
//                                 429 { code: 'rate-limited', retryAfterMs }
//                                 (open while locked)
//   POST /api/passcode/lock    -> { ok } locks at once (Ctrl+L, auto-lock)
//   POST /api/passcode/set {passcode, current?} -> { ok } turns the passcode
//                                 on, or changes it (then `current` is asked)
//   POST /api/passcode/remove {passcode} -> { ok } turns it off
//   POST /api/passcode/auto-lock {minutes} -> { ok, autoLockMinutes } with
//                                 0, 1, 5, 60 or 300 (0 = off)
//
// The gate: while a passcode is set and the server is locked, every request
// except the page's own files and the status and unlock routes is refused
// with 423 { code: 'locked' }; open event streams end and the sync sockets
// are refused. With no passcode set (the default) nothing is locked.
//
// Locked out? Remove the stored hash from a terminal, with the server
// running or not:
//   meta-sovereign passcode --clear [--store=<dir>]
// (or delete `<store>/passcode.json`). The hash is a salted scrypt digest,
// so it cannot be turned back into the passcode.

import { json, readBody } from './util.js';
import { AUTO_LOCK_MINUTES, PASSCODE_MAX } from './passcode.js';

const OPEN_WHILE_LOCKED = new Set([
  '/api/passcode/status',
  '/api/passcode/unlock',
]);

const passcodeOk = (v, min = 1) =>
  typeof v === 'string' && v.length >= min && v.length <= PASSCODE_MAX;

const refuse = (res) =>
  json(res, 423, {
    service: 'meta-sovereign',
    error: 'locked',
    code: 'locked',
  }) ?? true;

const bad = (res, error) => json(res, 400, { error, code: 'bad-request' });

// A refused passcode as a status: 401 wrong, 429 waiting.
const answer = (res, result) =>
  json(
    res,
    result.ok ? 200 : result.code === 'rate-limited' ? 429 : 401,
    result
  );

const ACTIONS = {
  unlock: (lock, body, res) =>
    passcodeOk(body.passcode, 0)
      ? lock.unlock(body.passcode).then((r) => answer(res, r))
      : bad(res, 'passcode must be text'),
  lock: (lock, _body, res) => json(res, 200, { ok: lock.lock() }),
  set: (lock, body, res) =>
    !passcodeOk(body.passcode) ||
    (body.current !== undefined && !passcodeOk(body.current, 0))
      ? bad(res, 'a passcode of 1 to 256 characters is needed')
      : lock.set(body).then((r) => answer(res, r)),
  remove: (lock, body, res) =>
    passcodeOk(body.passcode, 0)
      ? lock.remove(body.passcode).then((r) => answer(res, r))
      : bad(res, 'the current passcode is needed'),
  'auto-lock': (lock, body, res) =>
    AUTO_LOCK_MINUTES.includes(body.minutes)
      ? json(res, 200, lock.setAutoLock(body.minutes))
      : bad(res, 'minutes must be one of 0, 1, 5, 60, 300'),
};

/** The passcode routes; false for any other path. */
export const handlePasscodeRoutes = async (req, res, p, ctx) => {
  const lock = ctx.passcode;
  if (!p.startsWith('/api/passcode/') || !lock) {
    return false;
  }
  if (p === '/api/passcode/status' && req.method === 'GET') {
    json(res, 200, lock.status());
    return true;
  }
  const action = ACTIONS[p.slice('/api/passcode/'.length)];
  if (!action || req.method !== 'POST') {
    return false;
  }
  if (lock.locked() && p !== '/api/passcode/unlock') {
    return refuse(res);
  }
  let body;
  try {
    body = await readBody(req);
  } catch {
    bad(res, 'invalid JSON');
    return true;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    bad(res, 'a JSON object is needed');
    return true;
  }
  await action(lock, body, res);
  return true;
};

/**
 * The gate: true when the request was refused because the server is locked.
 * Run it after the page's own files are served and before any other route.
 */
export const gateLocked = (res, p, ctx) => {
  if (!ctx.passcode?.locked() || OPEN_WHILE_LOCKED.has(p)) {
    return false;
  }
  return refuse(res);
};
