/**
 * Soft-delete tombstones (R-K1 … R-K6).
 *
 * Issue #6 requires that messages are never physically deleted by
 * default — even when the upstream service reports a delete. Instead
 * we keep the link, attach a `deleted: { at, by, reason }` marker, and
 * only run a destructive `purge` when the operator explicitly
 * confirms.
 *
 * The functions in this file are deliberately small and stateless so
 * they can wrap any `UniversalLinksAccess` implementation (memory,
 * dual-store, secret-wrapped, browser).
 *
 * Design notes:
 *
 * - Soft-delete is a regular `put`. The peer mesh therefore propagates
 *   tombstones to other devices for free. Mutating handlers on the bus
 *   already use `handledBy` stamps to dedupe, so a tombstone that
 *   round-trips through sync does not re-fire the "delete on upstream"
 *   handler chain.
 * - Hard-delete (`purge`) is intentionally local. It calls the inner
 *   store's `delete()` only when `confirm === true` so the operator
 *   cannot accidentally drop data, and the call never travels over the
 *   sync bus (the sync `peer` only emits `put`/`delete` events that
 *   originated locally; the user has to explicitly run `purge` on each
 *   device).
 * - `isTombstone` and `markDeleted` are pure helpers exported so
 *   adapters can stamp links offline (e.g. inside `parseArchive`) when
 *   they observe upstream deletes.
 */

export const TOMBSTONE_FIELD = 'deleted';

/**
 * Pure: returns a copy of `link` with a tombstone marker merged in.
 * Existing tombstone fields (e.g. an earlier `at`) are preserved so
 * we always remember the *first* time the system saw the delete.
 */
export const markDeleted = (
  link,
  { at = new Date().toISOString(), by = 'user', reason = null } = {}
) => {
  if (!link) {
    return link;
  }
  const existing = link[TOMBSTONE_FIELD];
  if (existing && typeof existing === 'object') {
    return {
      ...link,
      [TOMBSTONE_FIELD]: {
        at: existing.at ?? at,
        by: existing.by ?? by,
        reason: reason ?? existing.reason ?? null,
      },
    };
  }
  return { ...link, [TOMBSTONE_FIELD]: { at, by, reason } };
};

/** Pure: true if a link carries a tombstone. */
export const isTombstone = (link) =>
  Boolean(link && link[TOMBSTONE_FIELD] && link[TOMBSTONE_FIELD].at);

/**
 * Soft-delete a link by id. Reads the current link, attaches the
 * tombstone fields, and re-puts. Returns the tombstoned link or
 * `null` if the link was not found.
 */
export const softDeleteLink = async (
  store,
  id,
  { by = 'user', reason = null, at } = {}
) => {
  const link = await store.get(id);
  if (!link) {
    return null;
  }
  if (isTombstone(link) && !reason) {
    return link;
  }
  const tombstoned = markDeleted(link, { at, by, reason });
  await store.put(tombstoned);
  return tombstoned;
};

/**
 * Hard-delete a link by id. Refuses to run unless `confirm === true`
 * so a typo or a stray `purge()` call cannot drop data silently.
 */
export const purgeLink = async (store, id, { confirm = false } = {}) => {
  if (confirm !== true) {
    throw new Error(
      'purgeLink: explicit { confirm: true } is required to physically delete a link'
    );
  }
  return store.delete(id);
};

/**
 * Bulk-purge every tombstoned link that matches the predicate. Only
 * runs when `confirm === true`. Returns the list of purged ids.
 *
 * The predicate runs against tombstoned links only — non-tombstoned
 * links are never visible to a bulk purge so a misuse cannot drop
 * live data. Pass `predicate = () => true` to purge every tombstone.
 */
export const bulkPurge = async (
  store,
  predicate = () => true,
  { confirm = false } = {}
) => {
  if (confirm !== true) {
    throw new Error(
      'bulkPurge: explicit { confirm: true } is required to physically delete links'
    );
  }
  const all = await store.query();
  const targets = all.filter((l) => isTombstone(l) && predicate(l));
  const purged = [];
  for (const link of targets) {
    const ok = await store.delete(link.id);
    if (ok) {
      purged.push(link.id);
    }
  }
  return purged;
};

/**
 * Decorator that adds `softDelete(id, opts)`, `purge(id, opts)` and
 * `bulkPurge(predicate, opts)` to a Universal Links Access store.
 * The base `delete(id)` keeps its original (hard) semantics so
 * existing call sites — sync `peer.receive`, the handler bus' replay
 * path — keep working unchanged.
 *
 * Server / CLI code paths that should default to soft-delete call
 * `softDelete` directly; that's how `DELETE /links/:id` is wired in
 * `routes-mutating.js`.
 */
export const withSoftDelete = (inner) => ({
  ...inner,
  softDelete: (id, opts) => softDeleteLink(inner, id, opts),
  purge: (id, opts) => purgeLink(inner, id, opts),
  bulkPurge: (predicate, opts) => bulkPurge(inner, predicate, opts),
});
