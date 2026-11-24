// Isolated production UI with owned offline Telegram membership operations.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { followTelegramFixture } from '../../js/tests/helpers/follow-telegram.mjs';
const f = followTelegramFixture();
f.state.member = false;
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-follow-telegram-ui-'));
const handle = await startServer({
  store: f.store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: f.account,
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
