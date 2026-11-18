import { isDeepStrictEqual } from 'node:util';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';

/** Recheck at storage admission so synchronization cannot be overwritten. */
export const saveAbsentLegacyVacancy = async (store, row) => {
  if (!store.update) {
    if (await store.get(row.id)) {
      return false;
    }
    await saveAcknowledgedRecord(store, row);
    return true;
  }
  const existing = Symbol('existing vacancy');
  let attempted = false;
  try {
    await store.update(row.id, (before) => {
      if (before) {
        throw existing;
      }
      attempted = true;
      return row;
    });
    await store.flush?.();
    return true;
  } catch (error) {
    if (error === existing) {
      return false;
    }
    if (attempted) {
      const current = await store.get(row.id);
      // A failed flush may have admitted the value. Retain any subsequent
      // owner/synchronized replacement instead of rolling it back as ours.
      if (
        current &&
        isDeepStrictEqual(
          { ...current, vc: undefined },
          { ...row, vc: undefined }
        )
      ) {
        await store.delete(row.id);
      }
    }
    throw error;
  }
};
