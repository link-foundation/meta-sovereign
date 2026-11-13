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
import * as m0002 from './0002-whatsapp-chat-ids.js';
import * as m0003 from './0003-vk-reactions-docs.js';
import * as m0004 from './0004-github-external-ids.js';
import * as m0005 from './0005-archive-ids.js';
import * as m0006 from './0006-tombstones.js';
import * as m0007 from './0007-browser-policy.js';
import * as m0008 from './0008-salary-exchange.js';
import * as m0009 from './0009-salary-exchange-policy.js';
import * as m0010 from './0010-hh-message-metadata.js';
import * as m0011 from './0011-sync-write-stamps.js';

export const MIGRATIONS = Object.freeze([
  m0001,
  m0002,
  m0003,
  m0004,
  m0005,
  m0006,
  m0007,
  m0008,
  m0009,
  m0010,
  m0011,
]);

/** The schema version this build writes and understands. */
export const CURRENT_SCHEMA = 11;

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
