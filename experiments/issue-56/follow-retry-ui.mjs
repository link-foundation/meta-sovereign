// Isolated production controls for both read-only Follow providers.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { followTelegramFixture } from '../../js/tests/helpers/follow-telegram.mjs';
import { followChatsFixture } from '../../js/tests/helpers/follow-chats.mjs';

const vk = await followChatsFixture();
const telegram = followTelegramFixture({ store: vk.store });
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-follow-retry-ui-'));
const server = await startServer({
  store: vk.store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: telegram.account,
  automations: { scheduler: false },
  ...vk.serverOptions,
});
console.log(JSON.stringify({ origin: `http://127.0.0.1:${server.port}` }));
try {
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await server.close();
  await vk.discovery.stop?.();
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
