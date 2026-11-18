/**
 * The automatic backup, started once the port is ours (R-A4, R-Z7).
 *
 * ON by default (R-Z16): a streaming backup every 24 hours, the newest 3
 * kept. `MS_BACKUP_INTERVAL_HOURS` (or the `backups.intervalHours` option)
 * sets the interval in hours, `0` turns it off; `MS_BACKUP_KEEP` (or
 * `backups.keep`) sets how many archives are kept (default 3, `0` keeps
 * all). A value that is not a number >= 0 is ignored for the default and
 * logged once.
 * The archive is encrypted, and holds the secrets, only when the server has
 * a passphrase (`MS_SECRET_PASSPHRASE`); otherwise it leaves them out.
 * The first run is one interval after start, never at start. A nearly full
 * disk skips the run (R-Z14) and the log says so.
 */
import { createBackupScheduler } from '../storage/backup.js';
import { recoveryFormats } from '../storage/recovery-dump.js';
import {
  readRecoverySettings,
  saveRecoverySettings,
  validateRecoverySettings,
  MAX_RECOVERY_HOURS,
} from '../storage/recovery-settings.js';

const HOUR_MS = 3_600_000;
export const DEFAULT_INTERVAL_HOURS = 24;
export const DEFAULT_KEEP = 3;

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
  let hours = number(
    options.intervalHours ?? env.MS_BACKUP_INTERVAL_HOURS,
    DEFAULT_INTERVAL_HOURS,
    'MS_BACKUP_INTERVAL_HOURS',
    invalid
  );
  let keep = number(
    options.keep ?? env.MS_BACKUP_KEEP,
    DEFAULT_KEEP,
    'MS_BACKUP_KEEP',
    invalid
  );
  if (hours > MAX_RECOVERY_HOURS) {
    invalid.push('MS_BACKUP_INTERVAL_HOURS');
    hours = DEFAULT_INTERVAL_HOURS;
  }
  if (keep > 10_000) {
    invalid.push('MS_BACKUP_KEEP');
    keep = DEFAULT_KEEP;
  }
  return {
    intervalMs: hours === 0 ? 0 : Math.max(1, Math.round(hours * HOUR_MS)),
    keep: Math.floor(keep),
    invalid,
  };
};

const formatsFor = (value, log) => {
  try {
    return recoveryFormats(value);
  } catch {
    log?.({
      level: 'warn',
      event: 'backup_setting_ignored',
      names: ['MS_RECOVERY_FORMATS'],
    });
    return recoveryFormats();
  }
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
  let activated = false;
  let stopped = false;
  const defaults = {
    intervalHours: intervalMs / HOUR_MS,
    keep,
    formats: formatsFor(
      backups?.formats ?? process.env.MS_RECOVERY_FORMATS,
      log
    ),
  };
  let settings = defaults;
  const reportError = (error) =>
    log?.({
      level: 'warn',
      event: 'backup_failed',
      code: error.code ?? null,
      error: String(error.message).slice(0, 200),
    });
  // Startup options are explicit overrides; otherwise the persisted preference
  // wins over environment/default values. Loading never starts a pre-listen job.
  let changing = readRecoverySettings(store, defaults)
    .then((saved) => {
      settings = validateRecoverySettings({
        ...saved,
        ...(backups?.intervalHours !== undefined
          ? { intervalHours: defaults.intervalHours }
          : {}),
        ...(backups?.keep !== undefined ? { keep: defaults.keep } : {}),
        ...(backups?.formats !== undefined
          ? { formats: defaults.formats }
          : {}),
      });
    })
    .catch(reportError);
  const start = () => {
    if (activated && !stopped && archiveDir && settings.intervalHours > 0) {
      scheduler = createBackupScheduler({
        store,
        archiveDir,
        intervalMs: Math.max(1, Math.round(settings.intervalHours * HOUR_MS)),
        keep: settings.keep,
        recoveryFormats: settings.formats,
        passphrase,
        measureFree,
        onEvent: (event) => log?.(event),
        onBackup: () => log?.({ level: 'info', event: 'backup_done' }),
        // Never the text of a secret: only the message the backup raised.
        onError: reportError,
      });
    }
  };
  later.push(() => {
    activated = true;
    changing = changing.then(start);
  });
  const get = async () => {
    await changing;
    return { available: Boolean(archiveDir), ...settings };
  };
  const save = (value) => {
    const next = validateRecoverySettings(value);
    const operation = changing.then(async () => {
      if (stopped) {
        throw new Error('server is stopping');
      }
      // Persist first; a failed write leaves the old schedule running.
      await saveRecoverySettings(store, next);
      await scheduler?.stop();
      scheduler = null;
      settings = next;
      start();
      return { available: Boolean(archiveDir), ...settings };
    });
    changing = operation.catch(() => {});
    return operation;
  };
  // Resolves once a backup in flight has finished (and pruned).
  return {
    recovery: { get, save },
    stopBackups: () => {
      stopped = true;
      return changing.then(() => scheduler?.stop());
    },
  };
};
