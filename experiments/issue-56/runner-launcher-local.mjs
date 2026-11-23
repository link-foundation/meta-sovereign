/** Finite local preparation and Screen proof with an empty private home. */
import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRunnerController } from '../../js/src/server/runner-controller.js';
import { validateRunnerProfile } from '../../js/src/cli/runner-profile.js';
import { createRunnerLauncherPreparation } from '../../js/src/server/runner-dependencies.js';
import {
  createRunnerTransport,
  runRunnerCommand,
} from '../../js/src/server/runner-transport.js';

const fixture = await mkdtemp(join(tmpdir(), 'ms-runner-launcher-'));
const root = resolve('.');
const screen = join(fixture, 'screen');
const cache = join(fixture, '.meta-sovereign-runner-tools');
const unrelated = join(fixture, 'unrelated');
const refusedNpm = join(fixture, 'refused-bin');
const port = await new Promise((resolvePort, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const { port } = socket.address();
    socket.close(() => resolvePort(port));
  });
});
const profile = validateRunnerProfile({
  session: `ms-prepared-${process.pid}`,
  local: {
    directory: root,
    cli: join(root, 'js/bin/meta-sovereign.js'),
    store: join(fixture, 'app store'),
    port,
    node: process.execPath,
  },
});
await mkdir(screen, { mode: 0o700 });
await mkdir(unrelated);
await mkdir(refusedNpm);
const marker = join(unrelated, 'owner-marker');
await writeFile(marker, 'untouched\n');
const npmMark = join(fixture, 'npm-called');
await writeFile(
  join(refusedNpm, 'npm'),
  '#!/bin/sh\nset -eu\nprintf "called\n" >"$HOME/npm-called"\nmkdir node_modules\nexit 1\n',
  { mode: 0o700 }
);
let refuseInstall = true;
const env = ['env', `HOME=${fixture}`, `SCREENDIR=${screen}`];
const isolated = (transport) => async (target, argv, options) => {
  const preferred = refuseInstall ? `${refusedNpm}:` : '';
  const lookup = `PATH=${preferred}${dirname(process.execPath)}:/usr/bin:/bin`;
  return transport(target, [...env, lookup, ...argv], options);
};
const run = isolated(runRunnerCommand);
const prepareLauncher = createRunnerLauncherPreparation({
  probe: run,
  run: isolated(createRunnerTransport({ deadlineMs: 100000 })),
});
const controller = createRunnerController({
  directory: () => fixture,
  load: async () => profile,
  run,
  prepareLauncher,
});
try {
  assert.equal(
    (await controller.execute({ action: 'status' })).states.local,
    'stopped'
  );
  await assert.rejects(stat(cache), { code: 'ENOENT' });
  const start = () => controller.execute({ action: 'start', mode: 'local' });
  await symlink(unrelated, cache);
  assert.equal((await start()).code, 'runner-launcher-unavailable');
  assert.equal(await readFile(marker, 'utf8'), 'untouched\n');
  await assert.rejects(stat(npmMark), { code: 'ENOENT' });
  await unlink(cache);
  assert.equal((await start()).code, 'runner-launcher-unavailable');
  assert.equal(await readFile(npmMark, 'utf8'), 'called\n');
  assert.deepEqual(await readdir(cache), []);
  await unlink(npmMark);
  for (let attempt = 0; attempt < 2; attempt++) {
    refuseInstall = attempt === 1;
    const started = await start();
    assert.equal(started.ok, true, JSON.stringify(started));
    let health;
    for (let poll = 0; poll < 30; poll++) {
      health = await controller.execute({ action: 'inspect', mode: 'local' });
      if (health.application.state === 'ready') {
        break;
      }
      await delay(200);
    }
    assert.equal(health.application.state, 'ready', JSON.stringify(health));
    assert.equal(
      (await controller.execute({ action: 'stop', mode: 'local' })).ok,
      true
    );
  }
  assert.equal((await stat(cache)).mode & 0o777, 0o700);
  assert.equal((await readdir(cache)).length, 1);
  await assert.rejects(stat(npmMark), { code: 'ENOENT' });
  console.log(
    JSON.stringify({
      unsafePathRefused: true,
      partialInstallCleaned: true,
      coldPreparation: true,
      warmReuseWithoutNpm: true,
      readyStarts: 2,
      nativeScreen: true,
    })
  );
} finally {
  const stopped = await controller.execute({ action: 'stop', mode: 'local' });
  if (stopped.states.local === 'stopped') {
    await rm(fixture, { recursive: true, force: true });
  }
  assert.equal(
    stopped.states.local,
    'stopped',
    `Check owned fixture at ${fixture}`
  );
}
