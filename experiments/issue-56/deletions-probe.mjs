// A finite actual IndexedDB erase/reopen/delayed-packet/recreation probe.
export const run = async (side) => {
  const { createBrowserStore, createIndexedDbDriver } = await import(
    `/${side}/storage/browser-store.js`
  );
  const { withCausalWrites } = await import(
    `/${side}/storage/causal-writes.js`
  );
  const driver = createIndexedDbDriver({
    dbName: `deletions-${side}-${globalThis.crypto.randomUUID()}`,
  });
  let store = withCausalWrites(await createBrowserStore({ driver }), {
    actor: 'a',
  });
  const old = await store.put({ id: 'shared', body: 'erase' });
  let deletion;
  store.subscribe((event) => {
    if (event.type === 'delete') {
      deletion = event.link;
    }
  });
  await store.delete(old.id);
  await store.flush();
  store = withCausalWrites(await createBrowserStore({ driver }), {
    actor: 'b',
  });
  const raw = await (await createBrowserStore({ driver })).get(old.id);
  const hiddenAfterReopen = (await store.get(old.id)) === null;
  const options = { [Symbol.for('meta-sovereign.replicated-mutation')]: true };
  await store.put(old, options);
  const hiddenAfterOldPacket = (await store.get(old.id)) === null;
  await store.put({ id: old.id, body: 'explicit recreation' });
  await store.delete(old.id, {
    ...options,
    [Symbol.for('meta-sovereign.replicated-deletion')]: deletion,
  });
  await store.flush();
  return {
    side,
    hiddenAfterReopen,
    hiddenAfterOldPacket,
    minimalMetadata: raw?.__msSyncDeleted === 1 && !Object.hasOwn(raw, 'body'),
    afterDelayedDelete: (await store.get(old.id))?.body ?? null,
  };
};
