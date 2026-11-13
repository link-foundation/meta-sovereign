// Actual IndexedDB admission/reopen with a lower-ranked ordinary assignment.
export const run = async (side) => {
  const { createBrowserStore, createIndexedDbDriver } = await import(
    `/${side}/storage/browser-store.js`
  );
  const { merge } = await import('/after/sync/register.js');
  const wrap =
    side === 'after'
      ? (await import('/after/storage/causal-writes.js')).withCausalWrites
      : (store) => store;
  const name = `causal-${side}-${globalThis.crypto.randomUUID()}`;
  const driver = createIndexedDbDriver({ dbName: name });
  let store = wrap(await createBrowserStore({ driver }));
  const old = await store.put({ id: 'shared', body: 'z' });
  const next = await store.put({ id: 'shared', body: 'a' });
  await store.flush();
  store = wrap(await createBrowserStore({ driver }));
  const saved = await store.get('shared');
  const reopened = await store.put({ id: 'shared', body: '0' });
  await store.flush();
  const actors = Object.keys(reopened.vc ?? {});
  return {
    side,
    saved: saved.body,
    delayedPacket: merge(next, old).body,
    afterReopen: merge(reopened, next).body,
    initialClock: old.vc ?? null,
    editedClock: next.vc ?? null,
    reopenedClock: reopened.vc ?? null,
    distinctOpeningActors: actors.length === 2,
  };
};
