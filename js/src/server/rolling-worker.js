// A replaceable application worker. Its host owns the public TLS listener.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { openDualStore, openWarmDualStore } from '../storage/dual-store.js';
import { startServer } from './index.js';
import { accountDir } from './telegram-extras.js';

const entriesOf = (checkpoints) =>
  Object.entries(checkpoints ?? {}).map(([slot, checkpoint]) => [
    Number(slot),
    checkpoint,
  ]);

const retentionOf = (stores) =>
  [...stores].map(([account, store]) => ({
    account,
    retention: store.memoryStats?.() ?? null,
  }));

const openOwnedStore = async (dir, checkpoint, log) =>
  checkpoint
    ? openWarmDualStore(dir, checkpoint, {
        onError: (error) =>
          log({
            level: 'warn',
            event: 'store_snapshot_failed',
            error: error.message,
          }),
      })
    : openDualStore(dir);

const closeOwnedStores = async (stores) => {
  for (const store of stores.values()) {
    if (!store._handoffReleased) {
      await store.releaseForHandoff().catch(() => {});
    }
    await store.close();
  }
};

export const createRollingWorker = async ({
  storeDir,
  options = {},
  front,
  checkpoints,
  log = () => {},
}) => {
  const stores = new Map();
  let handle = null;
  let suspended = false;
  let unlockOnResume = false;
  let currentFront = { ...front, warming: Boolean(checkpoints) };
  const directory = (slot) =>
    slot === 1 ? storeDir : accountDir(storeDir, slot);
  const own = async (slot, checkpoint) => {
    if (!stores.has(slot)) {
      const dir = directory(slot);
      const store = await openOwnedStore(dir, checkpoint, log);
      stores.set(slot, store);
    }
    return stores.get(slot);
  };
  for (const [slot, checkpoint] of entriesOf(checkpoints)) {
    await own(slot, checkpoint);
  }
  const home = await own(1);
  const start = async () => {
    await fs.mkdir(path.join(storeDir, 'archives'), {
      recursive: true,
      mode: 0o700,
    });
    handle = await startServer({
      ...options,
      port: 0,
      tls: false,
      storeDir,
      store: home,
      archiveDir: path.join(storeDir, 'archives'),
      log,
      front: currentFront,
      telegramExtraStore: async (slot) => ({
        store: await own(slot),
        dir: directory(slot),
      }),
    });
    return handle.port;
  };
  await start();
  const resume = async () => {
    for (const store of stores.values()) {
      if (store._handoffReleased) {
        await store.promote();
        store._handoffReleased = false;
      }
    }
    currentFront = { ...front, warming: false };
    suspended = false;
    const port = await start();
    if (unlockOnResume) {
      handle.inheritUnlock();
    }
    return port;
  };
  const close = async () => {
    await handle?.close({ handoff: true });
    await closeOwnedStores(stores);
  };
  return {
    get port() {
      return handle.port;
    },
    resourceStats: () => retentionOf(stores),
    prepare: async () => {
      const result = {};
      for (const [slot, store] of stores) {
        result[slot] = await store.prepareHandoff();
      }
      return result;
    },
    cancel: () => stores.forEach((store) => store.cancelHandoff()),
    warm: async (extra) => {
      Object.assign(checkpoints, extra);
      for (const [slot, checkpoint] of entriesOf(extra)) {
        await own(slot, checkpoint);
      }
    },
    async suspend() {
      const passcode = await handle.passcodeState();
      unlockOnResume = passcode.enabled && !passcode.locked;
      await handle.drain();
      log({
        level: 'debug',
        event: 'server_handoff',
        phase: 'requests-drained',
      });
      await handle.close({ handoff: true });
      log({
        level: 'debug',
        event: 'server_handoff',
        phase: 'services-stopped',
      });
      try {
        for (const store of stores.values()) {
          await store.releaseForHandoff();
          log({
            level: 'debug',
            event: 'server_handoff',
            phase: 'writer-released',
          });
          store._handoffReleased = true;
        }
        suspended = true;
        return {
          unlocked: passcode.enabled && !passcode.locked,
          slots: [...stores.keys()],
        };
      } catch (error) {
        const port = await resume();
        throw Object.assign(error, { port });
      }
    },
    async activate({ unlocked = false, slots = [...stores.keys()] } = {}) {
      const promoted = [];
      try {
        for (const slot of slots) {
          const store = stores.get(slot);
          await store.promote(checkpoints[slot]);
          promoted.push(store);
        }
        if (unlocked) {
          handle.inheritUnlock();
        }
        handle.activate();
        currentFront.warming = false;
        return { port: handle.port };
      } catch (error) {
        for (const store of promoted) {
          await store.releaseForHandoff();
          store._handoffReleased = true;
        }
        throw error;
      }
    },
    restore: async () => ({ port: suspended ? await resume() : handle.port }),
    close,
  };
};
