/** Restore the last acknowledged record after a rejected mutation or flush. */
export const saveAcknowledgedRecord = async (store, row) => {
  const previous = await store.get(row.id);
  try {
    // Stores may admit memory before their mutation promise rejects on disk.
    await store.put(row);
    await store.flush?.();
  } catch (error) {
    if (previous) {
      await store.put(previous);
    } else {
      await store.delete(row.id);
    }
    throw error;
  }
};
