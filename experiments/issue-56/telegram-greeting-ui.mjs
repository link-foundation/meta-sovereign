// Production UI with a bounded fake Telegram account. No external provider calls.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { greetingSendFixture } from '../../js/tests/helpers/greeting-send-fakes.mjs';

const fixture = await greetingSendFixture({
  now: () => Date.UTC(2026, 10, 10, 12),
});
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-greeting-ui-'));
const handle = await startServer({
  store: fixture.store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  telegramAccount: {
    ...fixture.catalog,
    ...fixture.actions,
    stickerPanel: async () => ({ ok: true, recent: [], faved: [], sets: [] }),
    stickerSearch: async () => ({ ok: true, stickers: [], sets: [] }),
    callsList: async () => ({ ok: true, calls: [], next: null }),
    status: async () => ({
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
    }),
    stop: async () => {
      await fixture.env.greetingSendStop();
      await fixture.env.greetingStickersStop();
    },
  },
});
console.log(JSON.stringify({ origin: `http://127.0.0.1:${handle.port}` }));
try {
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await handle.close();
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
