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
