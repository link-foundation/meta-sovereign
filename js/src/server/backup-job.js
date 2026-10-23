/**
 * The automatic backup, started once the port is ours (R-A4, R-Z7).
 *
 * OFF by default (the streaming backups of R-Z16 switch it on).
 * `MS_BACKUP_INTERVAL_HOURS` (or the `backups.intervalHours` option) sets
 * the interval in hours, `0` or unset means off; `MS_BACKUP_KEEP` (or
 * `backups.keep`) sets how many archives are kept (default 7, `0` keeps
 * all). A value that is not a number >= 0 is ignored for the default and
 * logged once.
 * The archive is encrypted, and holds the secrets, only when the server has
 * a passphrase (`MS_SECRET_PASSPHRASE`); otherwise it leaves them out.
 * The first run is one interval after start, never at start. A nearly full
 * disk skips the run (R-Z14) and the log says so.
 */
import { createBackupScheduler } from '../storage/backup.js';

const HOUR_MS = 3_600_000;
export const DEFAULT_INTERVAL_HOURS = 0;
export const DEFAULT_KEEP = 7;

// A number >= 0, or the fallback; `bad` collects the names that were wrong.
const number = (value, fallback, name, bad) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) {
    return n;
  }
  bad.push(name);
  return fallback;
};

/**
 * `{ intervalMs, keep, invalid }` from options and the environment; an
 * interval of 0 is off; `invalid` names the settings that were ignored.
 */
export const backupSettings = (options = {}, env = process.env) => {
  const invalid = [];
  const hours = number(
    options.intervalHours ?? env.MS_BACKUP_INTERVAL_HOURS,
    DEFAULT_INTERVAL_HOURS,
    'MS_BACKUP_INTERVAL_HOURS',
    invalid
  );
  const keep = number(
    options.keep ?? env.MS_BACKUP_KEEP,
    DEFAULT_KEEP,
    'MS_BACKUP_KEEP',
    invalid
  );
  return {
    intervalMs: Math.round(hours * HOUR_MS),
    keep: Math.floor(keep),
    invalid,
  };
};

/** The context part: `{ stopBackups }`; the timer starts with `later`. */
export const backupJobFor = ({ ctx, store, log, later, backups }) => {
  const { archiveDir, secretPassphrase: passphrase } = ctx;
  const measureFree = ctx.diskFree;
  const { intervalMs, keep, invalid } = backupSettings(backups);
  if (invalid.length > 0) {
    log?.({ level: 'warn', event: 'backup_setting_ignored', names: invalid });
  }
  let scheduler = null;
  if (archiveDir && intervalMs > 0) {
    later.push(() => {
      scheduler = createBackupScheduler({
        store,
        archiveDir,
        intervalMs,
        keep,
        passphrase,
        measureFree,
        onEvent: (event) => log?.(event),
        onBackup: () => log?.({ level: 'info', event: 'backup_done' }),
        // Never the text of a secret: only the message the backup raised.
        onError: (error) =>
          log?.({
            level: 'warn',
            event: 'backup_failed',
            code: error.code ?? null,
            error: String(error.message).slice(0, 200),
          }),
      });
    });
  }
  return { stopBackups: () => scheduler?.stop() };
};
