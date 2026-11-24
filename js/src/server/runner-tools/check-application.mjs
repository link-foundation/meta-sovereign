// This module runs in the selected Node runtime, including inside Docker.
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

const load = (root, entry) => import(pathToFileURL(join(root, entry)).href);

const lockDigest = async (directory) => {
  const file = join(directory, 'package-lock.json');
  const info = await lstat(file);
  return info.isFile() && info.size <= 2 * 1024 * 1024
    ? createHash('sha256')
        .update(await readFile(file))
        .digest('hex')
    : null;
};

const preparedLockMatches = async (root, lock) => {
  const modules = await realpath(join(root, 'node_modules'));
  const stage = dirname(modules);
  return (
    modules === join(stage, 'node_modules') &&
    dirname(stage) === join(root, '.meta-sovereign-runner-app') &&
    (await lockDigest(root)) === lock &&
    (await lockDigest(stage)) === lock
  );
};

const check = async (cli, lock) => {
  const root = dirname(dirname(dirname(await realpath(cli))));
  const manifest = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8')
  );
  if (manifest.name !== 'meta-sovereign') {
    return lock ? null : 'custom';
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
  if (lock && !(await preparedLockMatches(root, lock))) {
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
  const result = await check(process.argv[1], process.argv[2]);
  if (result) {
    process.stdout.write(result);
  } else {
    process.exitCode = 1;
  }
} catch {
  process.exitCode = 1;
}
