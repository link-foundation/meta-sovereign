import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectRunnerBackend } from '../../js/src/server/runner-backend.js';
import { runRunnerCommand } from '../../js/src/server/runner-transport.js';

const root = await mkdtemp(join(tmpdir(), 'ms-runner-backend-'));
const host = process.env.RUNNER_BACKEND_SSH_HOST;
const directory = join(root, 'absent-checkout');
const socket = `unix://${join(root, 'absent.sock')}`;
const unavailable = (target, argv, options) =>
  runRunnerCommand(
    target,
    argv[0] === 'docker'
      ? [
          '/bin/sh',
          '-c',
          'DOCKER_HOST="$1"; export DOCKER_HOST; shift; exec "$@"',
          'fixture',
          socket,
          ...argv,
        ]
      : argv,
    options
  );
const missing = (target, argv, options) =>
  runRunnerCommand(
    target,
    [
      '/bin/sh',
      '-c',
      'PATH="$1"; export PATH; shift; exec /bin/sh "$@"',
      'fixture',
      root,
      ...argv.slice(1),
    ],
    options
  );

try {
  for (const kind of ['screen', 'docker']) {
    const target = { host, directory, isolation: kind };
    assert.deepEqual(await inspectRunnerBackend(target), {
      kind,
      state: 'ready',
    });
    assert.deepEqual(await inspectRunnerBackend(target, missing), {
      kind,
      state: 'missing',
    });
    if (kind === 'docker') {
      assert.deepEqual(await inspectRunnerBackend(target, unavailable), {
        kind,
        state: 'unavailable',
      });
    }
  }
  console.log(
    JSON.stringify({
      transport: host ? 'SSH' : 'local',
      screen: ['ready', 'missing'],
      docker: ['ready', 'missing', 'unavailable'],
      checkoutAbsent: true,
    })
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
