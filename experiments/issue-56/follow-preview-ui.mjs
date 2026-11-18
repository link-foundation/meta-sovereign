// Isolated production UI for cancelling a read-only backlink review.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { startServer } from '../../js/src/server/index.js';
import { followReadWait } from '../../js/src/follow/read-policy.js';
import { followBacklinksFixture } from '../../js/tests/helpers/follow-backlinks.mjs';

const f = await followBacklinksFixture();
const failing = () => {
  f.state.before = (call) => {
    if (call.method === 'users.get') {
      throw Object.assign(new Error('fixture timeout'), { code: 'ETIMEDOUT' });
    }
  };
  f.state.sleep = followReadWait;
};
failing();
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-follow-preview-ui-'));
const server = await startServer({
  port: 0,
  store: f.store,
  storeDir: dir,
  localUi: true,
  telegramAccount: false,
  enableHandlers: false,
  enableSync: false,
  automations: { scheduler: false },
  log: null,
  follow: { backlinks: f.options },
});
console.log(`http://127.0.0.1:${server.port}/#/automation`);
const input = createInterface({ input: process.stdin });
try {
  for await (const line of input) {
    if (line.trim() === 'timeout') {
      failing();
    }
    if (line.trim() === 'recover') {
      f.state.before = undefined;
      f.state.sleep = undefined;
    }
    if (line.trim() === 'quit') {
      break;
    }
  }
} finally {
  input.close();
  await server.close();
  await f.service.stop();
  await rm(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ calls: f.calls.map((call) => call.method) }));
}
