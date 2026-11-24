/** Finite real Docker/SSH proof; no credentials, providers or user stores. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { validateRunnerProfile } from '../../js/src/cli/runner-profile.js';
import { createRunnerControl } from '../../js/src/server/runner-control.js';
import { inspectRunnerApplication } from '../../js/src/server/runner-inspection.js';
import {
  createRunnerTransport,
  runRunnerCommand,
} from '../../js/src/server/runner-transport.js';
import { createRunnerLauncherPreparation } from '../../js/src/server/runner-dependencies.js';
import { runnerGraphFixture } from './runner-graph-fixture.mjs';

const exec = promisify(execFile);
const fixture = process.env.RUNNER_DOCKER_FIXTURE;
const isolation = process.env.RUNNER_SERVER_ISOLATION ?? 'docker';
assert(['docker', 'screen'].includes(isolation));
const docker = isolation === 'docker';
assert(fixture && process.env.RUNNER_DOCKER_IMAGE);
const root = resolve('.');
const session = `ms-runner-${isolation}-${process.pid}`;
const home = join(fixture, 'launcher home');
const store = join(fixture, 'private store, "quoted"');
await mkdir(store);
const localStore = join(fixture, 'local store');
await mkdir(localStore);
await mkdir(home, { mode: 0o700 });
const targets = validateRunnerProfile({
  session,
  local: {
    directory: root,
    cli: join(root, 'js/bin/meta-sovereign.js'),
    store: localStore,
    port: 18787,
    node: process.execPath,
  },
  server: {
    host: 'runner-docker-fixture',
    directory: root,
    cli: join(root, 'js/bin/meta-sovereign.js'),
    store,
    port: 8787,
    isolation,
    ...(docker
      ? { image: process.env.RUNNER_DOCKER_IMAGE }
      : { node: process.execPath }),
  },
});
const target = targets.server;
const calls = [];
const preparations = [];
let refuseCleanup = false;
const isolatedEnvironment = [
  'env',
  `HOME=${home}`,
  `PATH=${dirname(process.execPath)}:/usr/bin:/bin`,
];
const withEnvironment = (transport) => (selected, argv, options) =>
  transport(selected, [...isolatedEnvironment, ...argv], options);
const prepareLauncher = createRunnerLauncherPreparation({
  probe: withEnvironment(runRunnerCommand),
  run: withEnvironment(createRunnerTransport({ deadlineMs: 100000 })),
});
const run = async (selected, argv, options) => {
  calls.push(argv);
  const command =
    refuseCleanup && argv[0] === 'docker' && argv[2] === 'rm'
      ? argv.slice(0, 3)
      : argv;
  const result = await runRunnerCommand(selected, command, options);
  if (result.code !== 0 && !['screen'].includes(argv[0])) {
    console.log(
      JSON.stringify({ command: argv[0], operation: argv[2], ...result })
    );
  }
  return result;
};
const control = createRunnerControl({
  targets,
  run,
  async prepareLauncher(selected, options) {
    const prefix = await prepareLauncher(selected, options);
    assert.equal(prefix?.length, 2);
    preparations.push(prefix);
    return prefix;
  },
});
const launches = () => calls.filter((argv) => argv.includes('--isolated'));
const poll = async (read, expected) => {
  for (let attempt = 0; attempt < 40; attempt++) {
    if ((await read()) === expected) {
      return;
    }
    await pause(100);
  }
  assert.equal(await read(), expected);
};
try {
  // Readiness polling belongs only to this finite server fixture.
  await poll(async () => (await control.status()).states.server, 'stopped');
  assert.equal(launches().length, 0);
  assert.deepEqual(preparations, []);
  assert.equal((await control.act('start', 'server')).ok, true);
  await poll(() => inspectRunnerApplication(target, run), 'ready');
  await writeFile(join(store, 'owner-marker'), 'retained private data\n');
  assert.equal((await control.act('start', 'server')).ok, true);
  assert.equal(launches().length, 1);
  assert.equal(preparations.length, 1);
  assert.equal((await control.act('stop', 'server')).states.server, 'stopped');
  assert.equal((await control.act('start', 'local')).ok, true);
  await poll(() => inspectRunnerApplication(targets.local, run), 'ready');
  const missing = createRunnerControl({
    targets: {
      ...targets,
      server: { ...target, cli: join(root, session, "missing owner's CLI") },
    },
    run,
  });
  assert.deepEqual(await missing.act('start', 'server'), {
    ok: false,
    code: 'runner-application-unavailable',
    states: { local: 'running', server: 'stopped' },
  });
  assert.equal(launches().length, 2);
  assert.equal(await inspectRunnerApplication(targets.local, run), 'ready');
  console.log(JSON.stringify({ missingApplicationRetainsReadyPeer: true }));
  const incomplete = await runnerGraphFixture();
  try {
    const unloaded = createRunnerControl({
      targets: { ...targets, server: { ...target, ...incomplete.target } },
      run,
    });
    assert.deepEqual(await unloaded.act('start', 'server'), {
      ok: false,
      code: 'runner-application-dependencies-unavailable',
      states: { local: 'running', server: 'stopped' },
    });
    assert.equal(launches().length, 2);
    assert.equal(await inspectRunnerApplication(targets.local, run), 'ready');
    console.log(
      JSON.stringify({ incompleteApplicationRetainsReadyPeer: true })
    );
  } finally {
    await incomplete.close();
  }
  if (docker) {
    refuseCleanup = true;
    assert.deepEqual(await control.act('start', 'server'), {
      ok: false,
      code: 'runner-state-unconfirmed',
      states: { local: 'running', server: 'stopped' },
    });
    assert.equal(launches().length, 2);
    assert.equal(await inspectRunnerApplication(targets.local, run), 'ready');
    console.log(JSON.stringify({ cleanupRefusalRetainsReadyPeer: true }));
    refuseCleanup = false;
  }
  assert.equal((await control.act('start', 'server')).ok, true);
  assert.equal((await control.status()).states.local, 'stopped');
  await poll(() => inspectRunnerApplication(target, run), 'ready');
  assert.equal(
    await readFile(join(store, 'owner-marker'), 'utf8'),
    'retained private data\n'
  );
  assert.equal(calls.filter((argv) => argv[2] === 'rm').length, docker ? 2 : 0);
  assert.equal((await control.act('start', 'local')).ok, true);
  assert.equal((await control.status()).states.server, 'stopped');
  assert.equal((await control.act('stop', 'local')).ok, true);
  assert.equal((await control.act('stop', 'server')).states.server, 'stopped');
  assert.equal(preparations.length, docker ? 5 : 4);
  assert.ok(
    preparations.every((prefix) => prefix.join() === preparations[0].join())
  );
  if (docker) {
    const { stdout } = await exec('docker', [
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      target.image,
    ]);
    const imageId = stdout.trim();
    const dockerLaunches = launches().filter((argv) =>
      argv.includes('--image')
    );
    assert.equal(dockerLaunches.length, 2);
    assert(dockerLaunches.every((argv) => argv.includes(imageId)));
    console.log(JSON.stringify({ preparedImageReused: true }));
    await exec('docker', ['container', 'rm', session]);
    await exec('docker', [
      'create',
      '--name',
      session,
      process.env.RUNNER_DOCKER_IMAGE,
    ]);
    for (const action of ['start', 'stop']) {
      assert.equal((await control.act(action, 'server')).ok, false);
    }
    assert.equal(await inspectRunnerApplication(target, run), 'unknown');
    assert.equal(
      (
        await exec('docker', [
          'inspect',
          '--format',
          '{{.State.Status}}',
          session,
        ])
      ).stdout.trim(),
      'created'
    );
  }
  console.log(
    JSON.stringify({
      actualSsh: true,
      actualDocker: docker,
      serverIsolation: isolation,
      actualApplication: true,
      health: 'ready',
      explicitStarts: 2,
      noImplicitLaunch: true,
      privateDataRetained: true,
      foreignContainerRefused: docker,
      mutuallyExclusiveModes: true,
      privateLauncherPreparedAndReused: true,
      liveProvider: false,
    })
  );
} catch (error) {
  console.error('Remote runner proof failed:', error);
  throw error;
} finally {
  try {
    assert.equal((await control.act('stop', 'local')).ok, true);
  } finally {
    if (!docker) {
      assert.equal(
        (await control.act('stop', 'server')).states.server,
        'stopped'
      );
    } else {
      const remaining = () =>
        exec('docker', [
          'container',
          'ls',
          '--all',
          '--filter',
          `name=^/${session}$`,
          '--format',
          '{{.ID}}',
        ]);
      if ((await remaining()).stdout.trim()) {
        await exec('docker', ['container', 'rm', '--force', session]);
      }
      assert.equal((await remaining()).stdout.trim(), '');
    }
  }
}
console.log(JSON.stringify({ applicationResourcesClosed: true }));
