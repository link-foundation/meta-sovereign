import { saveTechnologyRecord } from './technology-storage.js';
import { jobsFailure } from './options.js';

export const publishCvSave = async ({
  store,
  options,
  result,
  attemptId,
  check,
  save,
}) => {
  check();
  const id = `jobs-cv-snapshots:${options.browserSlot}`;
  const previous = await store.get(id);
  const snapshots = new Map(
    (previous?.snapshots ?? []).map((row) => [row.hash, row])
  );
  const savedAt = new Date().toISOString();
  for (const row of result.exports) {
    snapshots.set(row.hash, {
      ...row,
      savedAt,
      attemptId,
      evidence: 'verified-owner-save-native-export',
    });
  }
  if (
    snapshots.size > 100 ||
    JSON.stringify([...snapshots.values()]).length > 8 * 1024 ** 2
  ) {
    throw jobsFailure('cv-limit', 'The saved CV snapshot bound was exceeded.');
  }
  check();
  await saveTechnologyRecord(store, {
    id,
    version: 1,
    browserSlot: options.browserSlot,
    snapshots: [...snapshots.values()],
  });
  try {
    check();
  } catch (error) {
    if (previous) {
      await store.put(previous);
    } else {
      await store.delete(id);
    }
    await store.flush?.();
    throw error;
  }
  await save({ state: 'saved', code: null, savedAt, verified: true });
};
