// A finite independent browser probe using actual IndexedDB transactions.
// The explicit first-save gate is released in finally, including failures.
export const probeSnapshot = async (revision) => {
  if (!['before', 'after'].includes(revision)) {
    throw new Error('unknown fixture revision');
  }
  const { createBrowserStore, createIndexedDbDriver } = await import(
    `/${revision}/browser-store.js`
  );
  const native = createIndexedDbDriver({
    dbName: `issue-56-snapshot-${revision}-${globalThis.crypto.randomUUID()}`,
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const saves = [];
  let active = 0;
  let maximum = 0;
  const store = await createBrowserStore({
    driver: {
      load: () => native.load(),
      save(snapshot) {
        const first = saves.length === 0;
        const saving = (async () => {
          active += 1;
          maximum = Math.max(maximum, active);
          try {
            if (first) {
              entered();
              await gate;
            }
            await native.save(snapshot);
          } finally {
            active -= 1;
          }
        })();
        saves.push(saving);
        return saving;
      },
    },
  });
  let acknowledged = false;
  let flushed = false;
  const first = store.put({ id: 'fixture', body: 'before' }).then(() => {
    acknowledged = true;
  });
  let later;
  let flushing;
  let observed;
  try {
    await started;
    later = store.put({ id: 'fixture', body: 'after' });
    flushing = store.flush().then(() => {
      flushed = true;
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    // The old implementation issues later saves while the first is held.
    // Let those actual transactions finish before releasing the first one.
    if (saves.length > 1) {
      await Promise.all(saves.slice(1));
      await flushing;
    }
    observed = {
      acknowledgedBeforeCommit: acknowledged,
      flushedBeforeCommit: flushed,
      savesBeforeRelease: saves.length,
    };
  } finally {
    release();
    await Promise.allSettled([first, later, flushing]);
    await Promise.allSettled(saves);
  }
  const reopened = await createBrowserStore({ driver: native });
  return {
    revision,
    ...observed,
    persisted: (await reopened.get('fixture'))?.body,
    saves: saves.length,
    maximumActive: maximum,
    active,
  };
};
