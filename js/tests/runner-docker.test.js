import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRunnerProfile,
  runnerProfileData,
} from '../src/cli/runner-profile.js';
import {
  mergeRunnerConfiguration,
  runnerConfigurationOverrides,
} from '../src/cli/runner-configuration.js';
import { createRunnerControl } from '../src/server/runner-control.js';
import {
  runnerLaunch,
  runnerProbe,
  observedRunnerState,
} from '../src/server/runner-session.js';
import { inspectRunnerApplication } from '../src/server/runner-inspection.js';
import { runnerInvocation } from '../src/server/runner-transport.js';
import {
  encodeWire,
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import { formatIndented, parseIndented } from 'lino-objects-codec';
import { runnerApiFixture } from '../../experiments/issue-56/runner-api-fixture.mjs';
import { requestRunner } from '../src/cli/runner-client.js';
import {
  prepareDockerRunner,
  stopDockerRunner,
} from '../src/server/runner-docker.js';
import {
  dockerProfile,
  dockerResult,
  dockerFixture,
} from '../../experiments/issue-56/runner-docker-fixture.mjs';

const targets = () => validateRunnerProfile(dockerProfile());
const control = (fixture) =>
  createRunnerControl({ targets: targets(), run: fixture.run });
const launches = (fixture) =>
  fixture.calls.filter((argv) => argv[1] === '--isolated');

test('Docker cleanup and Stop refuse a changed identity or cancellation before mutation', async () => {
  const target = targets().server;
  for (const action of [prepareDockerRunner, stopDockerRunner]) {
    const abort = new AbortController();
    const calls = [];
    await action(
      target,
      async (_, argv) => {
        calls.push(argv);
        abort.abort();
        return dockerResult('exited');
      },
      { signal: abort.signal }
    );
    assert.deepEqual(calls, [runnerProbe(target)]);
  }
  const replies = [
    dockerResult('exited'),
    { code: 0 },
    dockerResult('running', 'foreign'),
  ];
  const calls = [];
  assert.equal(
    await prepareDockerRunner(
      target,
      async (_, argv) => {
        calls.push(argv);
        return replies.shift();
      },
      {}
    ),
    false
  );
  assert.deepEqual(
    calls.map((argv) => argv[2]),
    ['ls', 'rm', 'ls']
  );
  assert.equal(
    runnerProbe({ ...target, session: 'fixture.with.dots' })[5],
    'name=^/fixture\\.with\\.dots$'
  );
});

test(
  'text and binary API acknowledge the same Docker profile without process effects',
  { timeout: 10000 },
  async () => {
    const backend = dockerFixture();
    const fixture = await runnerApiFixture({ backend });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const before = await requestRunner({
          url: fixture.base,
          action: 'profile',
        });
        const response = await fetch(`${fixture.base}/api/runner/configure`, {
          method: 'POST',
          headers: { accept: type, 'content-type': type },
          body: encodeWire(
            {
              document: formatIndented({ id: 'runner', obj: dockerProfile() }),
              revision: before.revision,
            },
            type
          ),
        });
        assert.equal(response.status, 200);
        const saved = await readWireResponse(response);
        assert.equal(saved.ok, true);
        const decoded = parseIndented({ text: saved.document }).obj;
        assert.equal(decoded.server.isolation, 'docker');
        assert.equal(decoded.server.image, dockerProfile().server.image);
        assert.equal(validateRunnerProfile(decoded).local.isolation, 'screen');
        assert.equal(
          (await requestRunner({ url: fixture.base, action: 'profile' }))
            .document,
          saved.document
        );
      }
      assert.deepEqual(backend.calls, []);
    } finally {
      await fixture.close();
    }
  }
);

test('remote Docker profile and explicit CLI overrides round-trip without changing local screen', () => {
  const profile = dockerProfile();
  const current = targets();
  assert.equal(current.local.isolation, 'screen');
  assert.equal(current.server.isolation, 'docker');
  assert.deepEqual(validateRunnerProfile(runnerProfileData(current)), current);
  assert.deepEqual(
    mergeRunnerConfiguration(
      profile,
      runnerConfigurationOverrides({
        'server-image': `registry.example/owner/runtime@sha256:${'a'.repeat(64)}`,
      })
    ).server.image,
    `registry.example/owner/runtime@sha256:${'a'.repeat(64)}`
  );
  for (const change of [
    { image: undefined },
    { image: '--PRIVATE' },
    { image: 'image\nPRIVATE' },
    { image: 'image;PRIVATE' },
    { image: 'https://owner:PRIVATE@registry.example/image' },
    { image: 'owner:PRIVATE@registry.example/image' },
    { isolation: 'tmux' },
    { cli: '/outside/cli.js' },
  ]) {
    assert.throws(
      () =>
        validateRunnerProfile({
          ...profile,
          server: { ...profile.server, ...change },
        }),
      {
        message: 'Runner profile unavailable or invalid.',
      }
    );
  }
});

test('Docker observations require exact owned identity, complete output and successful transport', () => {
  const target = targets().server;
  assert.equal(observedRunnerState(target, dockerResult('missing')), 'stopped');
  assert.equal(observedRunnerState(target, dockerResult('running')), 'running');
  assert.equal(observedRunnerState(target, dockerResult('exited')), 'stopped');
  for (const result of [
    dockerResult('running', `${target.session}-other`),
    dockerResult('paused'),
    dockerResult('created'),
    { ...dockerResult('running'), code: 1 },
    { ...dockerResult('missing'), aborted: true },
    { ...dockerResult('running'), stderr: 'PRIVATE transport warning' },
    {
      ...dockerResult('running'),
      stdout: dockerResult('running').stdout.repeat(2),
    },
    {
      ...dockerResult('running'),
      stdout: `abcdef123456\t${target.session}\trunning\tforeign`,
    },
  ]) {
    assert.equal(observedRunnerState(target, result), 'unknown');
  }
  const argv = runnerProbe(target);
  assert(argv.includes(`name=^/${target.session}$`));
  assert(argv.at(-1).includes('meta-sovereign.runner'));
});

test('Docker launch mounts configured data, retains working directory and quotes literal SSH arguments', () => {
  const target = {
    ...targets().server,
    directory: '/fixture/owner\'s, "project"',
    cli: '/fixture/owner\'s, "project"/js/bin/cli.js',
    store: '/fixture/private,store',
  };
  const argv = runnerLaunch(target);
  assert.deepEqual(argv.slice(0, 6), [
    '$',
    '--isolated',
    'docker',
    '--session',
    target.session,
    '--detached',
  ]);
  assert(argv.includes(target.image));
  assert(argv.includes(`meta-sovereign.runner=${target.session}`));
  const mounts = argv.flatMap((value, index) =>
    value === '--mount' ? [argv[index + 1]] : []
  );
  assert.equal(mounts.length, 2);
  assert(mounts[0].includes('"source=/fixture/owner\'s, ""project"""'));
  assert(mounts[1].includes('"target=/fixture/private,store"'));
  assert(
    argv.includes("cd '/fixture/owner'\\''s, \"project\"' && exec \"$@\"")
  );
  assert(argv.includes(`--store=${target.store}`));
  assert(argv.includes('--local-ui=true'));
  const invocation = runnerInvocation(target, argv);
  assert.equal(invocation.file, 'ssh');
  assert(invocation.args.includes('BatchMode=yes'));
  assert(!invocation.args.join(' ').includes(target.directory));
  assert(invocation.input.includes("exec '$' '--isolated' 'docker'"));
  const nestedStore = runnerLaunch(targets().server);
  assert.equal(nestedStore.filter((value) => value === '--mount').length, 1);
});

test('remote Docker starts only after local stop, then stops and reuses only its owned exited container', async () => {
  const fixture = dockerFixture({ initial: { local: 'running' } });
  const runner = control(fixture);
  assert.equal((await runner.act('start', 'server')).ok, true);
  assert.deepEqual(
    fixture.screen.calls.filter(([, action]) => action !== 'probe'),
    [['local', 'stop']]
  );
  assert.equal((await runner.act('start', 'server')).ok, true);
  assert.equal(launches(fixture).length, 1);
  assert.equal((await runner.act('stop', 'server')).states.server, 'stopped');
  assert.deepEqual(
    fixture.calls.find((argv) => argv[2] === 'stop'),
    ['docker', 'container', 'stop', 'abcdef123456']
  );
  assert.equal((await runner.act('start', 'server')).ok, true);
  const removed = fixture.calls.findIndex((argv) => argv[2] === 'rm');
  assert.deepEqual(fixture.calls[removed], [
    'docker',
    'container',
    'rm',
    'abcdef123456',
  ]);
  assert.equal(fixture.calls[removed + 1][2], 'ls');
  assert.equal(launches(fixture).length, 2);
  assert.equal((await runner.act('start', 'local')).ok, true);
  assert.equal((await runner.status()).states.server, 'stopped');
});

test('refused cleanup, missing daemon and optimistic Docker launch cannot authorize success or retry', async () => {
  const fixture = dockerFixture({ container: 'exited', refuseRemove: true });
  assert.equal((await control(fixture).act('start', 'server')).ok, false);
  assert.equal(launches(fixture).length, 0);
  assert.equal(fixture.calls.filter((argv) => argv[2] === 'rm').length, 1);
  for (const options of [{ launchState: 'missing' }, { launchCode: 1 }]) {
    const broken = dockerFixture(options);
    assert.equal((await control(broken).act('start', 'server')).ok, false);
    assert.equal(launches(broken).length, 1);
  }
  for (const result of [{ code: 255 }, dockerResult('running', 'foreign')]) {
    const calls = [];
    const runner = createRunnerControl({
      targets: { server: targets().server },
      run: async (_, argv) => {
        calls.push(argv);
        return result;
      },
    });
    for (const action of ['start', 'stop']) {
      assert.equal((await runner.act(action, 'server')).ok, false);
    }
    assert(calls.every((argv) => argv[2] === 'ls'));
  }
});

test('refused Docker preparation leaves the active Screen peer running', async () => {
  const fixture = dockerFixture({
    initial: { local: 'running' },
    container: 'exited',
    refuseRemove: true,
  });
  assert.deepEqual(await control(fixture).act('start', 'server'), {
    ok: false,
    code: 'runner-state-unconfirmed',
    states: { local: 'running', server: 'stopped' },
  });
  assert(fixture.screen.calls.every(([, action]) => action === 'probe'));
  assert.equal(launches(fixture).length, 0);
  assert.deepEqual(
    fixture.calls.filter((argv) => argv[2] === 'rm'),
    [['docker', 'container', 'rm', 'abcdef123456']]
  );
});

test('Docker application inspection runs the private health command inside the owned container', async () => {
  const target = targets().server;
  const calls = [];
  const state = await inspectRunnerApplication(target, async (_, argv) => {
    calls.push(argv);
    if (argv[2] === 'ls') {
      return dockerResult('running');
    }
    return {
      code: 0,
      stdout: encodeWire(
        { ok: true, scope: 'application-worker', state: 'locked' },
        LINO_TEXT
      ),
    };
  });
  assert.equal(state, 'locked');
  assert.deepEqual(calls, [
    runnerProbe(target),
    [
      'docker',
      'exec',
      'abcdef123456',
      'node',
      '--',
      target.cli,
      'runner',
      'health',
      `--store=${target.store}`,
    ],
  ]);
  for (const result of [
    dockerResult('missing'),
    dockerResult('running', 'foreign'),
    { code: 255 },
  ]) {
    const refused = [];
    assert.equal(
      await inspectRunnerApplication(target, async (_, argv) => {
        refused.push(argv);
        return result;
      }),
      'unknown'
    );
    assert.deepEqual(refused, [runnerProbe(target)]);
  }
});
