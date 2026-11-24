/** Stop admission and drain each owned operation before the store is released. */
export const ownedOperations = (run, label) => {
  const pending = new Set();
  let closing = false;
  return {
    run(...args) {
      if (closing) {
        throw Object.assign(new Error(`${label} is closing`), {
          code: 'stopped',
        });
      }
      const task = Promise.resolve().then(() => run(...args));
      pending.add(task);
      const done = () => pending.delete(task);
      task.then(done, done);
      return task;
    },
    async close() {
      closing = true;
      await Promise.allSettled([...pending]);
    },
  };
};
