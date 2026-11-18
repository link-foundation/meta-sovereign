// Isolated UI fixture: an acknowledged subset and an uncertain chat removal.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';

const store = createMemoryStore();
await store.put({
  id: 'msg:telegram:-1007:1',
  source: 'telegram',
  chat: '-1007',
  chatName: 'Study circle',
  chatType: 'channel',
  sender: '2',
  body: 'History retained until a confirmed leave.',
  timestamp: new Date().toISOString(),
});
const channels = [1, 2].map((id) => ({
  chat: `-100${id}`,
  title: `Quiet channel ${id}`,
  date: 1_700_000_000,
  broadcast: true,
}));
const account = {
  status: async () => ({
    connected: true,
    kind: 'user',
    account: { username: 'offline_owner' },
  }),
  callsList: async () => ({ ok: true, calls: [], next: null }),
  history: async () => ({ written: 0, complete: true }),
  inactiveChannels: async () => ({ ok: true, channels }),
  leaveChannels: async ({ chats }) => ({ ok: true, left: chats.slice(0, 1) }),
  removeChat: async () => ({ ok: false, code: 'outcome-unknown' }),
  stop: async () => {},
};
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-shared-leave-ui-'));
const handle = await startServer({
  store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: account,
  automations: { scheduler: false },
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
