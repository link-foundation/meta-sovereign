/**
 * The 24-hour cache rule of Upwork and PeoplePerHour (R-S12, R-T12): links
 * pulled live from their APIs are kept at most `ttlMs` (a day) and then
 * deleted for good; links the user imported from an export are theirs and
 * stay. `softCacheRetentionFor(source, defaultTtlMs)` gives each adapter its
 * `softCacheRetention(store, { ttlMs, now })` -> `{ purged }`. The server
 * runs both on a schedule (R-Z7, ../server/background-jobs.js).
 */
export const softCacheRetentionFor =
  (source, defaultTtlMs) =>
  async (store, { ttlMs = defaultTtlMs, now = Date.now() } = {}) => {
    const stale = await store.query(
      (link) =>
        link.source === source &&
        link.softCache &&
        link.cachedAt !== undefined &&
        now - Number(link.cachedAt) >= ttlMs
    );
    let purged = 0;
    for (const link of stale) {
      await store.delete(link.id);
      purged += 1;
    }
    return { purged };
  };
