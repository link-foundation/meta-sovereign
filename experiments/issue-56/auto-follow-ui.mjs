import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { startServer } from '../../js/src/server/index.js';
import { followAutoFixture } from '../../js/tests/helpers/follow-auto.mjs';
const f = await followAutoFixture();
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-auto-follow-ui-'));
const { telegramAccount: _account, ...timing } = f.options;
const server = await startServer({
  port: 0,
  store: f.vk.store,
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
    if (line.trim() === 'remove-first') {
      f.state.vkResponse = (call, answer) =>
        call.method === 'messages.getById' && call.params.message_ids === '100'
          ? { items: [] }
          : answer;
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
      sourceWrites: f.vk.calls.filter((c) =>
        ['messages.send', 'messages.delete'].includes(c.method)
      ),
      telegramWrites: f.member.writes.map((r) => ({ method: r.className })),
      vkJoins: f.joiningCalls
        .filter((c) => c.method === 'messages.joinChatByInviteLink')
        .map((c) => ({ method: c.method, link: c.params.link })),
    })
  );
}
