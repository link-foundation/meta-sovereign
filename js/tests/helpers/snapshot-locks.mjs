// Finite single-realm Web Locks fixture. Native cross-tab exclusion is checked
// by e2e-browser-storage.mjs, not inferred from this mock.
export const snapshotLocks = () => {
  const held = new Set();
  return {
    async request(name, _options, run) {
      if (held.has(name)) {
        return run(null);
      }
      held.add(name);
      try {
        return await run({ name });
      } finally {
        held.delete(name);
      }
    },
  };
};

export const snapshotStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
};
