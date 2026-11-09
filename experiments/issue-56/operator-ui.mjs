// Isolated Operator history fixture. No account, scheduler or provider sends.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-operator-ui-'));
const store = createMemoryStore();
for (const chat of ['111', '222']) {
  await store.put({
    id: `msg:hh:${chat}:2`,
    source: 'hh',
    chat,
    chatName: `Person ${chat}`,
    chatType: 'personal_chat',
    sender: chat,
    body: `Unread question ${chat}`,
    raw: { id: 2 },
    timestamp: `2026-11-09T10:0${chat === '111' ? 1 : 2}:00Z`,
  });
  await store.put({
    id: `read:hh:${chat}`,
    source: 'hh',
    chat,
    kind: 'read',
    inboxMaxId: 1,
    unreadCount: 1,
    unreadTopId: 2,
  });
}
const server = await startServer({
  store,
  storeDir: dir,
  localUi: true,
  port: 0,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  automations: { scheduler: false },
});
try {
  console.log(JSON.stringify({ origin: `http://127.0.0.1:${server.port}` }));
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await server.close();
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
