import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunnerControl } from '../src/server/runner-control.js';
import { observedRunnerState } from '../src/server/runner-session.js';
import { validateRunnerProfile } from '../src/cli/runner-profile.js';
import { stopScreenRunner } from '../src/server/runner-screen.js';
import {
  runnerProfile,
  screenResult,
} from '../../experiments/issue-56/runner-fixture.mjs';

const target = () => validateRunnerProfile(runnerProfile()).local;
const duplicate = () => ({
  code: 0,
  stdout: `There are screens on:\n123.meta-sovereign-test\t(date)\t(Detached)\n456.meta-sovereign-test\t(date)\t(Detached)\n2 Sockets in /run/screen/S-fixture.\n`,
});

test(
  'Stop uses the observed Screen identity when start history points to Docker',
  { timeout: 1000 },
  async () => {
    const selected = target();
    const calls = [];
    let running = true;
    const runner = createRunnerControl({
      targets: { local: selected },
      now: () => 0,
      pause: async () => {
        throw new Error('Unexpected shutdown wait');
      },
      run: async (_, argv) => {
        calls.push(argv);
        if (argv[0] === 'screen' && argv[1] === '-ls') {
          return screenResult(running ? 'running' : 'stopped');
        }
        if (argv[0] === 'screen' && argv[1] === '-S') {
          assert.deepEqual(argv, [
            'screen',
            '-S',
            '123.meta-sovereign-test',
            '-X',
            'stuff',
            '\u0003',
          ]);
          running = false;
          return { code: 0 };
        }
        return {
          code: 1,
          stderr: 'Failed to stop docker session: No such container',
        };
      },
    });
    assert.equal((await runner.act('stop', 'local')).ok, true);
    assert.equal(running, false);
    assert.equal(calls.filter((argv) => argv[1] === '-S').length, 1);
    assert.equal(
      calls.some((argv) => argv[1] === '--stop'),
      false
    );
  }
);

test('duplicate Screen names remain unknown instead of selecting one session', () => {
  assert.equal(observedRunnerState(target(), duplicate()), 'unknown');
});

test(
  'fresh Screen observation and cancellation refuse missing, ambiguous or changed names',
  { timeout: 1000 },
  async () => {
    for (const result of [
      screenResult('stopped'),
      screenResult('running', 'meta-sovereign-test-other'),
      screenResult('unknown'),
      duplicate(),
    ]) {
      const calls = [];
      assert.equal(
        await stopScreenRunner(
          target(),
          async (_, argv) => {
            calls.push(argv);
            return result;
          },
          {}
        ),
        false
      );
      assert.deepEqual(calls, [['screen', '-ls']]);
    }
    const abort = new AbortController();
    const calls = [];
    assert.equal(
      await stopScreenRunner(
        target(),
        async (_, argv) => {
          calls.push(argv);
          abort.abort();
          return screenResult('running');
        },
        { signal: abort.signal }
      ),
      false
    );
    assert.deepEqual(calls, [['screen', '-ls']]);
  }
);

test('a refused Screen signal never becomes an acknowledged native stop', async () => {
  const calls = [];
  assert.equal(
    await stopScreenRunner(
      target(),
      async (_, argv) => {
        calls.push(argv);
        return argv[1] === '-ls' ? screenResult('running') : { code: 1 };
      },
      {}
    ),
    false
  );
  assert.equal(calls.length, 2);
});
