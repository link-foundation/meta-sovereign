// Coordinate answer writers sharing one local, browser or server store.
// Archive reads stay outside this queue so owner edits can invalidate them.
const writes = new WeakMap();

export const writeAnswerKnowledge = (store, write) => {
  const previous = writes.get(store) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(write);
  writes.set(store, next);
  return next.finally(() => {
    if (writes.get(store) === next) {
      writes.delete(store);
    }
  });
};
