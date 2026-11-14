// Schema 13 reserves this marker. A hard delete drops the payload and retains
// only causal deletion metadata so an older packet cannot resurrect it.
export const SYNC_DELETED = '__msSyncDeleted';
export const syncRecords = Symbol.for('meta-sovereign.sync-records');
export const replicatedDeletion = Symbol.for(
  'meta-sovereign.replicated-deletion'
);
export const isSyncDeleted = (link) => link?.[SYNC_DELETED] === 1;

export const validateSyncDeletion = (link) => {
  if (!Object.hasOwn(link, SYNC_DELETED)) {
    return;
  }
  const fields = new Set([
    'id',
    'vc',
    'children',
    '__msSyncStamp',
    SYNC_DELETED,
  ]);
  if (
    !isSyncDeleted(link) ||
    !link.vc ||
    !Object.values(link.vc).some((n) => Number.isSafeInteger(n) && n > 0) ||
    Object.keys(link).some((key) => !fields.has(key))
  ) {
    throw Object.assign(new Error('Invalid causal deletion metadata'), {
      code: 'SYNC_VALUE_INVALID',
    });
  }
};
