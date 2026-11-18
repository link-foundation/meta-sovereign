/** Store/schema failures are explained without an unhandled CLI stack. */
export const SCHEMA_ERROR_CODES = new Set([
  'STORE_TOO_NEW',
  'LOW_DISK',
  'MIGRATION_FAILED',
  'BACKUP_TOO_NEW',
]);
