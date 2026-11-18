import { assignmentFailure } from './validation.js';
import { vacancyContent } from './vacancy-content.js';

// Shared by the application owner and its chat/assignment planners, never disk.
// Refuse a full run rather than silently persisting or dropping its context.
const runs = new WeakMap();
const maxEntries = 1000;
const maxBytes = 64 * 1024 * 1024;

export const rememberRunVacancy = (store, owner, raw) => {
  // Native unreadable pay remains unknown in RAM. Disk snapshots still require
  // readable metadata; a later planner must not fetch and persist this URL.
  const snapshot = {
    ...vacancyContent({ ...raw, salary: raw.salary ?? '' }, raw.url),
    ...(raw.salary === null ? { salary: null } : {}),
  };
  const bytes = JSON.stringify(snapshot).length * 2;
  const run = runs.get(store) ?? { entries: new Map(), bytes: 0 };
  const previous = run.entries.get(snapshot.url);
  const nextBytes = run.bytes - (previous?.bytes ?? 0) + bytes;
  if ((!previous && run.entries.size >= maxEntries) || nextBytes > maxBytes) {
    throw assignmentFailure(
      'vacancy-memory-limit',
      'Temporary vacancy context is full. End this run before starting another.'
    );
  }
  run.entries.set(snapshot.url, { owner, snapshot, bytes });
  run.bytes = nextBytes;
  runs.set(store, run);
};

export const runVacancy = (store, url) => {
  const value = runs.get(store)?.entries.get(url)?.snapshot;
  return value ? globalThis.structuredClone(value) : null;
};

export const forgetRunVacancy = (store, url) => {
  const run = runs.get(store);
  const previous = run?.entries.get(url);
  if (previous) {
    run.bytes -= previous.bytes;
    run.entries.delete(url);
    if (!run.entries.size) {
      runs.delete(store);
    }
  }
};

export const clearRunVacancies = (store, owner) => {
  const run = runs.get(store);
  if (run) {
    for (const [url, entry] of run.entries) {
      if (entry.owner === owner) {
        forgetRunVacancy(store, url);
      }
    }
  }
};
