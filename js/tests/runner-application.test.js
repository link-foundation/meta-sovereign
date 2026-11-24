import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRunnerControl } from '../src/server/runner-control.js';
import { runRunnerCommand } from '../src/server/runner-transport.js';
import { verifyRunnerApplication } from '../src/server/runner-application.js';
import { validateRunnerProfile } from '../src/cli/runner-profile.js';
import {
  dockerFixture,
  dockerProfile,
} from '../../experiments/issue-56/runner-docker-fixture.mjs';
import { runnerProfile } from '../../experiments/issue-56/runner-fixture.mjs';
import {
  runnerGraphFixture,
  runnerGraphBackend,
} from '../../experiments/issue-56/runner-graph-fixture.mjs';

const using = (fixture, profile = runnerProfile()) =>
  validateRunnerProfile({
    ...profile,
    server: { ...profile.server, ...fixture.target },
  });

test('a readable CLI with a missing module preserves the running peer', async (t) => {
  const fixture = await runnerGraphFixture();
  t.after(fixture.close);
  const backend = runnerGraphBackend();
  const control = createRunnerControl({
    targets: using(fixture),
    run: backend.run,
  });
  const result = await control.act('start', 'server');
  assert.equal(result.code, 'runner-application-dependencies-unavailable');
  assert.deepEqual(result.states, { local: 'running', server: 'stopped' });
  assert.equal(backend.graphChecks.length, 1);
  assert.equal(backend.graphChecks[0].code, 1);
  assert.ok(backend.calls.every(([, action]) => action === 'probe'));

  await fixture.repair();
  assert.equal((await control.act('start', 'server')).ok, true);
  assert.deepEqual(
    backend.graphChecks.map(({ stdout }) => stdout),
    ['', 'loaded']
  );
  assert.deepEqual(backend.state, { local: 'stopped', server: 'running' });
});

test('the production CLI and server graph load in an actual Node process', async () => {
  const directory = fileURLToPath(new URL('../../', import.meta.url));
  const target = {
    directory,
    cli: path.join(directory, 'js', 'bin', 'meta-sovereign.js'),
  };
  assert.equal(
    await verifyRunnerApplication(
      target,
      { node: 'node' },
      runRunnerCommand,
      {}
    ),
    true
  );
});

test('cancelling an in-flight graph check leaves the current peer untouched', async (t) => {
  const fixture = await runnerGraphFixture();
  t.after(fixture.close);
  const abort = new AbortController();
  const backend = runnerGraphBackend({
    execute: async (target, args, options) => {
      if (args[1] !== '--input-type=module') {
        return runRunnerCommand(target, args, options);
      }
      abort.abort();
      return { code: 0, stdout: 'loaded' };
    },
  });
  const control = createRunnerControl({
    targets: using(fixture),
    run: backend.run,
  });
  const result = await control.act('start', 'server', { signal: abort.signal });
  assert.equal(result.code, 'runner-state-unconfirmed');
  assert.ok(backend.calls.every(([, action]) => action === 'probe'));
  assert.equal(backend.state.local, 'running');
});

test('Docker graph import uses the fixed image and only a readonly application mount', async () => {
  const fixture = dockerFixture({
    initial: { local: 'running' },
    container: 'exited',
  });
  const target = {
    directory: '/app, owner',
    cli: '/app, owner/js/bin/meta-sovereign.js',
  };
  const targets = using({ target }, dockerProfile());
  let proof = 'loaded\nextra';
  const probes = [];
  const run = (selected, args, options) => {
    if (args[0] === 'docker' && args[1] === 'run') {
      probes.push(args);
      assert.deepEqual(args.slice(0, 13), [
        'docker',
        'run',
        '--rm',
        '--pull=never',
        '--read-only',
        '--network=none',
        '--mount',
        '"type=bind","source=/app, owner","target=/app, owner","readonly"',
        '--workdir',
        target.directory,
        '--entrypoint',
        'node',
        fixture.imageId,
      ]);
      assert.equal(args.at(-1), target.cli);
      assert.ok(!args.includes(targets.server.store));
      return { code: 0, stdout: proof };
    }
    return fixture.run(selected, args, options);
  };
  const control = createRunnerControl({ targets, run });
  assert.equal(
    (await control.act('start', 'server')).code,
    'runner-application-dependencies-unavailable'
  );
  assert.ok(fixture.calls.every((args) => args[2] !== 'rm'));
  assert.equal(fixture.screen.state.local, 'running');
  proof = 'loaded';
  assert.equal((await control.act('start', 'server')).ok, true);
  assert.equal(probes.length, 2);
});
