/** Finite real Docker/SSH proof; no credentials, providers or user stores. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { validateRunnerProfile } from '../../js/src/cli/runner-profile.js';
import { createRunnerControl } from '../../js/src/server/runner-control.js';
import { inspectRunnerApplication } from '../../js/src/server/runner-inspection.js';
import {
  runRunnerCommand,
  quoteRunnerArgument,
} from '../../js/src/server/runner-transport.js';

const exec = promisify(execFile);
const fixture = process.env.RUNNER_DOCKER_FIXTURE;
assert(
  fixture && process.env.RUNNER_START_PACKAGE && process.env.RUNNER_DOCKER_IMAGE
);
const root = resolve('.');
const session = `ms-runner-proof-${process.pid}`;
const start = join(fixture, 'start');
const store = join(fixture, 'private store, "quoted"');
await mkdir(store);
const localStore = join(fixture, 'local store');
await mkdir(localStore);
const bun = (await exec('which', ['bun'])).stdout.trim();
await writeFile(
  start,
  `#!/bin/sh\nexec ${quoteRunnerArgument(bun)} ${quoteRunnerArgument(join(process.env.RUNNER_START_PACKAGE, 'node_modules/start-command/src/bin/cli.js'))} "$@"\n`,
  { mode: 0o700 }
);
const targets = validateRunnerProfile({
  session,
  local: {
    directory: root,
    cli: join(root, 'js/bin/meta-sovereign.js'),
    store: localStore,
    port: 18787,
    node: process.execPath,
    start,
  },
  server: {
    host: 'runner-docker-fixture',
    directory: root,
    cli: join(root, 'js/bin/meta-sovereign.js'),
    store,
    port: 8787,
    isolation: 'docker',
    image: process.env.RUNNER_DOCKER_IMAGE,
    start,
  },
});
const target = targets.server;
const calls = [];
const run = async (selected, argv, options) => {
  calls.push(argv);
  const result = await runRunnerCommand(selected, argv, options);
  if (result.code !== 0 && !['screen'].includes(argv[0])) {
    console.log(
      JSON.stringify({ command: argv[0], operation: argv[2], ...result })
    );
  }
  return result;
};
const control = createRunnerControl({ targets, run });
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
  assert.equal((await control.act('start', 'server')).ok, true);
  await poll(() => inspectRunnerApplication(target, run), 'ready');
  await writeFile(join(store, 'owner-marker'), 'retained private data\n');
  assert.equal((await control.act('start', 'server')).ok, true);
  assert.equal(calls.filter((argv) => argv[1] === '--isolated').length, 1);
  assert.equal((await control.act('stop', 'server')).states.server, 'stopped');
  assert.equal((await control.act('start', 'local')).ok, true);
  await poll(() => inspectRunnerApplication(targets.local, run), 'ready');
  assert.equal((await control.act('start', 'server')).ok, true);
  assert.equal((await control.status()).states.local, 'stopped');
  await poll(() => inspectRunnerApplication(target, run), 'ready');
  assert.equal(
    await readFile(join(store, 'owner-marker'), 'utf8'),
    'retained private data\n'
  );
  assert.equal(calls.filter((argv) => argv[2] === 'rm').length, 1);
  assert.equal((await control.act('start', 'local')).ok, true);
  assert.equal((await control.status()).states.server, 'stopped');
  assert.equal((await control.act('stop', 'local')).ok, true);
  assert.equal((await control.act('stop', 'server')).states.server, 'stopped');
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
  console.log(
    JSON.stringify({
      actualSsh: true,
      actualDocker: true,
      actualApplication: true,
      health: 'ready',
      explicitStarts: 2,
      noImplicitLaunch: true,
      privateDataRetained: true,
      foreignContainerRefused: true,
      mutuallyExclusiveScreenAndDocker: true,
      liveProvider: false,
    })
  );
} finally {
  try {
    assert.equal((await control.act('stop', 'local')).ok, true);
  } finally {
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
console.log(JSON.stringify({ applicationResourcesClosed: true }));
