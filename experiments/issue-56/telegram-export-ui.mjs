// Offline before/after review fixture. No credentials or external requests.
// Newline or SIGINT closes the ephemeral server and removes its output files.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createHistoryExport } from '../../js/src/sources/telegram-export.js';
import { helpers, photo } from '../../js/tests/helpers/export-fakes.mjs';
import {
  at,
  windowApi,
  windowClient,
} from '../../js/tests/helpers/export-window-fakes.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'issue-56-export-'));
const store = createMemoryStore();
await store.put({
  id: 'msg:telegram:-10099:3',
  source: 'telegram',
  chat: '-10099',
  chatName: 'Export team',
  chatType: 'group',
  body: 'Review notes and attachments',
  sender: '7',
  senderName: 'Alice',
  timestamp: new Date().toISOString(),
  raw: { id: 3 },
});
const { client } = windowClient({
  '-10099': [
    at(1, 1),
    at(2, 8, { message: 'Review notes', media: photo }),
    at(3, 9, { message: 'Keep the attachment with the conversation.' }),
  ],
});
const exporter = createHistoryExport(
  {
    importer: async () => ({ Api: windowApi, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    store,
  },
  { userClient: async () => client, home: root }
);
const account = {
  ...exporter,
  stop: async () => {},
  status: async () => ({
    connected: true,
    kind: 'user',
    account: { username: 'owner' },
  }),
  history: async () => ({ written: 0, cached: true, complete: true }),
  chatInfo: async () => ({ kind: 'channel', title: 'Export team' }),
  sharedCounts: async () => ({ ok: true, counts: {} }),
};
const handle = await startServer({
  store,
  port: 0,
  localUi: true,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: account,
  automations: { scheduler: false },
});
try {
  console.log(
    JSON.stringify({ origin: `http://127.0.0.1:${handle.port}`, root })
  );
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await handle.close();
  await rm(root, { recursive: true, force: true });
  process.stdin.pause();
}
