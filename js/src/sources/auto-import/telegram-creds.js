/**
 * Find the Telegram sign-ins the user already has on this computer.
 *
 * People who experiment with Telegram scatter their own credentials across
 * repositories: a bot token in one project's `.env`, a GramJS user
 * "string session" saved beside another (konard/telegram-bot writes it to
 * `.telegram_session`), an `api_id`/`api_hash`/phone trio in a third. This
 * module walks folders the user chooses and collects those, so the account
 * can be connected here without hunting for them again.
 *
 *   scan({ roots })  read-only walk of the chosen folders for `.env`/`.lenv`
 *                    files and session files; returns one entry per found
 *                    credential with its kind, where it was found and a
 *                    MASKED hint (last four characters) — never the value.
 *   identify(ids)    resolve each entry to the Telegram account it belongs
 *                    to and group entries by account: bot tokens via the Bot
 *                    API `getMe` (plain fetch), user sessions via MTProto
 *                    when a client is available, otherwise by their phone.
 *   use(id, {store}) connect the chosen credential — store it under the
 *                    `secret:telegram:*` keys the app already reads.
 *
 * Supports both **bot tokens** (`123456:ABC…`) and **user sessions**
 * (GramJS `StringSession`). Everything stays on this computer: raw values
 * are kept in an owner-only file (0600) until the user connects one, and
 * are never logged or returned to the browser — callers see kinds, paths
 * and masked hints only.
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

const idFor = (source, key) =>
  crypto
    .createHash('sha1')
    .update(`${source}\u0000${key}`)
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
      id: idFor(file, field.key),
      kind: field.kind,
      source: file,
      where: relativeTo(roots, file),
      key: field.key,
      value: field.value,
      ...(field.kind === 'user-session' ? ctx : {}),
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
      id: idFor(file, 'telethon'),
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
    id: idFor(file, 'session'),
    kind: 'user-session',
    source: file,
    where: relativeTo(roots, file),
    key: path.basename(file),
    value,
    ...(await siblingApiContext(file)),
  };
};

// A record as the caller sees it: never the value, only a masked hint.
const publicEntry = (record) => ({
  id: record.id,
  kind: record.kind,
  where: record.where,
  key: record.key,
  hint: record.value ? maskHint(record.value) : null,
  phone: record.phone ? maskHint(record.phone) : null,
  account: record.account ?? null,
});

// A cheap account label from the file alone — no network. Bot tokens and
// sessions each get a stable group key so the same account found in
// several repositories lands in one group immediately, before (optional)
// online verification ever runs.
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
    key: phone ? `phone:${record.phone}` : `session:${record.id}`,
    label: phone ? `user ${phone}` : 'user session',
    verified: false,
  };
};

// Group records by their local account, newest-first grouping preserved.
const groupRecords = (records) => {
  const groups = new Map();
  for (const record of records) {
    const account = localAccount(record);
    record.account = account;
    if (!groups.has(account.key)) {
      groups.set(account.key, { account, entries: [] });
    }
    groups.get(account.key).entries.push(publicEntry(record));
  }
  return [...groups.values()];
};

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

// Resolve a bot token to its account with the Bot API (no dependency).
const identifyBot = async (value, fetchImpl) => {
  if (!fetchImpl) {
    return null;
  }
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${value}/getMe`);
    const me = (await res.json())?.result;
    if (!me) {
      return null;
    }
    return {
      kind: 'bot',
      key: `bot:${me.id}`,
      id: me.id,
      username: me.username ?? null,
      label: me.username
        ? `@${me.username}`
        : (me.first_name ?? `bot ${me.id}`),
      verified: true,
    };
  } catch {
    return null;
  }
};

const userViaMtproto = async (record, mtproto) => {
  const me = await mtproto({
    apiId: Number(record.apiId),
    apiHash: record.apiHash,
    session: record.value,
  }).then((client) => client.getMe());
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ');
  return {
    kind: 'user',
    key: `user:${me.id}`,
    id: me.id,
    username: me.username ?? null,
    label: me.username ? `@${me.username}` : name || `user ${me.id}`,
    verified: true,
  };
};

// Resolve a user session via MTProto when available; otherwise group it by
// its phone (the user confirms the account is theirs).
const identifyUser = async (record, mtproto) => {
  if (mtproto && record.apiId && record.apiHash) {
    try {
      return await userViaMtproto(record, mtproto);
    } catch {
      // fall through to the phone-based grouping.
    }
  }
  return {
    kind: 'user',
    key: record.phone ? `phone:${record.phone}` : `session:${record.id}`,
    id: null,
    username: null,
    label: record.phone ? `user ${maskHint(record.phone)}` : 'user session',
    verified: false,
  };
};

const accountFor = (record, { fetchImpl, mtproto }) =>
  record.kind === 'bot-token'
    ? identifyBot(record.value, fetchImpl).then(
        (account) =>
          account ?? {
            kind: 'bot',
            key: `bot:${record.id}`,
            id: null,
            label: 'bot token',
            verified: false,
          }
      )
    : identifyUser(record, mtproto);

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
  // injected where GramJS is available; absent keeps the module dep-free.
  mtproto = null,
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

  const scan = async ({ roots } = {}) => {
    const scanRoots = roots?.length
      ? roots
      : await defaultRoots({ homeDir, cwd });
    const records = await collectRecords(scanRoots);
    const byId = new Map(records.map((r) => [r.id, r]));
    // Group locally, with no network, so the results appear at once.
    const groups = groupRecords([...byId.values()]);
    await writeCache({
      roots: scanRoots,
      scannedAt: new Date(now()).toISOString(),
      records: Object.fromEntries(byId),
    });
    return {
      roots: scanRoots,
      entries: [...byId.values()].map(publicEntry),
      groups,
    };
  };

  const identify = async (ids = null) => {
    const cache = await readCache();
    const records = Object.values(cache.records ?? {}).filter(
      (r) => r.value && (!ids || ids.includes(r.id))
    );
    const groups = new Map();
    for (const record of records) {
      const account = await accountFor(record, { fetchImpl, mtproto });
      record.account = {
        label: account.label,
        kind: account.kind,
        verified: account.verified,
      };
      if (!groups.has(account.key)) {
        groups.set(account.key, { account, entries: [] });
      }
      groups.get(account.key).entries.push(publicEntry(record));
    }
    cache.records = {
      ...cache.records,
      ...Object.fromEntries(records.map((r) => [r.id, r])),
    };
    await writeCache(cache);
    return { groups: [...groups.values()] };
  };

  // Connect the chosen credential: write the secrets the app reads.
  const use = async (id, { store } = {}) => {
    const cache = await readCache();
    const record = cache.records?.[id];
    if (!record || !record.value) {
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
    use,
  };
};
