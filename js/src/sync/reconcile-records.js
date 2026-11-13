import { syncRecords } from '../storage/sync-deletions.js';

export const privateSyncId = (id) =>
  id === 'meta:schema' || id.startsWith('secret:');

export const reconciliationSource = (store) => {
  const source = store[syncRecords];
  return typeof source?.scan === 'function' &&
    typeof source?.size === 'function'
    ? source
    : null;
};

// Hold one detached record at a time. Bound visited entries at the opening
// size, so writes appending to a live Map cannot prolong this pass forever.
// Concurrent ordinary writes still travel through the live subscription.
export const scanReconciliation = async (source, visit, cancelled) => {
  const limit = await source.size();
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error('Reconciliation requires a finite storage size');
  }
  const stop = new Error('Reconciliation scan finished');
  let looked = 0;
  try {
    await source.scan(
      (link) => {
        if (cancelled() || looked++ >= limit) {
          throw stop;
        }
        return !privateSyncId(link.id);
      },
      1,
      async ([link]) => {
        if (!cancelled()) {
          await visit(link);
        }
      }
    );
  } catch (error) {
    if (error !== stop) {
      throw error;
    }
  }
};
