import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { checkReceiveIsolation } from '../../js/tests/helpers/e2e-sync-receive-isolation.mjs';
import {
  installSyncFrameGate,
  withPausedSyncFrames,
} from '../../js/tests/helpers/e2e-sync-frame-gate.mjs';
import {
  prepareSyncPeer,
  stopSyncPeer,
} from '../../js/tests/helpers/e2e-sync-peer.mjs';

// One bounded inactive-tab scheduling probe: pause only frame callbacks in the
// receiving page. Native RTC, timers, persistence and API mutations still run.
const { page, base, until, finish, engine } = await openChatApp(
  'sync-isolation-polling',
  { store: createMemoryStore(), serverOptions: { enableSync: true } }
);
await finish(async () => {
  const context = await page.context().browser().newContext();
  const other = await context.newPage();
  try {
    await installSyncFrameGate(other);
    for (const target of [page, other]) {
      await prepareSyncPeer(target, base, engine);
    }
    try {
      await withPausedSyncFrames(other, () =>
        checkReceiveIsolation({ page, other, until })
      );
    } finally {
      const state = await other.evaluate(async () => ({
        ...globalThis.__receiveIsolation,
        merged:
          (await globalThis.__msApi.get('l:receive-isolation-record'))?.body ===
          'remote edit',
      }));
      const replicated = await page.evaluate(
        async () =>
          (await globalThis.__msApi.get('l:receive-isolation-owner'))?.body ===
          'owner edit during receive'
      );
      console.log(
        '[sync-isolation-polling]',
        JSON.stringify({ ...state, replicated })
      );
    }
  } finally {
    for (const target of [page, other]) {
      await stopSyncPeer(target);
    }
    await context.close();
  }
});
