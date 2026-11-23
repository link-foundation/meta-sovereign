/** Start the actual local Screen runner with no Node, npm or launcher on PATH. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { validateRunnerProfile } from '../../js/src/cli/runner-profile.js';
import { createRunnerController } from '../../js/src/server/runner-controller.js';
import {
  quoteRunnerArgument,
  runRunnerCommand,
} from '../../js/src/server/runner-transport.js';

const exec = promisify(execFile);
const root = resolve('.');
const fixture = await mkdtemp(join(tmpdir(), 'ms-private-node-'));
const bin = join(fixture, 'bin');
const home = join(fixture, "private home's space");
const cache = join(home, '.meta-sovereign-runner-tools');
const socket = join(fixture, 'screen');
const marker = join(home, 'owner-marker');
const corrupt = join(home, 'invalid-archive');
const offline = join(home, 'offline');
const downloads = join(home, 'downloads');
const command = async (name) =>
  (await exec('/bin/sh', ['-c', 'command -v "$1"', 'sh', name])).stdout.trim();
const port = await new Promise((resolvePort, reject) => {
  const listener = net.createServer();
  listener.once('error', reject);
  listener.listen(0, '127.0.0.1', () => {
    const { port } = listener.address();
    listener.close(() => resolvePort(port));
  });
});
const profile = validateRunnerProfile({
  session: `ms-private-node-${process.pid}`,
  local: {
    directory: root,
    cli: join(root, 'js/bin/meta-sovereign.js'),
    store: join(fixture, 'app store'),
    port,
  },
});
const controller = createRunnerController({
  directory: () => fixture,
  load: async () => profile,
  async run(target, argv, options) {
    const reply = await runRunnerCommand(target, argv, options);
    if (
      process.env.MS_RUNNER_NODE_DEBUG === '1' &&
      argv.includes('--isolated')
    ) {
      console.log(JSON.stringify({ phase: 'launch', ...reply }));
    }
    return reply;
  },
});
const start = () => controller.execute({ action: 'start', mode: 'local' });
const stop = () => controller.execute({ action: 'stop', mode: 'local' });
const ready = async () => {
  for (let pass = 0; pass < 35; pass++) {
    const result = await controller.execute({
      action: 'inspect',
      mode: 'local',
    });
    if (result.application.state === 'ready') {
      return;
    }
    await delay(150);
  }
  assert.fail('The owned Screen application did not report ready.');
};

let isolated = false;
try {
  for (const directory of [bin, home, socket]) {
    await mkdir(directory, { mode: 0o700 });
  }
  for (const name of [
    'bash',
    'cat',
    'chmod',
    'dirname',
    'env',
    'grep',
    'gzip',
    'id',
    'mkdir',
    'mktemp',
    'ps',
    'readlink',
    'rm',
    'screen',
    'sed',
    'sha256sum',
    'sh',
    'sleep',
    'stat',
    'tar',
    'uname',
    'which',
  ]) {
    await symlink(await command(name), join(bin, name));
  }
  await writeFile(
    join(bin, 'curl'),
    `#!/bin/sh
set -eu
printf 'called\n' >> "$HOME/downloads"
if [ -f "$HOME/offline" ]; then exit 1; fi
if [ -f "$HOME/invalid-archive" ]; then
  while [ "$1" != --output ]; do shift; done
  printf 'incorrect archive\n' > "$2"
  exit 0
fi
exec ${quoteRunnerArgument(await command('curl'))} "$@"
`,
    { mode: 0o700 }
  );
  await writeFile(marker, 'retain\n');
  process.env.HOME = home;
  process.env.PATH = bin;
  process.env.SCREENDIR = socket;
  isolated = true;

  assert.equal(
    (await controller.execute({ action: 'status' })).states.local,
    'stopped'
  );
  assert.equal(
    (await controller.execute({ action: 'inspect', mode: 'local' })).application
      .state,
    'stopped'
  );
  await assert.rejects(stat(cache), { code: 'ENOENT' });
  await assert.rejects(stat(downloads), { code: 'ENOENT' });

  await writeFile(corrupt, 'replace download with a corrupt archive');
  assert.equal((await start()).code, 'runner-runtime-unavailable');
  assert.deepEqual(await readdir(cache), []);
  assert.equal(await readFile(downloads, 'utf8'), 'called\n');
  await rm(corrupt);

  const cold = await start();
  assert.equal(cold.ok, true, JSON.stringify(cold));
  await ready();
  assert.equal((await stop()).ok, true);
  const cached = await readdir(cache);
  assert.equal(cached.length, 2);
  assert.equal(
    cached.filter((name) => name.startsWith('node-v26.13.0-')).length,
    1
  );
  assert.equal(await readFile(downloads, 'utf8'), 'called\ncalled\n');

  await writeFile(offline, 'refuse further downloads');
  const warm = await start();
  assert.equal(warm.ok, true, JSON.stringify(warm));
  await ready();
  assert.equal((await stop()).ok, true);
  assert.deepEqual(await readdir(cache), cached);
  assert.equal(await readFile(downloads, 'utf8'), 'called\ncalled\n');
  assert.equal(await readFile(marker, 'utf8'), 'retain\n');
  console.log(
    JSON.stringify({
      nodeOnPath: false,
      npmOnPath: false,
      nativeScreen: true,
      checksumRefusal: true,
      privateCache: true,
      coldAndWarmReady: true,
      stopConfirmed: true,
    })
  );
} finally {
  if (isolated) {
    assert.equal(
      (await stop()).states.local,
      'stopped',
      `Check owned fixture at ${fixture}`
    );
  }
  await rm(fixture, { recursive: true, force: true });
}
