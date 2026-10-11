// Seeds a real on-disk store with a VK dialog and a Telegram export,
// then runs `reengage` twice to check that decisions persist.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../js/src/cli/index.js';
import {
  createDualStore,
  createLinoTextStore,
  createDoubletsStore,
} from '../js/src/storage/index.js';
import { buildMessageLink } from '../js/src/sources/link.js';
import { createReengageCommands } from '../js/src/cli/reengage-commands.js';

const dir = mkdtempSync(path.join(tmpdir(), 'reengage-'));
const open = async () =>
  createDualStore({
    binary: await createDoubletsStore(path.join(dir, 'data.bin')),
    text: await createLinoTextStore(path.join(dir, 'data.lino')),
  });
const store = await open();
const day = 864e5;
const at = (d) => new Date(Date.now() - d * day).toISOString();
let n = 0;
for (const [chat, sender, body, d] of [
  ['101', 'me', 'Привет, как ты?', 130],
  ['101', '555', 'Норм, а ты?', 120],
  ['102', 'me', 'Здравствуйте, вы сможете помочь?', 200],
  ['102', '777', 'Да', 200],
]) {
  await store.put(
    buildMessageLink({
      source: 'vk',
      externalId: String((n += 1)),
      sender,
      chat,
      body,
      timestamp: at(d),
    })
  );
}
const log = (m) => console.log(m);
await runCli(['reengage', '--store', dir], { log });
const cmds = createReengageCommands({
  openStore: open,
  ask: async (q) => (process.stdout.write(`${q}m\n`), 'm'),
});
await cmds.reengage({ store: dir, interactive: true, limit: '1' }, log);
const reopened = await open();
console.log(
  JSON.stringify(
    await reopened.query((l) => l.id.startsWith('reengage:')),
    null,
    1
  )
);
await runCli(['reengage', '--store', dir], { log });
