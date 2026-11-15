import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';

/** Owned synthetic server; no provider, real account, background sync or user data. */
export const diagnosticServer = async (options = {}) => {
  const dir = await mkdtemp(join(tmpdir(), 'ms-diagnostics-'));
  let server;
  try {
    server = await startServer({
      storeDir: dir,
      store: createMemoryStore(),
      port: 0,
      localUi: true,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false },
      log: null,
      ...options,
    });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    base: `http://127.0.0.1:${server.port}`,
    close: async () => {
      try {
        await server.close();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
};
