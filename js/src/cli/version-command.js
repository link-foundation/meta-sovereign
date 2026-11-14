import { readFile } from 'node:fs/promises';

/** Read the installed package without loading provider or server commands. */
export const versionCmd = async (_args, log) => {
  const pkg = new URL('../../../package.json', import.meta.url);
  log(JSON.parse(await readFile(pkg, 'utf8')).version);
  return 0;
};
