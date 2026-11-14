// Isolated production UI and SDK-shaped Telegram fixture; no external writes.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { groupGreetingFixture } from '../../js/tests/helpers/group-greeting-fakes.mjs';
import { userOf } from '../../js/tests/helpers/chat-users-fakes.mjs';

const f = await groupGreetingFixture({
  now: () => Date.UTC(2026, 10, 10, 12),
  participants: [
    userOf(2),
    userOf(3),
    userOf(4, { verified: true }),
    userOf(5, { bot: true }),
    userOf(6),
  ],
  fullUser: async (id) => ({
    fullUser: {
      className: 'UserFull',
      id: BigInt(id),
      ...(id === '6' ? { businessIntro: {} } : {}),
    },
  }),
});
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-group-greeting-ui-'));
const handle = await startServer({
  store: f.store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  telegramAccount: {
    ...f.catalog,
    ...f.actions,
    ...f.account,
    stickerPanel: async () => ({ ok: true, recent: [], faved: [], sets: [] }),
    stickerSearch: async () => ({ ok: true, stickers: [], sets: [] }),
    callsList: async () => ({ ok: true, calls: [], next: null }),
    status: async () => ({
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
    }),
    stop: async () => {
      await f.env.chatUsersStop();
      await f.env.greetingSendStop();
      await f.env.greetingStickersStop();
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
