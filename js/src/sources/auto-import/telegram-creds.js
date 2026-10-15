/**
 * Find the Telegram sign-ins the user already has on this computer.
 *
 * People who experiment with Telegram scatter their own credentials across
 * repositories: the same bot token in a dozen project `.env` files, a GramJS
 * user "string session" saved beside another (konard/telegram-bot writes it
 * to `.telegram_session`), an `api_id`/`api_hash`/phone trio in a third.
 * This module walks folders the user chooses and distils them down to the
 * few real accounts behind them, so the account can be connected here
 * without hunting for them again.
 *
 *   scan({ roots })  read-only walk of the chosen folders. The same token or
 *                    session found in many files collapses to ONE entry
 *                    (every location kept for display). Each distinct
 *                    credential is checked LIVE — bot tokens via the Bot API
 *                    `getMe`, user sessions via MTProto — so only accounts
 *                    that still work are listed, and a user session resolves
 *                    to its real phone number. Entries are grouped by the
 *                    account they belong to and typed: a bot token, a login
 *                    by session, or a login by phone & password.
 *   use(id, {store}) connect the chosen credential — store it under the
 *                    `secret:telegram:*` keys the app already reads. A
 *                    phone & password credential has no stored session yet,
 *                    so `use` reports `needsLogin` and the caller starts the
 *                    interactive sign-in with `loginContext(id)`.
 *
 * Everything stays on this computer: raw values live in an owner-only file
 * (0600) until the user connects one, and are never logged or returned to
 * the browser — callers see types, locations and masked hints only.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const statusError = (message, status) =>
  Object.assign(new Error(message), { status });

// Folders worth scanning by default: the common roots where repositories
// live, plus the current working directory, filtered to those that exist.
export const defaultRoots = async ({
  homeDir = os.homedir(),
  cwd = process.cwd(),
} = {}) => {
  const candidates = [
    cwd,
    ...[
      'Code',
      'code',
      'projects',
      'dev',
      'src',
      'work',
      'repos',
      'github',
    ].map((name) => path.join(homeDir, name)),
  ];
  const existing = [];
  const seen = new Set();
  for (const dir of candidates) {
    try {
      if (!(await fs.stat(dir)).isDirectory()) {
        continue;
      }
      // Dedupe by real path: on a case-insensitive macOS filesystem
      // `~/Code` and `~/code` are the same directory, so scanning both
      // would walk the whole tree twice.
      const real = await fs.realpath(dir);
      if (!seen.has(real)) {
        seen.add(real);
        existing.push(dir);
      }
    } catch {
      // not there — skip.
    }
  }
  return existing;
};

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.Trash',
  'Library',
  'vendor',
  'dist',
  'build',
  '.cache',
  // Heavy build / dependency / virtualenv trees that never hold a
  // hand-written .env, skipped so the walk stays fast.
  'target',
  'venv',
  '.venv',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
  '.pytest_cache',
  '.gradle',
  'Pods',
  'DerivedData',
]);

// `.env.example`, `.env.template`, `.env.sample`, `.env.dist` hold
// placeholders, never real secrets — ignore them.
const isTemplateEnv = (name) => /\.(example|sample|template|dist)$/i.test(name);

const isEnvFile = (name) =>
  !isTemplateEnv(name) &&
  (name === '.env' ||
    name === '.lenv' ||
    name.endsWith('.env') ||
    name.endsWith('.lenv') ||
    /^\.env\./i.test(name));

// Files that hold a saved user session string (konard/telegram-bot writes
// `.telegram_session`; Telethon writes a `*.session` SQLite file).
const isSessionFile = (name) =>
  name === '.telegram_session' ||
  name.endsWith('.telegram_session') ||
  name.endsWith('.tgsession') ||
  /string[_-]?session/i.test(name);

const isTelethonSession = (name) => /\.session$/i.test(name);

// A directory not worth descending into: a known heavy tree, or any
// dot-directory (.git, .github, .vscode, .venv, …) — project `.env` files
// live in ordinary folders, so skipping these keeps the walk fast.
const skipDir = (name) => SKIP_DIRS.has(name) || name.startsWith('.');

/** Walk `root`, breadth-capped, for env and session files. No reads yet. */
const walkFiles = async (root, { maxDepth = 5, limit = 4000 } = {}) => {
  const found = [];
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length && found.length < limit) {
    const { dir, depth } = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !skipDir(entry.name)) {
          queue.push({ dir: full, depth: depth + 1 });
        }
      } else if (
        isEnvFile(entry.name) ||
        isSessionFile(entry.name) ||
        isTelethonSession(entry.name)
      ) {
        found.push(full);
      }
    }
  }
  return found;
};

const BOT_TOKEN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
// A GramJS StringSession: one long line of base64url-ish characters.
const USER_SESSION = /^[A-Za-z0-9+/=_-]{40,}$/;

/** Last four characters, everything else hidden. Never more than that. */
export const maskHint = (value) => {
  const text = String(value ?? '');
  const tail = text.slice(-4);
  return tail ? `••••${tail}` : '••••';
};

// The digits of a phone number, as a stable grouping key (`+1 555…` and
// `15 55…` for the same line collapse). Never shown — only maskHint is.
const phoneKey = (phone) => String(phone ?? '').replace(/\D/g, '');

/** Parse `KEY=VALUE` lines from a `.env` / `.lenv` file. */
export const parseEnv = (text) => {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z0-9_.]+)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    out.push({ key: match[1], value });
  }
  return out;
};

const KEY_SESSION = /session/i;
const KEY_API_ID = /api[_-]?id$/i;
const KEY_API_HASH = /api[_-]?hash$/i;
const KEY_PHONE = /phone/i;

// A shell reference or an obvious fill-me-in, not a real value:
// `${X}`, `$X`, `<...>`, or words like your/example/changeme/placeholder.
const isPlaceholder = (value) =>
  /\$\{|\$[A-Za-z]|[<>]|\b(your|example|changeme|placeholder|xxxx+|here|todo)\b/i.test(
    value
  );

// Classify one env field into a Telegram credential kind, or null. Bot
// tokens and sessions are accepted only when the VALUE has the real shape,
// so `.env` placeholders never look like credentials.
const classifyField = ({ key, value }) => {
  if (!value || isPlaceholder(value)) {
    return null;
  }
  if (BOT_TOKEN.test(value)) {
    return 'bot-token';
  }
  if (KEY_SESSION.test(key) && USER_SESSION.test(value)) {
    return 'user-session';
  }
  if (KEY_API_ID.test(key)) {
    return 'api-id';
  }
  if (KEY_API_HASH.test(key)) {
    return 'api-hash';
  }
  if (KEY_PHONE.test(key)) {
    return 'phone';
  }
  return null;
};

// The api_id / api_hash / phone that sit alongside a user session.
const apiContext = (fields) => {
  const pick = (kind) => fields.find((f) => f.kind === kind)?.value ?? null;
  return {
    apiId: pick('api-id'),
    apiHash: pick('api-hash'),
    phone: pick('phone'),
  };
};

const idForValue = (kind, value) =>
  crypto
    .createHash('sha1')
    .update(`${kind}\u0000${value}`)
    .digest('hex')
    .slice(0, 16);

const relativeTo = (roots, file) => {
  const root = roots.find((r) => file.startsWith(r));
  return root ? path.relative(path.dirname(root), file) : file;
};

// A field classifier bound to each field, then only the connectable kinds.
const envRecords = (file, roots, fields) => {
  const ctx = apiContext(fields);
  const records = [];
  for (const field of fields) {
    if (field.kind !== 'bot-token' && field.kind !== 'user-session') {
      continue;
    }
    records.push({
      kind: field.kind,
      source: file,
      where: relativeTo(roots, file),
      key: field.key,
      value: field.value,
      ...(field.kind === 'user-session' ? ctx : {}),
    });
  }
  // A bare api_id/api_hash/phone trio (no session beside it) is a
  // "sign in by phone & password" credential in its own right.
  if (ctx.apiId && ctx.apiHash && ctx.phone) {
    records.push({
      kind: 'user-password',
      source: file,
      where: relativeTo(roots, file),
      key: 'phone',
      value: null,
      ...ctx,
    });
  }
  return records;
};

// One env file -> zero or more credential records (with raw values).
const recordsFromEnv = async (file, roots) => {
  const fields = parseEnv(await fs.readFile(file, 'utf8'))
    .map((f) => ({ ...f, kind: classifyField(f) }))
    .filter((f) => f.kind);
  return envRecords(file, roots, fields);
};

// The api_id/api_hash/phone from the `.env` sitting next to a session file.
const siblingApiContext = async (file) => {
  try {
    const sibling = path.join(path.dirname(file), '.env');
    const fields = parseEnv(await fs.readFile(sibling, 'utf8')).map((f) => ({
      ...f,
      kind: classifyField(f),
    }));
    return apiContext(fields);
  } catch {
    return { apiId: null, apiHash: null, phone: null };
  }
};

// A saved session file (`.telegram_session`) -> one user-session record,
// paired with api_id/api_hash from a sibling `.env` when present.
const recordFromSession = async (file, roots) => {
  if (isTelethonSession(file)) {
    return {
      kind: 'telethon-session',
      source: file,
      where: relativeTo(roots, file),
      key: path.basename(file),
      value: null,
    };
  }
  const value = (await fs.readFile(file, 'utf8')).trim();
  if (!USER_SESSION.test(value)) {
    return null;
  }
  return {
    kind: 'user-session',
    source: file,
    where: relativeTo(roots, file),
    key: path.basename(file),
    value,
    ...(await siblingApiContext(file)),
  };
};

// Collapse records that are the same credential found in different files
// into ONE, keeping every location. A session or token repeated across a
// dozen repos becomes a single connectable entry. Distinct kinds keep
// distinct keys; connectables key on their value, phone-logins on the line.
const dedupeKey = (record) => {
  if (record.kind === 'user-password') {
    return `user-password\u0000${phoneKey(record.phone)}`;
  }
  if (record.kind === 'telethon-session') {
    return `telethon\u0000${record.source}`;
  }
  return `${record.kind}\u0000${record.value}`;
};

// Prefer the copy that carries the most context (api_id/api_hash/phone):
// any repo's `.env` may hold the token, but only some sit beside the trio
// needed to verify a session or to sign in by phone.
const richer = (a, b) => {
  const score = (r) =>
    (r.apiId ? 1 : 0) + (r.apiHash ? 1 : 0) + (r.phone ? 1 : 0);
  return score(b) > score(a) ? b : a;
};

const dedupeRecords = (records) => {
  const byKey = new Map();
  for (const record of records) {
    const key = dedupeKey(record);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...record, wheres: [record.where] });
      continue;
    }
    const merged = richer(existing, record);
    byKey.set(key, {
      ...merged,
      wheres: [...new Set([...existing.wheres, record.where])],
    });
  }
  // A phone-login is redundant when a working session for the same line is
  // present (the session is the stronger credential) — drop it so each
  // account shows "by session" OR "by phone & password", not a stray dup.
  const sessionPhones = new Set(
    [...byKey.values()]
      .filter((r) => r.kind === 'user-session' && r.phone)
      .map((r) => phoneKey(r.phone))
  );
  const kept = [...byKey.values()].filter(
    (r) => r.kind !== 'user-password' || !sessionPhones.has(phoneKey(r.phone))
  );
  for (const record of kept) {
    record.id = idForValue(record.kind, record.value ?? dedupeKey(record));
  }
  return kept;
};

// The credential type the UI groups by: a bot token, a login by session,
// or a login by phone & password.
const typeOf = (record) =>
  record.kind === 'bot-token'
    ? 'bot'
    : record.kind === 'user-password'
      ? 'user-password'
      : 'session';

// A record as the caller sees it: never the value, only a masked hint, the
// type, whether it is live, and every place it was found.
const publicEntry = (record) => ({
  id: record.id,
  kind: record.kind,
  type: typeOf(record),
  where: record.wheres?.[0] ?? record.where,
  wheres: record.wheres ?? [record.where],
  key: record.key,
  hint: record.value ? maskHint(record.value) : null,
  phone: record.phone ? maskHint(record.phone) : null,
  active: record.active ?? null,
  account: record.account ?? null,
});

// Walk the chosen folders and read every credential they hold.
const collectRecords = async (scanRoots) => {
  const files = (await Promise.all(scanRoots.map((r) => walkFiles(r)))).flat();
  const records = [];
  for (const file of files) {
    try {
      const base = path.basename(file);
      if (isSessionFile(base) || isTelethonSession(base)) {
        const record = await recordFromSession(file, scanRoots);
        if (record) {
          records.push(record);
        }
      } else {
        records.push(...(await recordsFromEnv(file, scanRoots)));
      }
    } catch {
      // unreadable file — skip it.
    }
  }
  return records;
};

// Give a slow or hung network check a hard deadline so one bad credential
// can never freeze the whole scan.
const withTimeout = (promise, ms) => {
  if (!ms) {
    return promise;
  }
  let timer;
  const guard = new Promise((_resolve, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error('timeout')), ms);
  });
  // Clear the timer whichever way the race ends, so a resolved check never
  // leaves a 12s timeout holding the event loop open.
  return Promise.race([promise, guard]).finally(() =>
    globalThis.clearTimeout(timer)
  );
};

// An error that means the credential is genuinely dead — Telegram answered
// and rejected it — as opposed to a network/timeout error that proves
// nothing. Only the former drops a credential from the list.
const deadError = (message) =>
  Object.assign(new Error(message), { dead: true });

const DEAD_SESSION =
  /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|AUTH_KEY_DUPLICATED|UNAUTHORIZED/i;

const isDeadError = (error) =>
  error?.dead === true ||
  DEAD_SESSION.test(
    error?.errorMessage ?? error?.className ?? error?.message ?? ''
  );

// Resolve a bot token to its account with the Bot API (no dependency). A
// reachable API that rejects the token is a dead credential; a network error
// is not (it rethrows untagged and the token is kept, unverified).
const identifyBot = async (value, fetchImpl) => {
  const res = await fetchImpl(`https://api.telegram.org/bot${value}/getMe`);
  const me = (await res.json())?.result;
  if (!me) {
    throw deadError('bot token rejected by Telegram');
  }
  return {
    kind: 'bot',
    key: `bot:${me.id}`,
    id: me.id,
    username: me.username ?? null,
    label: me.username ? `@${me.username}` : (me.first_name ?? `bot ${me.id}`),
    verified: true,
  };
};

// Resolve a user session via MTProto: connect with the paired
// api_id/api_hash and read the account, including its phone number.
const identifyUser = async (record, mtproto) => {
  const me = await mtproto({
    apiId: Number(record.apiId),
    apiHash: record.apiHash,
    session: record.value,
  }).then((client) => client.getMe());
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ');
  const phone = me.phone ?? (phoneKey(record.phone) || null);
  return {
    kind: 'user',
    key: `user:${me.id}`,
    id: me.id,
    username: me.username ?? null,
    phone,
    label: me.username ? `@${me.username}` : name || `user ${maskHint(phone)}`,
    verified: true,
  };
};

// The account a phone-login (api_id/api_hash/phone) belongs to, before any
// sign-in: known only by its phone number, so unverified.
const phoneAccount = (record) => ({
  kind: 'user',
  key: `phone:${phoneKey(record.phone)}`,
  id: null,
  username: null,
  phone: phoneKey(record.phone),
  label: `user ${maskHint(record.phone)}`,
  verified: false,
});

// A fallback account label from the file alone, when no live check ran.
const localAccount = (record) => {
  if (record.kind === 'bot-token') {
    return {
      kind: 'bot',
      key: `bot:${maskHint(record.value)}`,
      label: `bot token ${maskHint(record.value)}`,
      verified: false,
    };
  }
  const phone = record.phone ? maskHint(record.phone) : null;
  return {
    kind: 'user',
    key: phone ? `phone:${phoneKey(record.phone)}` : `session:${record.id}`,
    phone: phoneKey(record.phone),
    label: phone ? `user ${phone}` : 'user session',
    verified: false,
  };
};

// Check one credential live and attach its account + whether it works.
// A proven-dead credential (a token Telegram rejects, a revoked session)
// gets active=false; one we cannot check (a session with no api_id, or no
// MTProto client) stays active=null and is kept — we never hide a
// credential just because we could not reach the network.
const verifyRecord = async (record, { fetchImpl, mtproto, timeout }) => {
  try {
    if (record.kind === 'bot-token' && fetchImpl) {
      record.account = await withTimeout(
        identifyBot(record.value, fetchImpl),
        timeout
      );
      record.active = true;
    } else if (
      record.kind === 'user-session' &&
      mtproto &&
      record.apiId &&
      record.apiHash
    ) {
      record.account = await withTimeout(
        identifyUser(record, mtproto),
        timeout
      );
      record.phone = record.account.phone ?? record.phone;
      record.active = true;
    } else if (record.kind === 'user-password') {
      record.account = phoneAccount(record);
      record.active = null; // ready to sign in, not yet proven
    } else {
      record.account = localAccount(record);
      record.active = null; // could not check
    }
  } catch (error) {
    record.account = localAccount(record);
    // Only a credential Telegram actually rejected is dropped. A network or
    // timeout error proves nothing, so the credential is kept, unverified.
    record.active = isDeadError(error) ? false : null;
  }
  return record;
};

// After the live checks, fold every credential for one phone line into the
// same account: a verified session tells us the real @username and id for a
// phone, so a phone-login on that same number joins its group instead of
// sitting alone.
const mergeByPhone = (records) => {
  const verifiedByPhone = new Map();
  for (const record of records) {
    const phone = record.account?.verified && record.account.phone;
    if (phone) {
      verifiedByPhone.set(phoneKey(phone), record.account);
    }
  }
  for (const record of records) {
    const mine = phoneKey(record.phone);
    if (!record.account?.verified && mine && verifiedByPhone.has(mine)) {
      record.account = verifiedByPhone.get(mine);
    }
  }
  return records;
};

const accountView = (account) => ({
  kind: account.kind,
  label: account.label,
  verified: Boolean(account.verified),
  phone: account.phone ? maskHint(account.phone) : null,
});

// How good a credential is to keep when several of the same type belong to
// one account: a live one beats an unchecked one, a verified account beats a
// phone guess, and one with a session value and api context beats a bare one.
const rankRecord = (r) =>
  (r.active === true ? 8 : 0) +
  (r.account?.verified ? 4 : 0) +
  (r.value ? 2 : 0) +
  (r.apiId ? 1 : 0) +
  (r.apiHash ? 1 : 0);

// Merge two credentials of the same account and type into one: keep the
// stronger, but remember every place either was found.
const mergeRecords = (keep, extra) => {
  const best =
    rankRecord(extra) > rankRecord(keep) ? { ...extra } : { ...keep };
  best.wheres = [
    ...new Set([
      ...(keep.wheres ?? [keep.where]),
      ...(extra.wheres ?? [extra.where]),
    ]),
  ];
  return best;
};

// Group by account and collapse to ONE entry per type, so an account shows a
// single "login by session" (whichever session still works), a single bot
// token, and/or a single "login by phone & password" — never one row per
// file. Every location stays, listed on the entry it was merged into.
const groupRecords = (records) => {
  const groups = new Map();
  for (const record of records) {
    const account = record.account ?? localAccount(record);
    if (!groups.has(account.key)) {
      groups.set(account.key, { account, byType: new Map() });
    }
    const byType = groups.get(account.key).byType;
    const type = typeOf(record);
    byType.set(
      type,
      byType.has(type) ? mergeRecords(byType.get(type), record) : record
    );
  }
  return [...groups.values()].map(({ account, byType }) => ({
    account: accountView(account),
    entries: [...byType.values()].map(publicEntry),
  }));
};

// The `secret:telegram:*` links to write for a connected credential.
const secretLinks = (record, stamp) => {
  const link = (id, tokens, value) => ({ id, tokens, value, updated: stamp });
  if (record.kind === 'bot-token') {
    return [
      link(
        'secret:telegram:bot-token',
        ['secret', 'telegram', 'bot-token'],
        record.value
      ),
    ];
  }
  const links = [
    link(
      'secret:telegram:user-session',
      ['secret', 'telegram', 'user-session'],
      record.value
    ),
  ];
  if (record.apiId) {
    links.push(
      link(
        'secret:telegram:api-id',
        ['secret', 'telegram', 'api-id'],
        String(record.apiId)
      )
    );
  }
  if (record.apiHash) {
    links.push(
      link(
        'secret:telegram:api-hash',
        ['secret', 'telegram', 'api-hash'],
        record.apiHash
      )
    );
  }
  return links;
};

export const createTelegramCreds = ({
  dataDir,
  fetchImpl = globalThis.fetch,
  // Optional MTProto client factory ({apiId,apiHash,session}) -> getMe(),
  // injected where GramJS is available; absent keeps the module dep-free
  // and user sessions are listed unverified (grouped by phone).
  mtproto = null,
  // Per-credential network deadline; 0 disables it (handy in tests).
  verifyTimeout = 12000,
  homeDir = os.homedir(),
  cwd = process.cwd(),
  now = () => Date.now(),
} = {}) => {
  const dir = path.join(dataDir, 'auto-import', 'telegram');
  const cacheFile = path.join(dir, 'found.json');

  const readCache = async () => {
    try {
      return JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  };

  const writeCache = async (cache) => {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = `${cacheFile}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(cache), { mode: 0o600 });
    await fs.rename(temp, cacheFile);
  };

  const verifyAll = (records) =>
    Promise.all(
      records.map((record) =>
        verifyRecord(record, { fetchImpl, mtproto, timeout: verifyTimeout })
      )
    );

  const scan = async ({ roots } = {}) => {
    const scanRoots = roots?.length
      ? roots
      : await defaultRoots({ homeDir, cwd });
    // Collapse duplicates first, so each distinct credential is checked
    // once however many repos hold it, then verify them all at once.
    const records = dedupeRecords(await collectRecords(scanRoots));
    await verifyAll(records);
    mergeByPhone(records);
    // "Only active": a credential Telegram proved dead is dropped; one we
    // could not check is kept (active=null).
    const live = records.filter((record) => record.active !== false);
    await writeCache({
      roots: scanRoots,
      scannedAt: new Date(now()).toISOString(),
      records: Object.fromEntries(live.map((r) => [r.id, r])),
    });
    // The groups are collapsed to one entry per account and type; the flat
    // entry list is just those same entries, so both agree.
    const groups = groupRecords(live);
    return {
      roots: scanRoots,
      entries: groups.flatMap((group) => group.entries),
      groups,
    };
  };

  // Re-group whatever the last scan cached (used by the HTTP route); the
  // live checks already ran during scan, so this is cheap.
  const identify = async (ids = null) => {
    const cache = await readCache();
    const records = Object.values(cache.records ?? {}).filter(
      (r) => !ids || ids.includes(r.id)
    );
    return { groups: groupRecords(records) };
  };

  // The api_id/api_hash/phone behind a phone-login entry, so the caller can
  // start the interactive sign-in. Server-side only — never sent to a browser.
  const loginContext = async (id) => {
    const cache = await readCache();
    const record = cache.records?.[id];
    if (!record || record.kind !== 'user-password') {
      return null;
    }
    return {
      apiId: record.apiId,
      apiHash: record.apiHash,
      phone: record.phone,
    };
  };

  // Connect the chosen credential: write the secrets the app reads. A
  // phone-login has no session yet, so it reports `needsLogin` and the
  // caller drives the sign-in flow (see loginContext).
  const use = async (id, { store } = {}) => {
    const cache = await readCache();
    const record = cache.records?.[id];
    if (!record) {
      throw statusError('unknown or unreadable credential', 404);
    }
    if (record.kind === 'user-password') {
      return { needsLogin: true, id, account: record.account ?? null };
    }
    if (!record.value) {
      throw statusError('unknown or unreadable credential', 404);
    }
    if (!store) {
      throw statusError('a store is required to connect', 500);
    }
    for (const link of secretLinks(record, new Date(now()).toISOString())) {
      await store.put(link);
    }
    return {
      kind: record.kind,
      hint: maskHint(record.value),
      account: record.account ?? null,
    };
  };

  return {
    defaultRoots: () => defaultRoots({ homeDir, cwd }),
    scan,
    identify,
    loginContext,
    use,
  };
};
