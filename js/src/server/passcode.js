// The local passcode (R-Y183; learned from Telegram Desktop, never copied).
//
// A passcode keeps the page behind a lock screen. Only a salted, slow hash
// (scrypt with a random salt) is ever stored — in `<store>/passcode.json`,
// mode 0600 — never the passcode itself, and nothing here logs a passcode.
// Whether the server is unlocked lives in this process's memory only, so a
// restart locks again. A wrong passcode is rate limited: from the second
// miss in a row each try waits twice as long as the one before (up to a
// minute), and a try made inside that wait is not even checked.
//
// A stored hash can always be removed from a terminal:
// `meta-sovereign passcode --clear [--store=<dir>]` (see ../cli/index.js).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { renameDurableSync } from '../storage/durable.js';

export const PASSCODE_MAX = 256;
/** The idle periods of the auto-lock in minutes; 0 is off. */
export const AUTO_LOCK_MINUTES = Object.freeze([0, 1, 5, 60, 300]);
export const PASSCODE_FILE = 'passcode.json';

const COST = Object.freeze({ N: 16384, r: 8, p: 1 });
const KEY_BYTES = 32;
const MAX_DELAY_MS = 60_000;

const scrypt = (passcode, salt, cost) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(
      String(passcode),
      salt,
      KEY_BYTES,
      { N: cost.N, r: cost.r, p: cost.p, maxmem: 128 * cost.N * cost.r * 2 },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });

/** A record to store for `passcode`: salt and hash, never the passcode. */
export const hashPasscode = async (passcode, cost = COST) => {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(passcode, salt, cost);
  return {
    algo: 'scrypt',
    N: cost.N,
    r: cost.r,
    p: cost.p,
    salt: salt.toString('base64'),
    hash: key.toString('base64'),
  };
};

/** Whether `passcode` is the one `record` was made from. */
export const verifyPasscode = async (record, passcode) => {
  if (
    record?.algo !== 'scrypt' ||
    typeof passcode !== 'string' ||
    typeof record.salt !== 'string' ||
    typeof record.hash !== 'string'
  ) {
    return false;
  }
  const want = Buffer.from(record.hash, 'base64');
  const got = await scrypt(
    passcode,
    Buffer.from(record.salt, 'base64'),
    record
  );
  return want.length === got.length && crypto.timingSafeEqual(want, got);
};

/** How long the n-th wrong passcode in a row makes the next try wait. */
export const delayAfter = (misses) =>
  misses < 2 ? 0 : Math.min(MAX_DELAY_MS, 1000 * 2 ** (misses - 2));

const validRecord = (data) =>
  data &&
  data.record?.algo === 'scrypt' &&
  typeof data.record.salt === 'string' &&
  typeof data.record.hash === 'string';

/** Remove a store's passcode (the CLI's way out); whether one was there. */
export const clearPasscode = (storeDir) => {
  try {
    fs.unlinkSync(path.join(storeDir, PASSCODE_FILE));
    return true;
  } catch {
    return false;
  }
};

/**
 * The lock of one server: `{ enabled, locked, status, unlock, lock, set,
 * remove, setAutoLock, onLock }`. `dir` is the store directory; with none
 * there is no passcode at all.
 */
export const createPasscodeLock = ({
  dir,
  now = Date.now,
  cost = COST,
} = {}) => {
  const file = dir ? path.join(dir, PASSCODE_FILE) : null;
  let cache = { stamp: null, data: null };
  let unlocked = false;
  let misses = 0;
  let waitUntil = 0;
  const listeners = new Set();

  // The file is looked at on every call, so a `passcode --clear` made in a
  // terminal takes effect at once, without a restart.
  const load = (stamp) => {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      cache = { stamp, data: validRecord(parsed) ? parsed : null };
    } catch {
      cache = { stamp, data: null };
    }
  };
  const read = () => {
    if (!file) {
      return null;
    }
    try {
      const st = fs.statSync(file);
      const stamp = `${st.mtimeMs}:${st.size}`;
      if (stamp !== cache.stamp) {
        load(stamp);
      }
    } catch {
      cache = { stamp: null, data: null };
    }
    return cache.data;
  };

  const write = (data) => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    try {
      renameDurableSync(tmp, file);
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      throw error;
    }
    cache = { stamp: null, data: null };
  };

  const enabled = () => read() !== null;
  const locked = () => enabled() && !unlocked;
  const retryAfterMs = () => Math.max(0, waitUntil - now());

  const status = () => ({
    enabled: enabled(),
    locked: locked(),
    autoLockMinutes: read()?.autoLockMinutes ?? 0,
    retryAfterMs: retryAfterMs(),
  });

  // The shared test of a passcode: rate limited, counting the misses.
  const check = async (passcode) => {
    const data = read();
    if (!data) {
      return { ok: false, code: 'not-set' };
    }
    if (retryAfterMs() > 0) {
      return { ok: false, code: 'rate-limited', retryAfterMs: retryAfterMs() };
    }
    if (await verifyPasscode(data.record, passcode)) {
      misses = 0;
      waitUntil = 0;
      return { ok: true };
    }
    misses += 1;
    waitUntil = now() + delayAfter(misses);
    return { ok: false, code: 'wrong', retryAfterMs: retryAfterMs() };
  };

  const lock = () => {
    if (!enabled()) {
      return false;
    }
    unlocked = false;
    for (const listener of listeners) {
      listener();
    }
    return true;
  };

  return {
    enabled,
    locked,
    status,
    lock,
    // `fn` runs whenever the lock closes (open streams end).
    onLock: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    unlock: async (passcode) => {
      const result = await check(passcode);
      unlocked = unlocked || result.ok;
      return result;
    },
    // Turn on (nothing set yet) or change (`current` asked for first).
    set: async ({ passcode, current }) => {
      if (!file) {
        return { ok: false, code: 'no-store' };
      }
      const data = read();
      if (data) {
        const proof = await check(current);
        if (!proof.ok) {
          return proof;
        }
      }
      write({
        record: await hashPasscode(passcode, cost),
        autoLockMinutes: data?.autoLockMinutes ?? 0,
      });
      unlocked = true;
      return { ok: true };
    },
    remove: async (passcode) => {
      const proof = await check(passcode);
      if (proof.ok) {
        clearPasscode(dir);
        unlocked = false;
      }
      return proof;
    },
    setAutoLock: (minutes) => {
      const data = read();
      if (!data) {
        return { ok: false, code: 'not-set' };
      }
      write({ ...data, autoLockMinutes: minutes });
      return { ok: true, autoLockMinutes: minutes };
    },
  };
};
