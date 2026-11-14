import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { startServer } from '../../js/src/server/index.js';
import { telegramBacklinksFixture } from '../../js/tests/helpers/telegram-backlinks.mjs';
const f = await telegramBacklinksFixture();
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-telegram-backlinks-ui-'));
const { telegramAccount: _account, ...timing } = f.options;
const server = await startServer({
  port: 0,
  store: f.store,
  storeDir: dir,
  localUi: true,
  telegramAccount: f.account,
  enableHandlers: false,
  enableSync: false,
  automations: { scheduler: false },
  log: null,
  follow: { backlinks: timing },
});
console.log(`http://127.0.0.1:${server.port}/#/automation`);
const input = createInterface({ input: process.stdin });
try {
  for await (const line of input) {
    if (line.trim() === 'channel') {
      f.state.entity = {
        className: 'Channel',
        id: 7n,
        title: 'Telegram supergroup',
        megagroup: true,
      };
    }
    if (line.trim() === 'quit') {
      break;
    }
  }
} finally {
  input.close();
  await server.close();
  await f.close();
  await rm(dir, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      writes: f.writes.map((r) => ({
        method: r.className,
        ...(r.revoke === undefined ? {} : { revoke: r.revoke }),
      })),
    })
  );
}
