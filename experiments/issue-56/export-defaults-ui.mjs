// Isolated export fixture for delayed-default browser checks; no live account.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createHistoryExport } from '../../js/src/sources/telegram-export.js';
import { FIXTURE, helpers } from '../../js/tests/helpers/export-fakes.mjs';
import {
  windowApi as Api,
  windowClient,
} from '../../js/tests/helpers/export-window-fakes.mjs';

const store = createMemoryStore();
await store.put({
  id: 'msg:telegram:7:1',
  source: 'telegram',
  chat: '7',
  chatName: 'Alice Liddell',
  chatType: 'private',
  sender: '7',
  senderName: 'Alice Liddell',
  body: 'Synthetic export fixture',
  timestamp: new Date().toISOString(),
  raw: { id: 1 },
});
const root = await mkdtemp(path.join(os.tmpdir(), 'ms-export-defaults-ui-'));
const { client } = windowClient(
  { 7: FIXTURE.slice(0, 6) },
  {
    onDownload: async () => {
      throw new Error('FILE_REFERENCE_EXPIRED');
    },
  }
);
const account = createHistoryExport(
  {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_client, chat, use) => use({ chat }) },
    store,
    sleep: async () => {},
  },
  {
    userClient: async () => client,
    mediaDir: path.join(root, 'appstore', 'media', 'telegram'),
    home: root,
    reveal: async () => {},
  }
);
const server = await startServer({
  port: 0,
  store,
  storeDir: path.join(root, 'appstore'),
  localUi: true,
  telegramAccount: { ...account, stop: async () => {} },
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  log: null,
});
console.log(JSON.stringify({ url: `http://127.0.0.1:${server.port}`, root }));
try {
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  await server.close();
  await rm(root, { recursive: true, force: true });
  process.stdin.pause();
}
