import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunnerControl } from '../src/server/runner-control.js';
import { validateRunnerProfile } from '../src/cli/runner-profile.js';
import {
  runnerFixture,
  runnerProfile,
} from '../../experiments/issue-56/runner-fixture.mjs';

const mutations = (fixture) =>
  fixture.calls.filter(([, action]) => action !== 'probe');

for (const mode of ['local', 'server']) {
  const other = mode === 'local' ? 'server' : 'local';
  for (const changed of ['running', 'unknown']) {
    test(
      `${mode} Start refuses a ${changed} other mode observed after launch`,
      { timeout: 1000 },
      async () => {
        const fixture = runnerFixture();
        const runner = createRunnerControl({
          targets: validateRunnerProfile(runnerProfile()),
          run: async (target, argv, options) => {
            const result = await fixture.run(target, argv, options);
            if (argv[1] === '--isolated') {
              // Includes SSH aliases sharing the local Screen namespace.
              fixture.state[other] = changed;
            }
            return result;
          },
        });
        const result = await runner.act('start', mode);
        assert.equal(result.ok, false);
        assert.equal(result.code, 'other-runner-stop-unconfirmed');
        assert.deepEqual(result.states, {
          [mode]: 'running',
          [other]: changed,
        });
        assert.deepEqual(mutations(fixture), [[mode, 'start']]);
        assert.deepEqual((await runner.status()).states, result.states);
      }
    );
  }
  test(
    `${mode} Start rechecks exclusion before accepting an already running target`,
    { timeout: 1000 },
    async () => {
      const fixture = runnerFixture({ [mode]: 'running' });
      let observed = 0;
      const runner = createRunnerControl({
        targets: validateRunnerProfile(runnerProfile()),
        run: async (target, argv, options) => {
          const result = await fixture.run(target, argv, options);
          if (
            argv[1] === '-ls' &&
            (target.host ? 'server' : 'local') === mode &&
            ++observed === 2
          ) {
            fixture.state[other] = 'running';
          }
          return result;
        },
      });
      const result = await runner.act('start', mode);
      assert.equal(result.ok, false);
      assert.equal(result.code, 'other-runner-stop-unconfirmed');
      assert.equal(result.states[other], 'running');
      assert.deepEqual(mutations(fixture), []);
    }
  );
}
