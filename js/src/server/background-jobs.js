/**
 * The jobs that run by themselves while the server is up, started once the
 * port is really ours (R-Z7; a second `serve` on a busy port must not run
 * them on the same store):
 *
 *   automatic backup          ./backup-job.js          daily, keep 7 (R-A4)
 *   audience membership sync  ./audience-sync.js       daily (R-X13)
 *   24-hour cache purge       here                     hourly (R-S12, R-T12)
 *
 * `backgroundJobs(...)` returns the part of the context holding `stopJobs`.
 */
import {
  clearInterval,
  clearTimeout,
  setInterval,
  setTimeout,
} from 'node:timers';
import { backupJobFor } from './backup-job.js';
import { audienceSyncFor } from './audience-sync.js';
import { safeMessage } from './redact.js';
import { softCacheRetention as upworkRetention } from '../sources/upwork.js';
import { softCacheRetention as pphRetention } from '../sources/peopleperhour.js';

const HOUR_MS = 3_600_000;
// The first purge, a minute after start, so a start-up is not slowed by a
// scan of the store; `MS_CACHE_PURGE_DELAY_MS` changes it (tests).
const FIRST_PURGE_MS = 60_000;

/**
 * Upwork and PeoplePerHour content pulled live from their APIs is deleted
 * 24 hours after it was pulled; what the user imported from an export stays.
 */
export const purgeSoftCaches = async (store, now = Date.now()) => {
  const upwork = await upworkRetention(store, { now });
  const peoplePerHour = await pphRetention(store, { now });
  return { upwork: upwork.purged, peopleperhour: peoplePerHour.purged };
};

const cachePurgeFor = ({ store, log, later }) => {
  let timer = null;
  let first = null;
  const run = () =>
    purgeSoftCaches(store)
      .then((purged) =>
        purged.upwork + purged.peopleperhour > 0
          ? log?.({ level: 'info', event: 'soft_cache_purged', ...purged })
          : null
      )
      .catch((error) =>
        log?.({
          level: 'warn',
          event: 'soft_cache_purge_failed',
          error: safeMessage(error),
        })
      );
  later.push(() => {
    const delay = Number(process.env.MS_CACHE_PURGE_DELAY_MS ?? FIRST_PURGE_MS);
    first = setTimeout(run, delay);
    timer = setInterval(run, HOUR_MS);
    first.unref?.();
    timer.unref?.();
  });
  return {
    stopCachePurge: () => {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
};

export const backgroundJobs = ({ ctx, store, log, later, backups }) => {
  const backup = backupJobFor({ ctx, store, log, later, backups });
  const audience = audienceSyncFor({
    store,
    log,
    later,
    resolve: ctx.audienceSources,
  });
  const purge = cachePurgeFor({ store, log, later });
  return {
    // Returns a promise settled once a backup in flight has finished.
    stopJobs: () => {
      const backupDone = backup.stopBackups();
      audience.stopAudienceSync();
      purge.stopCachePurge();
      // The other timers and pollers the server started with the port.
      ctx.autoImport?.close();
      ctx.whatsappSignIn?.stop().catch(() => {});
      ctx.stopPulls?.();
      return backupDone;
    },
  };
};
