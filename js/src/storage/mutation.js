// Transient subscription metadata. Symbols never enter stored links or wire
// records. Wrappers must forward the options to every derived mutation too.
export const replicatedMutation = Symbol.for(
  'meta-sovereign.replicated-mutation'
);

export const mutationEvent = (type, link, options) => ({
  type,
  link,
  ...(options?.[replicatedMutation] ? { [replicatedMutation]: true } : {}),
});

// Atomic updates run this synchronous callback at mutation admission, after
// any wrapper's write queue. An async transform could interleave an owner edit.
export const changedLink = (id, change, before) => {
  const next = change(before);
  if (!next || next.id !== id || typeof next.then === 'function') {
    throw new Error(
      'store.update requires a synchronous link with the same id'
    );
  }
  return next;
};

// Reserve append admission before a synchronous subscriber can start another
// mutation. Memory still changes immediately; persistence stages in call order
// without waiting for disk completion, preserving group commit.
export const orderedMutations = (methods) => {
  let tail = Promise.resolve();
  return {
    wait: (run) => tail.then(run),
    methods: Object.fromEntries(
      Object.entries(methods).map(([name, run]) => [
        name,
        (...args) => {
          let ready;
          let failed;
          const mutation = new Promise((resolve, reject) => {
            ready = resolve;
            failed = reject;
          });
          const admitted = tail.then(async () => {
            const { value, persist } = await mutation;
            return { value, persisted: persist?.() };
          });
          tail = admitted.then(
            () => {},
            () => {}
          );
          // A handler can throw before a previous admission finishes. Observe
          // that rejection now, while retaining it for this caller's result.
          mutation.catch(() => {});
          try {
            Promise.resolve(run(...args)).then(ready, failed);
          } catch (error) {
            failed(error);
          }
          return admitted.then(async ({ value, persisted }) => {
            await persisted;
            return value;
          });
        },
      ])
    ),
  };
};
