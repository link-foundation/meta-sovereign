// Seeds a real on-disk store with two dormant VK dialogs (one on "ты",
// one on "вы"), then runs issue #31's automation from the terminal:
// plan (preview), run (safe mode queues drafts), review with scripted
// answers (switch the form, mark one sent by hand, skip the other),
// and plans again from a reopened store to check that the decisions
// persist as the cooldown.
//
//   node experiments/automations-cli-roundtrip.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createDualStore,
  createLinoTextStore,
  createDoubletsStore,
} from '../js/src/storage/index.js';
import { buildMessageLink } from '../js/src/sources/link.js';
import { createAutomationCommands } from '../js/src/cli/automation-commands.js';

const dir = mkdtempSync(path.join(tmpdir(), 'automations-'));
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
await store.close?.();

const answers = ['f', 'm', 's'];
const { automations } = createAutomationCommands({
  openStore: open,
  ask: async (q) => {
    const answer = answers.shift() ?? 'q';
    process.stdout.write(`${q}${answer}\n`);
    return answer;
  },
  send: async () => {
    throw new Error('this experiment never sends');
  },
  setTyping: async () => {},
  sleep: async () => {},
});
const log = (line) => console.log(line);
const id = 'reengage-dormant';
for (const sub of [['plan', id], ['run', id], ['review'], ['history']]) {
  console.log(`\n$ meta-sovereign automations ${sub.join(' ')}`);
  await automations({ _: sub, store: dir }, log);
}
console.log('\n$ meta-sovereign automations plan reengage-dormant  # again');
await automations({ _: ['plan', id], store: dir }, log);
