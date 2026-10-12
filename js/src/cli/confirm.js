// Before a CLI command writes to another service (sends, posts,
// updates a CV): `--yes` confirms for scripts; otherwise the user is
// asked y/N on a terminal. Without a terminal and without `--yes`,
// nothing is sent.

import { createInterface } from 'node:readline/promises';

export const confirmCli = async (
  question,
  {
    args = {},
    log = () => {},
    ask = null,
    input = process.stdin,
    output = process.stdout,
  } = {}
) => {
  if (args.yes === true || args.yes === 'true') {
    return true;
  }
  if (ask) {
    return Boolean(await ask(question));
  }
  if (!input.isTTY) {
    log(`${question} Not sent: pass --yes to confirm without a terminal.`);
    return false;
  }
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
};
