import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const store = createMemoryStore();
const now = new Date(2026, 10, 10, 12);
for (const [chat, chatName] of [
  ['42', 'Ann Lee'],
  ['43', 'Bob Ray'],
  ['45', 'Eve Bell'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName,
    chatType: 'private',
    sender: chat,
    body: 'hello',
    timestamp: new Date(now.getTime() - 60000).toISOString(),
  });
  if (chat !== '42') {
    await store.put({
      id: `msg:telegram:${chat}:0`,
      source: 'telegram',
      chat,
      chatName,
      chatType: 'private',
      sender: 'me',
      body: 'Happy birthday!',
      timestamp: new Date(now.getTime() - 120000).toISOString(),
    });
  }
}
const storeDir = await mkdtemp(join(tmpdir(), 'birthday-selection-mcp-'));
let sends = 0;
const server = await startServer({
  store,
  storeDir,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
  automations: {
    scheduler: false,
    send: async () => {
      sends++;
      throw new Error('This read-only fixture has no provider sender');
    },
  },
});
console.log(
  JSON.stringify({
    base: `http://127.0.0.1:${server.port}`,
    pid: process.pid,
    liveProvider: false,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await server.close();
    await rm(storeDir, { recursive: true, force: true });
    console.log(
      JSON.stringify({ sends, resourcesClosed: true, liveProvider: false })
    );
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
