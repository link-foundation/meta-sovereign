// This module runs in the selected Node runtime, including inside Docker.
import { readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

const load = (root, entry) => import(pathToFileURL(join(root, entry)).href);

const check = async (cli) => {
  const root = dirname(dirname(dirname(await realpath(cli))));
  const manifest = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8')
  );
  if (manifest.name !== 'meta-sovereign') {
    return 'custom';
  }
  const server = 'js/src/server/index.js';
  const command = 'js/src/cli/index.js';
  if (
    manifest.type !== 'module' ||
    manifest.bin?.['meta-sovereign'] !== 'js/bin/meta-sovereign.js' ||
    manifest.exports?.['./server'] !== `./${server}` ||
    manifest.exports?.['./cli'] !== `./${command}`
  ) {
    return null;
  }
  const [{ startServer }, { runCli }, { serveCmd }] = await Promise.all([
    load(root, server),
    load(root, command),
    load(root, 'js/src/cli/serve-command.js'),
  ]);
  return [startServer, runCli, serveCmd].every(
    (value) => typeof value === 'function'
  )
    ? 'loaded'
    : null;
};

// Bound the in-container probe even if SSH disconnects while importing.
setTimeout(() => process.exit(1), 7000).unref();
try {
  const result = await check(process.argv[1]);
  if (result) {
    process.stdout.write(result);
  } else {
    process.exitCode = 1;
  }
} catch {
  process.exitCode = 1;
}
