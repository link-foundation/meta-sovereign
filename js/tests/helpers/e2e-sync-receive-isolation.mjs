import { assert } from './e2e-chat.mjs';
import { readSyncPeer } from './e2e-lino-sync-read.mjs';

// Admit an owner edit synchronously while the remote merge clones its existing
// record. This controls one finite interleaving in the real browser store;
// sockets, persistence, peer receive and the owner's ordinary API stay native.
export const checkReceiveIsolation = async ({ page, other, until }) => {
  const id = 'l:receive-isolation-record';
  const owner = 'l:receive-isolation-owner';
  await page.evaluate(
    (key) =>
      globalThis.__msApi.put({ id: key, body: 'base', vc: { source: 1 } }),
    id
  );
  await until(
    async () => (await readSyncPeer(other, id))?.record?.body === 'base',
    'receive isolation baseline',
    20000
  );
  await other.evaluate(
    ({ id, owner }) => {
      const stringify = JSON.stringify;
      globalThis.__receiveIsolation = { triggered: false, written: false };
      globalThis.__restoreReceiveStringify = () => {
        JSON.stringify = stringify;
      };
      JSON.stringify = function (value, ...args) {
        if (value?.id === id && value.body === 'base') {
          JSON.stringify = stringify;
          globalThis.__receiveIsolation.triggered = true;
          Promise.resolve(
            globalThis.__msApi.put({
              id: owner,
              body: 'owner edit during receive',
            })
          ).then(
            () => {
              globalThis.__receiveIsolation.written = true;
            },
            (error) => {
              globalThis.__receiveIsolation.error = error.message;
            }
          );
        }
        return stringify.call(this, value, ...args);
      };
    },
    { id, owner }
  );
  try {
    await page.evaluate(
      (key) =>
        globalThis.__msApi.put({
          id: key,
          body: 'remote edit',
          vc: { source: 2 },
        }),
      id
    );
    await other.waitForFunction(
      () => globalThis.__receiveIsolation?.written,
      null,
      { timeout: 5000 }
    );
    await until(
      async () =>
        (await readSyncPeer(page, owner))?.record?.body ===
        'owner edit during receive',
      'owner edit survives a remote receive',
      20000
    );
    await until(
      async () =>
        (await readSyncPeer(other, id))?.record?.body === 'remote edit',
      'remote merge also completes',
      20000
    );
    const state = await other.evaluate(() => globalThis.__receiveIsolation);
    assert(
      state.triggered && state.written && !state.error,
      'one native owner write admitted during receive'
    );
    console.log('[sync-receive-isolation]', JSON.stringify(state));
  } finally {
    await other.evaluate(() => {
      globalThis.__restoreReceiveStringify?.();
      delete globalThis.__restoreReceiveStringify;
    });
  }
};
