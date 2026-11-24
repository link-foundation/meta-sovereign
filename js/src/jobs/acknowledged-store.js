const pending = new WeakMap();

/** Readers wait until a shared job mutation either commits or restores state. */
export const acknowledgedWrite = (store, run, operation) => {
  const task = run(operation);
  if (pending.has(store)) {
    return task;
  }
  const acknowledged = task.finally(() => {
    if (pending.get(store) === acknowledged) {
      pending.delete(store);
    }
  });
  pending.set(store, acknowledged);
  return acknowledged;
};
export const acknowledgedRead = async (store, read) => {
  await pending.get(store)?.catch(() => {});
  return read();
};
