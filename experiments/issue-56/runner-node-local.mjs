/** Start an actual Screen runner with no Node, npm or launcher on its PATH. */
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
import { createRunnerLauncherPreparation } from '../../js/src/server/runner-dependencies.js';
import { createRunnerRuntimePreparation } from '../../js/src/server/runner-node.js';
import {
  createRunnerTransport,
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
const host = process.env.RUNNER_PRIVATE_NODE_HOST;
const mode = host ? 'server' : 'local';
const executionEnvironment = { HOME: home, PATH: bin, SCREENDIR: socket };
const withEnvironment = (transport) => (target, argv, options) =>
  transport(
    target,
    host
      ? [
          'env',
          ...Object.entries(executionEnvironment).map(
            ([key, value]) => `${key}=${value}`
          ),
          ...argv,
        ]
      : argv,
    options
  );
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
  [mode]: {
    ...(host ? { host } : {}),
    directory: root,
    cli: join(root, 'js/bin/meta-sovereign.js'),
    store: join(fixture, 'app store'),
    port,
  },
});
const transport = withEnvironment(runRunnerCommand);
const controller = createRunnerController({
  directory: () => fixture,
  load: async () => profile,
  ...(host
    ? {
        prepareRuntime: createRunnerRuntimePreparation({
          probe: transport,
          install: withEnvironment(
            createRunnerTransport({ deadlineMs: 90000 })
          ),
        }),
        prepareLauncher: createRunnerLauncherPreparation({
          probe: transport,
          run: withEnvironment(createRunnerTransport({ deadlineMs: 100000 })),
        }),
      }
    : {}),
  async run(target, argv, options) {
    const reply = await transport(target, argv, options);
    if (
      process.env.MS_RUNNER_NODE_DEBUG === '1' &&
      (argv.includes('--isolated') || host)
    ) {
      console.log(
        JSON.stringify({
          phase: argv.includes('--isolated') ? 'launch' : argv[0],
          ...reply,
        })
      );
    }
    return reply;
  },
});
let startAttempted = false;
const start = () => {
  startAttempted = true;
  return controller.execute({ action: 'start', mode });
};
const stop = () => controller.execute({ action: 'stop', mode });
const ready = async () => {
  for (let pass = 0; pass < 35; pass++) {
    const result = await controller.execute({
      action: 'inspect',
      mode,
    });
    if (result.application.state === 'ready') {
      return;
    }
    await delay(150);
  }
  assert.fail('The owned Screen application did not report ready.');
};

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
  if (!host) {
    Object.assign(process.env, executionEnvironment);
  }
  assert.equal(
    (await controller.execute({ action: 'status' })).states[mode],
    'stopped'
  );
  assert.equal(
    (await controller.execute({ action: 'inspect', mode })).application.state,
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
      ...(host ? { actualSsh: true } : {}),
    })
  );
} finally {
  if (startAttempted) {
    assert.equal(
      (await stop()).states[mode],
      'stopped',
      `Check owned fixture at ${fixture}`
    );
  }
  await rm(fixture, { recursive: true, force: true });
}
