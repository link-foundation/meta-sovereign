import assert from 'node:assert/strict';
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { runnerConfigurationOverrides } from '../src/cli/runner-configuration.js';
import {
  validateRunnerProfile,
  runnerProfileData,
} from '../src/cli/runner-profile.js';
import { createRunnerApplicationPreparation } from '../src/server/runner-application.js';
import { createRunnerControl } from '../src/server/runner-control.js';
import { runRunnerCommand } from '../src/server/runner-transport.js';
import { runnerApplicationFixture } from '../../experiments/issue-56/runner-application-fixture.mjs';
import { runnerGraphBackend } from '../../experiments/issue-56/runner-graph-fixture.mjs';
import { runnerProfile } from '../../experiments/issue-56/runner-fixture.mjs';
import {
  dockerFixture,
  dockerProfile,
} from '../../experiments/issue-56/runner-docker-fixture.mjs';

const controlled = (selected) => {
  const fixture = runnerGraphBackend();
  const profile = runnerProfile();
  const targets = validateRunnerProfile({
    ...profile,
    server: { ...profile.server, ...selected.target },
  });
  const installs = [];
  const prepareApplication = createRunnerApplicationPreparation({
    install: ({ host: _host, ...target }, args, options) => {
      installs.push(args);
      assert.equal(fixture.state.local, 'running');
      return runRunnerCommand(target, args, options);
    },
  });
  return {
    ...fixture,
    installs,
    controller: createRunnerControl({
      targets,
      run: fixture.run,
      prepareApplication,
    }),
  };
};

test('explicit Start installs the approved closure once and verifies it before switching', async (t) => {
  const fixture = await runnerApplicationFixture();
  t.after(fixture.close);
  const { directory } = fixture.target;
  const modules = path.join(directory, 'node_modules');
  const backend = controlled(fixture);
  const lock = await readFile(path.join(directory, 'package-lock.json'));
  assert.equal((await backend.controller.status()).states.local, 'running');
  await assert.rejects(lstat(modules), { code: 'ENOENT' });
  assert.equal(backend.installs.length, 0);
  assert.equal((await backend.controller.act('start', 'server')).ok, true);
  const link = await readlink(modules);
  assert.match(
    link,
    /^\.meta-sovereign-runner-app\/stage-[^/]+\/node_modules$/
  );
  assert.deepEqual(
    await readFile(path.join(directory, 'package-lock.json')),
    lock
  );
  assert.equal(backend.installs.length, 1);
  assert.deepEqual(backend.state, { local: 'stopped', server: 'running' });
  assert.equal((await backend.controller.act('stop', 'server')).ok, true);
  assert.equal((await backend.controller.act('start', 'server')).ok, true);
  assert.equal(backend.installs.length, 1);
  assert.equal(await readlink(modules), link);
  assert.equal((await backend.controller.act('stop', 'server')).ok, true);
  await writeFile(
    path.join(directory, 'package-lock.json'),
    Buffer.concat([lock, Buffer.from('\n')])
  );
  const stale = controlled(fixture);
  assert.equal(
    (await stale.controller.act('start', 'server')).code,
    'runner-application-dependencies-unavailable'
  );
  assert.equal(stale.state.local, 'running');
  assert.equal(await readlink(modules), link);
});

test('changed approvals, unauthorized artifact hosts and incomplete source keep the peer active', async (t) => {
  for (const example of ['changed', 'artifact', 'source']) {
    await t.test(example, async (subtest) => {
      const fixture = await runnerApplicationFixture({
        ...{
          artifact: { registry: 'https://example.invalid/fake.tgz' },
          source: { brokenSource: true },
        }[example],
      });
      subtest.after(fixture.close);
      const { directory } = fixture.target;
      if (example === 'changed') {
        fixture.target.applicationLock = '0'.repeat(64);
      }
      const backend = controlled(fixture);
      const result = await backend.controller.act('start', 'server');
      assert.equal(result.code, 'runner-application-dependencies-unavailable');
      assert.deepEqual(result.states, { local: 'running', server: 'stopped' });
      assert.ok(backend.calls.every(([, action]) => action === 'probe'));
      await assert.rejects(lstat(path.join(directory, 'node_modules')), {
        code: 'ENOENT',
      });
      if (example === 'source') {
        assert.deepEqual(
          await readdir(path.join(directory, '.meta-sovereign-runner-app')),
          []
        );
      }
    });
  }
});

test('preparation preserves an existing owner-managed dependency directory', async (t) => {
  const fixture = await runnerApplicationFixture();
  t.after(fixture.close);
  const { directory } = fixture.target;
  const modules = path.join(directory, 'node_modules');
  await mkdir(modules);
  const ownerFile = path.join(modules, 'owner-content');
  await writeFile(ownerFile, 'retained');
  const backend = controlled(fixture);
  assert.equal((await backend.controller.act('start', 'server')).ok, false);
  assert.equal(await readFile(ownerFile, 'utf8'), 'retained');
  assert.equal(backend.state.local, 'running');
});

test('only the exact product path accepts an explicit lock in a saved or CLI profile', () => {
  const profile = runnerProfile();
  const applicationLock = 'b'.repeat(64);
  const options = runnerConfigurationOverrides({
    'server-application-lock': applicationLock,
  });
  assert.deepEqual(options, { server: { applicationLock } });
  assert.throws(() =>
    validateRunnerProfile({ server: { ...profile.server, applicationLock } })
  );
  const cli = path.posix.join(
    profile.server.directory,
    'js/bin/meta-sovereign.js'
  );
  const value = validateRunnerProfile({
    server: { ...profile.server, cli, applicationLock },
  });
  assert.equal(
    runnerProfileData(value).server.applicationLock,
    applicationLock
  );
  assert.throws(() =>
    runnerConfigurationOverrides({ 'server-application-lock': 'bad' })
  );
});

test('Docker installs under the SSH owner in the resolved image and checks graph before stop', async () => {
  const backend = dockerFixture({ initial: { local: 'running' } });
  const profile = dockerProfile();
  const { directory } = profile.server;
  const targets = validateRunnerProfile({
    ...profile,
    server: {
      ...profile.server,
      cli: path.posix.join(directory, 'js/bin/meta-sovereign.js'),
      applicationLock: 'a'.repeat(64),
    },
  });
  let graph = false;
  let owner = 'unexpected 1000:1001';
  const installs = [];
  const prepareApplication = createRunnerApplicationPreparation({
    async install(target, argv) {
      assert.equal(backend.screen.state.local, 'running');
      assert.deepEqual(argv.slice(0, 16), [
        'docker',
        'run',
        '--rm',
        '--pull=never',
        '--read-only',
        '--user',
        '1000:1001',
        '--tmpfs',
        '/tmp',
        '--mount',
        `"type=bind","source=${directory}","target=${directory}"`,
        '--workdir',
        directory,
        '--entrypoint',
        'node',
        backend.imageId,
      ]);
      assert.equal(target.cli, targets.server.cli);
      assert.ok(!argv.includes(target.store));
      assert.equal(argv.at(-3), target.applicationLock);
      installs.push(argv[0]);
      graph = true;
      return { code: 0, stdout: 'prepared' };
    },
  });
  const run = (target, argv, options) => {
    if (argv[0] === 'docker' && argv[1] === 'run') {
      assert.ok(argv.includes('--network=none'));
      assert.equal(argv.at(-1), targets.server.applicationLock);
      return { code: graph ? 0 : 1, stdout: graph ? 'loaded' : '' };
    }
    if (argv[0] === 'sh' && argv[2].includes('id -u')) {
      return { code: 0, stdout: owner };
    }
    return backend.run(target, argv, options);
  };
  const control = createRunnerControl({ targets, run, prepareApplication });
  assert.equal(
    (await control.act('start', 'server')).code,
    'runner-application-dependencies-unavailable'
  );
  assert.equal(backend.screen.state.local, 'running');
  assert.deepEqual(installs, []);
  owner = '1000:1001';
  assert.equal((await control.act('start', 'server')).ok, true);
  assert.deepEqual(installs, ['docker']);
  assert.equal(backend.screen.state.local, 'stopped');
});
