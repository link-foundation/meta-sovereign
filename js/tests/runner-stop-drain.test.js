import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunnerControl } from '../src/server/runner-control.js';
import { createRunnerController } from '../src/server/runner-controller.js';
import { validateRunnerProfile } from '../src/cli/runner-profile.js';
import {
  runnerFixture,
  runnerProfile,
} from '../../experiments/issue-56/runner-fixture.mjs';

const delayed = ({
  mode = 'local',
  after = 3,
  abort,
  unknown = false,
} = {}) => {
  const fixture = runnerFixture({ [mode]: 'running' }, { stopFails: [mode] });
  let elapsed = 0;
  let waits = 0;
  const runner = createRunnerControl({
    targets: validateRunnerProfile(runnerProfile()),
    run: fixture.run,
    now: () => elapsed,
    pause: async (milliseconds, _, options) => {
      assert.equal(options.signal, abort?.signal);
      elapsed += milliseconds;
      waits++;
      if (waits === after) {
        fixture.state[mode] = unknown ? 'unknown' : 'stopped';
      }
      if (abort) {
        abort.abort();
      }
    },
  });
  return { fixture, runner, elapsed: () => elapsed, waits: () => waits };
};
const mutations = (fixture) =>
  fixture.calls.filter(([, action]) => action !== 'probe');

test(
  'Stop waits for observed cleanup after one signal in either mode',
  { timeout: 1000 },
  async () => {
    for (const mode of ['local', 'server']) {
      const { fixture, runner, waits } = delayed({ mode });
      const result = await runner.act('stop', mode);
      assert.equal(result.ok, true);
      assert.equal(result.states[mode], 'stopped');
      assert.equal(waits(), 3);
      assert.deepEqual(mutations(fixture), [[mode, 'stop']]);
    }
  }
);

test(
  'switch launches only after the other session finishes draining',
  { timeout: 1000 },
  async () => {
    for (const mode of ['local', 'server']) {
      const other = mode === 'local' ? 'server' : 'local';
      const { fixture, runner, waits } = delayed({ mode: other });
      const result = await runner.act('start', mode);
      assert.equal(result.ok, true);
      assert.equal(waits(), 3);
      assert.deepEqual(result.states, {
        [mode]: 'running',
        [other]: 'stopped',
      });
      assert.deepEqual(mutations(fixture), [
        [other, 'stop'],
        [mode, 'start'],
      ]);
    }
  }
);

test(
  'a stuck session exhausts a finite deadline without retrying Stop or launching',
  { timeout: 1000 },
  async () => {
    const { fixture, runner, elapsed, waits } = delayed({
      mode: 'server',
      after: Infinity,
    });
    const result = await runner.act('start', 'local');
    assert.equal(result.code, 'other-runner-stop-unconfirmed');
    assert.equal(result.states.server, 'running');
    assert.equal(elapsed(), 10000);
    assert.equal(waits(), 100);
    assert.deepEqual(mutations(fixture), [['server', 'stop']]);
  }
);

test(
  'losing observation while draining refuses the switch immediately',
  { timeout: 1000 },
  async () => {
    const { fixture, runner, waits } = delayed({
      mode: 'server',
      unknown: true,
    });
    const result = await runner.act('start', 'local');
    assert.equal(result.code, 'other-runner-stop-unconfirmed');
    assert.equal(result.states.server, 'unknown');
    assert.equal(waits(), 3);
    assert.deepEqual(mutations(fixture), [['server', 'stop']]);
  }
);

test(
  'cancellation while draining never admits a destination launch',
  { timeout: 1000 },
  async () => {
    const abort = new AbortController();
    const { fixture, runner, waits } = delayed({ mode: 'server', abort });
    const result = await runner.act('start', 'local', { signal: abort.signal });
    assert.equal(result.ok, false);
    assert.equal(waits(), 1);
    assert.deepEqual(mutations(fixture), [['server', 'stop']]);
  }
);

test(
  'the durable controller lease remains held while shutdown is settling',
  { timeout: 3000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'runner-stop-lease-'));
    const fixture = runnerFixture({}, { stopFails: ['local'] });
    const reached = Promise.withResolvers();
    const finish = Promise.withResolvers();
    let stopping = false;
    let probes = 0;
    const run = async (target, args, options) => {
      if (args[1] === '--stop') {
        stopping = true;
      }
      if (stopping && args[0] === 'screen' && ++probes === 2) {
        reached.resolve();
        await finish.promise;
        fixture.state.local = 'stopped';
      }
      return fixture.run(target, args, options);
    };
    const controller = createRunnerController({
      directory: () => directory,
      load: async () => validateRunnerProfile(runnerProfile()),
      run,
    });
    let pending;
    try {
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'local' })).ok,
        true
      );
      pending = controller.execute({ action: 'stop', mode: 'local' });
      await Promise.race([
        reached.promise,
        pending.then(() => {
          throw new Error('Stop returned before settlement');
        }),
      ]);
      await assert.rejects(
        controller.execute({ action: 'start', mode: 'server' }),
        { code: 'STORE_LOCKED' }
      );
      assert.deepEqual(mutations(fixture), [
        ['local', 'start'],
        ['local', 'stop'],
      ]);
      finish.resolve();
      assert.equal((await pending).ok, true);
    } finally {
      finish.resolve();
      await pending;
      await rm(directory, { recursive: true, force: true });
    }
  }
);
