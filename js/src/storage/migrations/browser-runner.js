/**
 * The browser adapter of the migration runner (R-Z17): the same modules
 * over the page's store (./../browser-store.js), no node:* imports.
 *
 * The page's store is a snapshot written as a whole by its driver, with no
 * log to cut back, so there is no rollback: a migration is idempotent, and
 * `meta:schema` (written after each step, in the snapshot that carries the
 * step's changes) records which steps are complete. A tab closed half way
 * through a step runs that step again at the next load and gets the same
 * result.
 */

import {
  CURRENT_SCHEMA,
  MIGRATIONS,
  SCHEMA_ID,
  runMigrations,
  schemaLink,
  storeTooNew,
  versionOf,
} from './index.js';

/**
 * Bring the browser store to the current schema before the page uses it.
 * Throws `STORE_TOO_NEW` when the store was written by a newer build (the
 * page must say "update the app" and leave it alone). Resolves to
 * `{ version, current, migrated }`.
 */
export const migrateBrowserStore = async (
  store,
  {
    migrations = MIGRATIONS,
    current = CURRENT_SCHEMA,
    onEvent = () => {},
    app = null,
  } = {}
) => {
  const version = versionOf(await store.get(SCHEMA_ID));
  if (version > current) {
    onEvent({ level: 'error', event: 'schema_too_new', version, current });
    throw storeTooNew(version, current, 'browser store');
  }
  if (version === current) {
    return { version, current, migrated: null };
  }
  const empty =
    (store.size ? store.size() : (await store.query()).length) === 0;
  if (empty) {
    await store.put(schemaLink({ version: current, app }));
    await store.flush?.();
    return { version: current, current, migrated: null };
  }
  onEvent({
    level: 'info',
    event: 'migration_started',
    from: version,
    to: current,
  });
  const migrated = await runMigrations(store, {
    migrations,
    app,
    onEvent,
    after: async () => store.flush?.(),
  });
  onEvent({
    level: 'info',
    event: 'migration_done',
    from: migrated.from,
    to: migrated.to,
    changed: migrated.changed,
  });
  return { version: migrated.to, current, migrated };
};
