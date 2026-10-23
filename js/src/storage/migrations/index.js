/**
 * The data schema's versions (R-Z17).
 *
 * `MIGRATIONS` is the ordered chain; each module is
 * `js/src/storage/migrations/<NNNN>-<slug>.js` exporting
 * `{ id, from, to, description, up(ctx) }` (see ./core.js for `ctx`).
 * Adding one: create the module, add its import and its entry below, raise
 * `CURRENT_SCHEMA` to its `to`. `tests/migrations-registry.test.js` fails
 * when an id is repeated, a number is skipped, a module is not listed, or
 * `CURRENT_SCHEMA` is not the last migration's `to`.
 *
 * Static imports (no directory scan) so the browser bundle carries them.
 */

import * as m0001 from './0001-email-threads.js';

export const MIGRATIONS = Object.freeze([m0001]);

/** The schema version this build writes and understands. */
export const CURRENT_SCHEMA = 1;

export {
  SCHEMA_ID,
  ALIAS_PREFIX,
  createContext,
  migrationFailed,
  pendingFrom,
  runMigrations,
  same,
  schemaLink,
  storeTooNew,
  versionOf,
} from './core.js';
