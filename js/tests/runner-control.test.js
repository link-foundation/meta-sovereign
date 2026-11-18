import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunnerControl } from '../src/server/runner-control.js';
import {
  observedRunnerState,
  runnerLaunch,
} from '../src/server/runner-session.js';
import { validateRunnerProfile } from '../src/cli/runner-profile.js';
import {
  runnerFixture,
  runnerProfile,
  screenResult,
} from '../../experiments/issue-56/runner-fixture.mjs';

const targets = () => validateRunnerProfile(runnerProfile());
const control = (fixture) => {
  let elapsed = 0;
  return createRunnerControl({
    targets: targets(),
    run: fixture.run,
    now: () => elapsed,
    pause: async (milliseconds) => {
      elapsed += milliseconds;
    },
  });
};
const mutations = (fixture) =>
  fixture.calls.filter(([, action]) => action !== 'probe');

test(
  'switch rechecks a destination that shares the stopped backend session',
  { timeout: 3000 },
  async () => {
    const fixture = runnerFixture({ local: 'running', server: 'running' });
    const run = async (target, argv, options) => {
      const result = await fixture.run(target, argv, options);
      if (argv[0] === 'screen' && argv[1] === '-S') {
        fixture.state.local = 'stopped';
      }
      return result;
    };
    const runner = createRunnerControl({ targets: targets(), run });
    const result = await runner.act('start', 'local');
    assert.equal(result.ok, true);
    assert.equal(fixture.state.local, 'running');
    assert.deepEqual(mutations(fixture), [
      ['server', 'stop'],
      ['local', 'start'],
    ]);
  }
);

test(
  'runner status observes both targets without launching or stopping',
  { timeout: 3000 },
  async () => {
    const fixture = runnerFixture({ local: 'running' });
    assert.deepEqual(await control(fixture).status(), {
      ok: true,
      states: { local: 'running', server: 'stopped' },
    });
    assert.deepEqual(mutations(fixture), []);
  }
);

test(
  'each runner switch positively stops the other before starting',
  { timeout: 3000 },
  async () => {
    for (const mode of ['local', 'server']) {
      const other = mode === 'local' ? 'server' : 'local';
      const fixture = runnerFixture({ [other]: 'running' });
      const result = await control(fixture).act('start', mode);
      assert.equal(result.ok, true);
      assert.deepEqual(result.states, {
        [mode]: 'running',
        [other]: 'stopped',
      });
      assert.deepEqual(mutations(fixture), [
        [other, 'stop'],
        [mode, 'start'],
      ]);
      const stopIndex = fixture.calls.findIndex(
        ([name, action]) => name === other && action === 'stop'
      );
      assert.deepEqual(fixture.calls[stopIndex + 1], [other, 'probe']);
      await control(fixture).act('start', mode);
      assert.equal(
        mutations(fixture).length,
        2,
        'already-running session was launched twice'
      );
    }
  }
);

test(
  'unknown transport, unconfirmed stop and optimistic launch never authorize success',
  { timeout: 3000 },
  async () => {
    const unknown = runnerFixture({ server: 'unknown' });
    assert.equal(
      (await control(unknown).act('start', 'local')).code,
      'other-runner-stop-unconfirmed'
    );
    assert.deepEqual(mutations(unknown), []);
    const stopFailed = runnerFixture(
      { server: 'running' },
      { stopFails: ['server'] }
    );
    assert.equal((await control(stopFailed).act('start', 'local')).ok, false);
    assert.deepEqual(mutations(stopFailed), [['server', 'stop']]);
    for (const options of [
      { launchState: 'stopped' },
      { launchState: 'unknown' },
      { launchCode: 1 },
    ]) {
      const fixture = runnerFixture({}, options);
      assert.equal(
        (await control(fixture).act('start', 'local')).code,
        'runner-start-unconfirmed'
      );
      assert.equal(
        mutations(fixture).length,
        1,
        'ambiguous mutation was retried'
      );
    }
  }
);

test(
  'unknown destination is refused before stopping the currently healthy mode',
  { timeout: 3000 },
  async () => {
    const fixture = runnerFixture({ local: 'unknown', server: 'running' });
    assert.equal(
      (await control(fixture).act('start', 'local')).code,
      'runner-state-unconfirmed'
    );
    assert.deepEqual(mutations(fixture), []);
  }
);

test(
  'stop is idempotent and never mutates unknown or unconfigured targets',
  { timeout: 3000 },
  async () => {
    const fixture = runnerFixture({ local: 'running', server: 'unknown' });
    const runner = control(fixture);
    assert.equal((await runner.act('stop', 'local')).ok, true);
    assert.equal((await runner.act('stop', 'local')).ok, true);
    assert.equal((await runner.act('stop', 'server')).ok, false);
    assert.deepEqual(mutations(fixture), [['local', 'stop']]);
    const absent = createRunnerControl({ targets: {}, run: fixture.run });
    assert.equal(
      (await absent.act('start', 'local')).code,
      'runner-unconfigured'
    );
    assert.equal(
      (await absent.act('terminate', 'local')).code,
      'invalid-runner-action'
    );
  }
);

test(
  'cancelling a switch never starts the destination after the other stop',
  { timeout: 3000 },
  async () => {
    const abort = new AbortController();
    const fixture = runnerFixture({ server: 'running' });
    const run = async (target, argv, options) => {
      const answer = await fixture.run(target, argv, options);
      if (argv[0] === 'screen' && argv[1] === '-S') {
        abort.abort();
      }
      return answer;
    };
    const runner = createRunnerControl({ targets: targets(), run });
    assert.equal(
      (await runner.act('start', 'local', { signal: abort.signal })).ok,
      false
    );
    assert.deepEqual(mutations(fixture), [['server', 'stop']]);
  }
);

test('screen observation requires complete output, exact session and successful transport', () => {
  const target = targets().local;
  assert.equal(observedRunnerState(target, screenResult('running')), 'running');
  assert.equal(
    observedRunnerState(
      target,
      screenResult('running', `${target.session}-other`)
    ),
    'stopped'
  );
  assert.equal(observedRunnerState(target, screenResult('stopped')), 'stopped');
  for (const result of [
    { ...screenResult('running'), code: 255 },
    { ...screenResult('stopped'), code: 0 },
    { ...screenResult('running'), aborted: true },
    { ...screenResult('running'), stderr: 'connection closed' },
    {
      code: 0,
      stdout: screenResult('running').stdout.replace('1 Socket', '2 Sockets'),
    },
    {
      code: 0,
      stdout: 'There are screens on:\n1 Socket in /run/screen/S-fixture.',
    },
    { code: 0, stdout: 'No sessions found.' },
  ]) {
    assert.equal(observedRunnerState(target, result), 'unknown');
  }
});

test('launch uses screen/start, literal argv and explicit noninteractive serve options', () => {
  const target = targets().local;
  const argv = runnerLaunch(target);
  assert.deepEqual(argv.slice(0, 11), [
    '$',
    '--isolated',
    'screen',
    '--session',
    target.session,
    '--detached',
    '--',
    'node',
    '--',
    target.cli,
    'serve',
  ]);
  assert.ok(argv.includes(`--store=${target.store}`));
  assert.ok(argv.includes('--open=false'));
  assert.ok(argv.includes('--trust=false'));
});

test(
  'both launch paths use the documented start session selector before the command separator',
  { timeout: 3000 },
  async () => {
    for (const mode of ['local', 'server']) {
      const fixture = runnerFixture();
      const run = async (target, argv, options) => {
        if (argv[1] === '--isolated') {
          const wrapper = argv.slice(1, argv.indexOf('--'));
          // start rejects unknown wrapper flags before executing the command.
          if (
            wrapper.includes('--name') ||
            wrapper[2] !== '--session' ||
            wrapper[3] !== target.session
          ) {
            return { code: 1, stdout: '', stderr: 'Unknown wrapper option' };
          }
        }
        return fixture.run(target, argv, options);
      };
      const runner = createRunnerControl({ targets: targets(), run });
      assert.equal((await runner.act('start', mode)).ok, true);
      assert.equal(fixture.state[mode], 'running');
      assert.deepEqual(mutations(fixture), [[mode, 'start']]);
    }
  }
);
