/** Failed durability must not replace the last acknowledged in-memory record. */
export const saveTechnologyRecord = async (store, row) => {
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
