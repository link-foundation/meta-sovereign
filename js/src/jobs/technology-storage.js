/** Failed durability must not replace the last acknowledged in-memory record. */
export const saveTechnologyRecord = async (store, row) => {
  const previous = await store.get(row.id);
  await store.put(row);
  try {
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
