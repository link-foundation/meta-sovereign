import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import { withLoggedSession } from '../../js/src/server/log-session.js';

/** Explicitly owned private log with a synthetic memory store and no providers. */
export const runnerLogServer = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ms-runner-log-'));
  const store = createMemoryStore();
  let handle;
  try {
    handle = await withLoggedSession({ storeDir: dir }, (options) =>
      startServer({
        ...options,
        store,
        port: 0,
        localUi: true,
        enableSync: false,
        enableHandlers: false,
        telegramAccount: false,
        automations: { scheduler: false },
      })
    );
    return {
      dir,
      store,
      base: `http://127.0.0.1:${handle.port}`,
      close: async () => {
        try {
          await handle.close();
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await handle?.close();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
};
