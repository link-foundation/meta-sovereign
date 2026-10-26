/**
 * `meta-sovereign migrate` (R-Z17): bring a store folder to the data
 * schema this build writes, or say what that would do.
 *
 *   migrate --store=<dir>             migrate now (takes the store lock)
 *   migrate --store=<dir> --dry-run   count what would change; writes nothing
 *   migrate --store=<dir> --status    the store's schema version and history
 *
 * A store is migrated by every command that opens it for writing and by
 * `serve`; this command is for doing it on purpose, or looking first.
 */

import { defaultStoreDir } from '../storage/app-directory.js';
import { openDualStore } from '../storage/dual-store.js';
import {
  MIGRATIONS,
  SCHEMA_ID,
  pendingFrom,
} from '../storage/migrations/index.js';
import { dryRunMigrations } from '../storage/migrations/node-runner.js';

export const MIGRATE_HELP =
  '  migrate       [--store=<dir>] [--dry-run | --status]   bring the store to the current data schema';

/** Errors that end a command with a message instead of a stack (R-Z17). */
export const SCHEMA_ERROR_CODES = new Set([
  'STORE_TOO_NEW',
  'LOW_DISK',
  'MIGRATION_FAILED',
  'BACKUP_TOO_NEW',
]);

const STEP_LINE = (e) =>
  `migration ${e.id}: scanned ${e.scanned}, changed ${e.changed} in ${e.ms} ms`;

/** An `onEvent` that tells a person about the schema events on `log`. */
export const migrationNotice = (log) => (event) => {
  switch (event.event) {
    case 'migration_started':
      log(`migrating the store: schema ${event.from} -> ${event.to}`);
      break;
    case 'migration_step':
      log(STEP_LINE(event));
      break;
    case 'migration_done':
      log(`migration done: ${event.changed} links changed`);
      break;
    case 'migration_rolled_back':
      log('an unfinished migration was undone; the store is as it was');
      break;
    case 'schema_old_read_only':
      log(
        `note: this store is at schema ${event.version} (current ${event.current}); read as it is, not migrated`
      );
      break;
    default:
  }
};

const statusCmd = async (dir, log) => {
  const store = await openDualStore(dir, { readOnly: true });
  const link = await store.get(SCHEMA_ID);
  const { version, current } = store.schema;
  const pending = pendingFrom(MIGRATIONS, version).length;
  log(
    `schema version ${version} (this build writes ${current}): ${
      pending > 0 ? `${pending} migration(s) pending` : 'up to date'
    }`
  );
  for (const step of link?.applied ?? []) {
    log(`  applied ${step.id} at ${step.at}: ${step.changed} changed`);
  }
  return 0;
};

const dryRunCmd = async (dir, log) => {
  const store = await openDualStore(dir, { readOnly: true });
  const summary = await dryRunMigrations(store);
  if (summary.steps.length === 0) {
    log(`nothing to migrate: the store is at schema ${summary.from}`);
    return 0;
  }
  for (const step of summary.steps) {
    log(`would run ${STEP_LINE(step).replace('migration ', '')}`);
  }
  log(
    `dry run: ${summary.changed} links would change (schema ${summary.from} -> ${summary.to}); nothing was written`
  );
  return 0;
};

const migrateCmd = async (dir, log) => {
  const store = await openDualStore(dir, { onEvent: migrationNotice(log) });
  if (!store.migration) {
    log(`the store is at schema ${store.schema.version}; nothing to migrate`);
  }
  await store.flush();
  store.close?.();
  return 0;
};

export const createMigrateCommands = () => ({
  migrate: async (args, log) => {
    const dir = args.store ?? defaultStoreDir();
    if (args.status) {
      return statusCmd(dir, log);
    }
    return args['dry-run'] && args['dry-run'] !== 'false'
      ? dryRunCmd(dir, log)
      : migrateCmd(dir, log);
  },
});
