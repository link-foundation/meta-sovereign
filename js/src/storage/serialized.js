/** Independent operation families serialize per store and recover after rejection. */
export const createStoreQueue = () => {
  const pending = new WeakMap();
  return (store, task) => {
    const result = (pending.get(store) ?? Promise.resolve()).then(task);
    pending.set(
      store,
      result.catch(() => {})
    );
    return result;
  };
};
