import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRunnerController } from '../src/server/runner-controller.js';
import { createRunnerLauncherPreparation } from '../src/server/runner-dependencies.js';
import { runnerReceipt } from '../src/transport/runner-receipt.js';
import { validateRunnerProfile } from '../src/cli/runner-profile.js';
import {
  runnerFixture,
  runnerProfile,
} from '../../experiments/issue-56/runner-fixture.mjs';

const success = (stdout) => ({ code: 0, stdout });
const supplied = ['/fixture path/bun', "/fixture path/owner's cli.js"];
const isLookup = (argv) => argv[0] === 'sh' && argv[1] === '-c';

test('explicit and existing PATH launchers never install packages', async () => {
  let probes = 0;
  const prepare = createRunnerLauncherPreparation({
    probe: async (_target, argv) => {
      probes++;
      if (isLookup(argv)) {
        assert.equal(argv.at(-1), '$');
        return success('present');
      }
      assert.deepEqual(argv, ['$', '--version']);
      return success('start-command version: 0.44.0');
    },
    run: () => assert.fail('unexpected installation'),
  });
  assert.deepEqual(await prepare({ start: '/owner tools/start' }), [
    '/owner tools/start',
  ]);
  assert.equal(probes, 0);
  assert.deepEqual(await prepare({}), ['$']);
  assert.equal(probes, 2);
  const broken = createRunnerLauncherPreparation({
    probe: async (_target, argv) =>
      isLookup(argv) ? success('present') : { code: 127, stdout: '' },
    run: () => assert.fail('a broken configured launcher must not be replaced'),
  });
  assert.equal(await broken({}), null);
});

test('a confirmed missing SSH launcher uses its destination runtime and pinned assets', async () => {
  const abort = new AbortController();
  const profile = { ...runnerProfile().server, node: '/node path/bin/node' };
  const prepare = createRunnerLauncherPreparation({
    probe: async () => success('missing'),
    run: async (target, [node, mode, evaluate, program, lock], options) => {
      assert.equal(target, profile);
      assert.equal(options.signal, abort.signal);
      assert.deepEqual(
        [node, mode, evaluate],
        ['/node path/bin/node', '--input-type=module', '--eval']
      );
      assert.match(program, /--ignore-scripts/);
      const packageLock = JSON.parse(lock);
      assert.deepEqual(packageLock.packages[''].dependencies, {
        bun: '1.4.4',
        'start-command': '0.44.0',
      });
      for (const [name, entry] of Object.entries(packageLock.packages)) {
        if (name) {
          assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//);
          assert.match(entry.integrity, /^sha512-/);
        }
      }
      return success(JSON.stringify(supplied));
    },
  });
  assert.deepEqual(await prepare(profile, { signal: abort.signal }), supplied);
});

test('ambiguous discovery never prepares and invalid preparation output never launches', async () => {
  for (const probe of [
    { code: 255, stdout: 'missing' },
    { code: 0, stdout: 'missing', aborted: true },
    { code: 0, stdout: 'missing', stderr: 'unconfirmed' },
    success('SSH welcome banner\nmissing'),
  ]) {
    const prepare = createRunnerLauncherPreparation({
      probe: async () => probe,
      run: () =>
        assert.fail('unconfirmed absence is not permission to install'),
    });
    assert.equal(await prepare({}), null);
  }
  for (const reply of [
    { code: 1, stdout: JSON.stringify(supplied) },
    { code: 0, aborted: true, stdout: JSON.stringify(supplied) },
    success(JSON.stringify(['relative/bin', supplied[1]])),
    success('not-json'),
  ]) {
    const prepare = createRunnerLauncherPreparation({
      probe: async () => success('missing'),
      run: async () => reply,
    });
    assert.equal(await prepare({ host: 'fixture' }), null);
  }
});

test(
  'a prepared launch switches modes only after dependencies are confirmed',
  { timeout: 5000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'runner-prepare-test-'));
    const backend = runnerFixture({ server: 'running' });
    const events = [];
    const run = (target, argv, options) => {
      if (isLookup(argv) && argv.at(-1) === '$') {
        return success('missing');
      }
      if (argv[0] === 'screen' && argv[1] === '-S') {
        events.push('stop');
      }
      if (argv.includes('--isolated')) {
        assert.deepEqual(argv.slice(0, 2), supplied);
        events.push('launch');
      }
      return backend.run(target, argv, options);
    };
    let reply = { code: 1, stderr: 'Private path' };
    const controller = createRunnerController({
      directory: () => directory,
      load: async () => validateRunnerProfile(runnerProfile()),
      run,
      prepareLauncher: createRunnerLauncherPreparation({
        probe: run,
        run: async () => {
          events.push('prepare');
          return reply;
        },
      }),
    });
    try {
      await controller.execute({ action: 'status' });
      assert.deepEqual(events, []);
      const refused = await controller.execute({
        action: 'start',
        mode: 'local',
      });
      assert.equal(refused.code, 'runner-launcher-unavailable');
      assert.deepEqual(runnerReceipt(refused, 'start', 'local'), refused);
      assert.equal(refused.states.server, 'running');
      assert.deepEqual(events, ['prepare']);
      reply = success(JSON.stringify(supplied));
      const started = await controller.execute({
        action: 'start',
        mode: 'local',
      });
      assert.equal(started.ok, true);
      assert.deepEqual(started.states, { local: 'running', server: 'stopped' });
      assert.deepEqual(events, ['prepare', 'prepare', 'stop', 'launch']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
