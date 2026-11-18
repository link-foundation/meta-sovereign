import {
  createBrowserStore,
  createIndexedDbDriver,
} from '../../js/src/storage/browser-store.js';
import { withCausalWrites } from '../../js/src/storage/causal-writes.js';
import { createPeer, loopback } from '../../js/src/sync/peer.js';

export const run = async () => {
  const prefix = `reconcile-${globalThis.crypto.randomUUID()}`;
  const leftDriver = createIndexedDbDriver({ dbName: `${prefix}-left` });
  const rightDriver = createIndexedDbDriver({ dbName: `${prefix}-right` });
  const open = async (driver, actor) =>
    withCausalWrites(await createBrowserStore({ driver }), { actor });
  let left = await open(leftDriver, 'left');
  let right = await open(rightDriver, 'right');
  const old = await left.put({ id: 'removed', body: 'old payload' });
  const edited = await left.put({ id: 'edited', body: 'old value' });
  for (const link of [old, edited]) {
    await createPeer(right).receive({ type: 'put', link });
  }
  await left.delete(old.id);
  await left.put({ id: edited.id, body: 'edited offline' });
  await left.put({ id: 'new', body: 'created offline' });
  await left.put({ id: 'secret:local', value: 'never send' });
  await left.flush();
  left = await open(leftDriver, 'left-reopened');
  right = await open(rightDriver, 'right-reopened');
  const wire = loopback();
  const errors = [];
  const options = {
    schemaVersion: 13,
    onError: (error) => errors.push(error.message),
  };
  const stops = [
    createPeer(left, options).connect(wire.a),
    createPeer(right, options).connect(wire.b),
  ];
  const current = async () => ({
    removed: (await right.get(old.id)) === null,
    edited: (await right.get(edited.id))?.body === 'edited offline',
    created: (await right.get('new'))?.body === 'created offline',
    private: (await right.get('secret:local')) === null,
  });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      await wire.settle();
      if (Object.values(await current()).every(Boolean)) {
        break;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
    }
  } finally {
    stops.forEach((stop) => stop());
  }
  await right.flush();
  right = await open(rightDriver, 'target-reopened');
  await createPeer(right).receive({ type: 'put', link: old });
  return {
    ...(await current()),
    durableReopen: true,
    stalePacketRefused: (await right.get(old.id)) === null,
    errors,
  };
};
