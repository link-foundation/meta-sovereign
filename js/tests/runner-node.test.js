import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createRunnerControl } from '../src/server/runner-control.js';
import { createRunnerLauncherPreparation } from '../src/server/runner-dependencies.js';
import { createRunnerRuntimePreparation } from '../src/server/runner-node.js';
import { inspectRunnerApplication } from '../src/server/runner-inspection.js';
import { validateRunnerProfile } from '../src/cli/runner-profile.js';
import { runnerReceipt } from '../src/transport/runner-receipt.js';
import {
  runnerFixture,
  runnerProfile,
} from '../../experiments/issue-56/runner-fixture.mjs';

const success = (stdout) => ({ code: 0, stdout });
const target = validateRunnerProfile(runnerProfile()).server;
const root = `/private runner/.meta-sovereign-runner-tools/node-v26.13.0-linux-x64-${'a'.repeat(64)}`;
const runtime = {
  node: path.posix.join(root, 'bin/node'),
  npm: path.posix.join(root, 'lib/node_modules/npm/bin/npm-cli.js'),
};

test('only explicit Start installs Node and ordinary inspection can reuse the verified cache', async () => {
  const reads = [];
  const installs = [];
  const signal = new AbortController().signal;
  const prepare = createRunnerRuntimePreparation({
    probe: async (host, argv, options) => {
      assert.equal(host, target);
      assert.equal(options.signal, signal);
      reads.push(argv.at(-1));
      return success(argv.at(-1) === 'node' ? 'missing' : `${root}\n`);
    },
    install: async (host, argv, options) => {
      assert.equal(host, target);
      assert.equal(options.signal, signal);
      assert.match(argv[2], /renameSync/);
      installs.push(argv.at(-1));
      return success(`${root}\n`);
    },
  });

  assert.deepEqual(await prepare(target, { signal }), runtime);
  assert.deepEqual(reads, ['node', 'read']);
  assert.deepEqual(installs, []);
  assert.deepEqual(
    await prepare(target, { signal, installMissing: true }),
    runtime
  );
  assert.deepEqual(installs, ['install']);

  const backend = runnerFixture({ server: 'running' });
  assert.equal(
    await inspectRunnerApplication(
      target,
      (host, argv, options) => {
        assert.equal(argv[0], runtime.node);
        return backend.run(host, argv, options);
      },
      { resolveRuntime: (host) => prepare(host, { signal }) }
    ),
    'ready'
  );
  assert.deepEqual(installs, ['install']);
});

test('runtime preparation preserves PATH, custom executables and Docker application runtime', async () => {
  let probes = 0;
  const prepare = createRunnerRuntimePreparation({
    probe: async () => {
      probes++;
      return success('present');
    },
    install: () => assert.fail('unexpected installation'),
  });
  const override = '/owner tools/wrapped-node';
  assert.deepEqual(await prepare({ ...target, node: override }), {
    node: override,
  });
  assert.deepEqual(await prepare({ ...target, isolation: 'docker' }), {
    node: 'node',
  });
  assert.equal(probes, 0);
  assert.deepEqual(await prepare(target, { installMissing: true }), {
    node: 'node',
  });
  assert.equal(probes, 1);
});

test('ambiguous absence or an invalid runtime receipt refuses launch preparation', async () => {
  for (const reply of [
    success('SSH welcome banner\nmissing'),
    { code: 255, stdout: 'missing' },
    { code: 0, stdout: 'missing', aborted: true },
    { code: 0, stdout: 'missing', stderr: 'unknown status' },
  ]) {
    const prepare = createRunnerRuntimePreparation({
      probe: async () => reply,
      install: () => assert.fail('Node absence is unconfirmed'),
    });
    assert.equal(await prepare(target, { installMissing: true }), null);
  }
  for (const reply of [
    success('node-v26.13.0-linux-x64'),
    success(`${root}\n${root}`),
    success('/another executable'),
  ]) {
    const prepare = createRunnerRuntimePreparation({
      probe: async () => success('missing'),
      install: async () => reply,
    });
    assert.equal(await prepare(target, { installMissing: true }), null);
  }
});

test('host launcher preparation uses bundled npm and preserves the Docker entry runtime', async () => {
  const docker = { ...target, isolation: 'docker', node: '/container/node' };
  const prepare = createRunnerLauncherPreparation({
    probe: async () => success('missing'),
    prepareHostRuntime: async (host, options) => {
      assert.equal(host.host, docker.host);
      assert.equal(host.node, 'node');
      assert.equal(options.installMissing, true);
      return runtime;
    },
    run: async (host, argv) => {
      assert.equal(host, docker);
      assert.equal(argv[0], runtime.node);
      assert.equal(argv.at(-1), runtime.npm);
      return success(JSON.stringify(['/host/bun', '/host/start.js']));
    },
  });
  assert.deepEqual(await prepare(docker, {}, { node: docker.node }), [
    '/host/bun',
    '/host/start.js',
  ]);
});

test('failed Node preparation preserves the peer and a ready runtime supplies the real launch argv', async () => {
  const targets = validateRunnerProfile(runnerProfile());
  const backend = runnerFixture({ local: 'running' });
  let available = false;
  let launch;
  const control = createRunnerControl({
    targets,
    run(host, argv, options) {
      if (argv.includes('--isolated')) {
        launch = argv;
      }
      return backend.run(host, argv, options);
    },
    async prepareRuntime(host, options) {
      assert.equal(host, targets.server);
      assert.equal(options.installMissing, true);
      return available ? runtime : null;
    },
  });
  const refusal = await control.act('start', 'server');
  assert.equal(refusal.code, 'runner-runtime-unavailable');
  assert.equal(
    runnerReceipt({ ...refusal, scope: 'isolated-session' }).code,
    'runner-runtime-unavailable'
  );
  assert.equal(backend.state.local, 'running');
  assert.equal(launch, undefined);
  assert.equal(
    backend.calls.some(([, name]) => name !== 'probe'),
    false
  );
  available = true;
  assert.equal((await control.act('start', 'server')).ok, true);
  assert.equal(backend.state.local, 'stopped');
  assert.equal(launch[launch.indexOf('--') + 1], runtime.node);
});
