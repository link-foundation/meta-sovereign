// Finite independent actual IndexedDB reopen: no app account or live service.
export const run = async (side) => {
  const { merge } = await import(`/${side}/register.js`);
  const { createBrowserStore, createIndexedDbDriver } =
    await import('/storage/browser-store.js');
  const name = `register-${side}-${globalThis.crypto.randomUUID()}`;
  const driver = createIndexedDbDriver({ dbName: name });
  const store = await createBrowserStore({ driver });
  const [a, b, c] = [
    { id: 'shared', body: 'A', vc: { a: 2 } },
    { id: 'shared', body: 'B', vc: { b: 1 } },
    { id: 'shared', body: 'C', vc: { a: 1, b: 1 } },
  ];
  await store.put(merge(a, b));
  await store.flush();
  const reopened = await createBrowserStore({ driver });
  const snapshot = await reopened.get('shared');
  const left = merge(snapshot, c);
  const right = merge(a, merge(b, c));
  const forward = merge(a, { ...a, body: 'Z' });
  const backward = merge({ ...a, body: 'Z' }, a);
  return {
    left: left.body,
    right: right.body,
    forward: forward.body,
    backward: backward.body,
    originalClock: snapshot.__msSyncStamp?.clock ?? null,
    observedClock: left.vc,
  };
};
