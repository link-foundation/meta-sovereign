/**
 * The migration runner's shared core (R-Z17). Browser-safe: no node:*
 * imports. The Node adapter (./node-runner.js) adds the journal, the free
 * space check and the rollback by truncating the log; the browser adapter
 * (./browser-runner.js) runs the same modules over the page's store.
 *
 * A store's schema version is one link, `meta:schema`:
 *   { id, tokens, children, version, applied: [{ id, at, ms, changed }], app }
 * A store without it is version 0 (the shapes before versioning).
 *
 * A migration is a module exporting `{ id, from, to, description, up(ctx) }`:
 * a forward-only, idempotent, pure data transform (no network). `ctx`:
 *   scan({ prefix, where, batchSize }, async (batch) => ...)  copies, in batches
 *   get(id) / put(link) / putMany(links) / tombstone(id)
 *   rekey(oldId, newId, { patch }) / rekeyMany(pairs, { fields, children, refMap })
 *   resolve(id)       follows `alias:<old>` links to the current id
 *   log(name, counts) a log line with numbers only, never content
 *   progress(info)    reports `{ scanned, changed }` to whoever listens
 *   dryRun            true: writes are only counted
 */

export const SCHEMA_ID = 'meta:schema';
export const ALIAS_PREFIX = 'alias:';
const BATCH = 1000;
const MAX_ALIAS_HOPS = 16;

export const schemaLink = ({ version, applied = [], app = null }) => ({
  id: SCHEMA_ID,
  tokens: ['meta', 'schema'],
  children: [],
  version,
  applied,
  app,
});

/** The version a `meta:schema` link (or its absence) stands for. */
export const versionOf = (link) =>
  Number.isInteger(link?.version) && link.version >= 0 ? link.version : 0;

const fail = (code, message, extra = {}) =>
  Object.assign(new Error(message), { code, ...extra });

export const storeTooNew = (found, current, where = 'store') =>
  fail(
    'STORE_TOO_NEW',
    `this ${where} was written by a newer version (schema ${found}, this app understands up to ${current}); update the app`,
    { found, current }
  );

export const migrationFailed = (id, cause) =>
  fail(
    'MIGRATION_FAILED',
    `migration ${id} failed (${cause?.code ?? cause?.message ?? 'error'}); the store was put back as it was`,
    { migration: id, cause }
  );

// Deep equality that ignores key order.
export const same = (a, b) => {
  if (a === b) {
    return true;
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && same(a[key], b[key]))
  );
};

const scanner = (store) =>
  typeof store.scan === 'function'
    ? (filter, size, onBatch) => store.scan(filter, size, onBatch)
    : async (filter, size, onBatch) => {
        const all = await store.query(filter);
        for (let at = 0; at < all.length; at += size) {
          await onBatch(all.slice(at, at + size));
        }
        return all.length;
      };

const aliasOf = (oldId, newId) => ({
  id: `${ALIAS_PREFIX}${oldId}`,
  tokens: ['alias', oldId],
  children: [newId],
  to: newId,
});

// Numbers only: a log line must never carry content.
const countsOnly = (counts = {}) =>
  Object.fromEntries(
    Object.entries(counts).filter(([, v]) => Number.isFinite(v))
  );

// `link` with its references pointed at the new ids, or null if none moved.
const rewriteLink = (link, map, { fields, children, refMap }) => {
  const to = (text) => map.get(text) ?? refMap?.(text) ?? text;
  const patch = {};
  for (const field of fields) {
    if (typeof link[field] === 'string' && to(link[field]) !== link[field]) {
      patch[field] = to(link[field]);
    }
  }
  if (children && Array.isArray(link.children)) {
    const next = link.children.map(to);
    if (!same(next, link.children)) {
      patch.children = next;
    }
  }
  return Object.keys(patch).length > 0 ? { ...link, ...patch } : null;
};

/** The `ctx` a migration's `up` receives. */
export const createContext = (
  store,
  migration,
  { dryRun = false, onEvent = () => {}, onProgress = () => {}, batchSize } = {}
) => {
  const stats = { scanned: 0, changed: 0, conflicts: 0 };
  const scan = scanner(store);
  const size = batchSize ?? BATCH;
  const ctx = {
    dryRun,
    migration: { id: migration.id, from: migration.from, to: migration.to },
    stats,
    async scan({ prefix, where, batchSize: own } = {}, onBatch) {
      const filter =
        prefix || where
          ? (link) =>
              (!prefix || String(link.id).startsWith(prefix)) &&
              (!where || where(link))
          : null;
      const looked = await scan(filter, own ?? size, onBatch);
      stats.scanned += looked;
      onProgress({ scanned: stats.scanned, changed: stats.changed });
      return looked;
    },
    get: (id) => store.get(id),
    async putMany(links) {
      const changed = [];
      for (const link of links) {
        if (!same(await store.get(link.id), link)) {
          changed.push(link);
        }
      }
      if (changed.length > 0 && !dryRun) {
        await store.putMany(changed);
      }
      stats.changed += changed.length;
      onProgress({ scanned: stats.scanned, changed: stats.changed });
      return changed.length;
    },
    put: (link) => ctx.putMany([link]),
    async tombstone(id) {
      if (!(await store.get(id))) {
        return false;
      }
      if (!dryRun) {
        await store.delete(id);
      }
      stats.changed += 1;
      return true;
    },
    /**
     * Move a link to a new id: written under `newId` (with `patch` applied),
     * `alias:<oldId>` records where it went, the old id is tombstoned. Run
     * again it does nothing (the old id is gone). A different link already
     * under `newId` is never overwritten: counted as a conflict, the old
     * link stays where it was.
     */
    async rekey(oldId, newId, { patch = {} } = {}) {
      const link = await store.get(oldId);
      if (!link || oldId === newId) {
        return false;
      }
      const moved = { ...link, ...patch, id: newId };
      const there = await store.get(newId);
      if (there && !same(there, moved)) {
        stats.conflicts += 1;
        return false;
      }
      await ctx.putMany([moved, aliasOf(oldId, newId)]);
      await ctx.tombstone(oldId);
      return true;
    },
    /**
     * `rekey` for each `[oldId, newId]` pair, then one pass that points
     * what referred to an old id at the new one: entries of `children`
     * (`children: false` to leave them), the listed scalar `fields`, and
     * any string `refMap(text)` maps to another (for ids embedded in
     * longer ones, e.g. `chat:whatsapp:<id>`). Returns the pairs moved.
     */
    async rekeyMany(pairs, { fields = [], children = true, refMap } = {}) {
      const map = new Map();
      for (const [oldId, newId] of pairs) {
        if (await ctx.rekey(oldId, newId)) {
          map.set(oldId, newId);
        }
      }
      if (map.size > 0 || refMap) {
        const options = { fields, children, refMap };
        await ctx.scan({}, async (batch) => {
          await ctx.putMany(
            batch
              .filter((link) => !String(link.id).startsWith(ALIAS_PREFIX))
              .map((link) => rewriteLink(link, map, options))
              .filter(Boolean)
          );
        });
      }
      return map.size;
    },
    /** The id `id` became, following `alias:` links (itself if none). */
    async resolve(id) {
      let at = id;
      for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
        const alias = await store.get(`${ALIAS_PREFIX}${at}`);
        if (!alias?.to || alias.to === at) {
          return at;
        }
        at = alias.to;
      }
      return at;
    },
    log: (name, counts) =>
      onEvent({
        level: 'info',
        event: name,
        id: migration.id,
        ...countsOnly(counts),
      }),
    progress: (info) => onProgress(countsOnly(info)),
  };
  return ctx;
};

/** The migrations still to run from `version`, in order. */
export const pendingFrom = (migrations, version) =>
  migrations.filter((m) => m.from >= version);

// One migration's `up`, timed; its failure names it.
const runStep = async (store, migration, { now, ...options }) => {
  const ctx = createContext(store, migration, options);
  const started = now();
  try {
    await migration.up(ctx);
  } catch (error) {
    throw migrationFailed(migration.id, error);
  }
  return {
    id: migration.id,
    scanned: ctx.stats.scanned,
    changed: ctx.stats.changed,
    ms: now() - started,
  };
};

/**
 * Run the pending migrations over `store` in order. After each one the
 * `meta:schema` link is written (so a stop between two keeps the first).
 * `before(m)` / `after(m, entry)` let an adapter journal around a step.
 * With `dryRun` nothing is written; resolves to a summary either way:
 * `{ from, to, steps: [{ id, scanned, changed, ms }], changed }`.
 */
export const runMigrations = async (
  store,
  {
    migrations,
    from = null,
    dryRun = false,
    app = null,
    onEvent = () => {},
    onProgress = () => {},
    before = async () => {},
    after = async () => {},
    now = () => Date.now(),
    batchSize,
  }
) => {
  const schema = await store.get(SCHEMA_ID);
  const stored = versionOf(schema);
  let version = from ?? stored;
  const applied = [...(schema?.applied ?? [])];
  const summary = { from: version, to: version, steps: [], changed: 0 };
  for (const migration of pendingFrom(migrations, version)) {
    if (migration.from !== version) {
      throw fail(
        'MIGRATION_GAP',
        `no migration leads from schema ${version} (next is ${migration.id})`
      );
    }
    await before(migration);
    const step = await runStep(store, migration, {
      dryRun,
      onEvent,
      onProgress,
      batchSize,
      now,
    });
    const ms = step.ms;
    version = migration.to;
    summary.steps.push(step);
    summary.changed += step.changed;
    summary.to = version;
    onEvent({ level: 'info', event: 'migration_step', dryRun, ...step });
    const entry = {
      id: migration.id,
      at: new Date(now()).toISOString(),
      ms,
      changed: step.changed,
    };
    if (!dryRun) {
      applied.push(entry);
      await store.put(
        schemaLink({ version: Math.max(version, stored), applied, app })
      );
    }
    await after(migration, entry);
  }
  return summary;
};
