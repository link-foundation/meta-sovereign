import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli/index.js';
import { validateRunnerProfile } from '../src/cli/runner-profile.js';
import {
  runnerFixture,
  runnerProfile,
} from '../../experiments/issue-56/runner-fixture.mjs';

test(
  'first-use default profile observes unconfigured modes without launching or installing',
  { timeout: 5000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runner-cli-default-'));
    const output = [];
    const fixture = runnerFixture();
    try {
      assert.equal(
        await runCli(['runner', 'status'], {
          log: (line) => output.push(line),
          runner: { directory: () => dir, run: fixture.run },
        }),
        0
      );
      assert.match(output.join('\n'), /unconfigured/);
      assert.deepEqual(fixture.calls, []);
      assert.equal(
        await runCli(['runner', 'start', 'local'], {
          log: () => {},
          runner: { directory: () => dir, run: fixture.run },
        }),
        1
      );
      assert.deepEqual(fixture.calls, []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'real CLI admits runner without store migration, auto start or leaking transport failures',
  { timeout: 5000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runner-cli-'));
    const fixture = runnerFixture({ server: 'unknown' });
    const output = [];
    const options = {
      log: (line) => output.push(line),
      runner: {
        directory: () => dir,
        load: async () => validateRunnerProfile(runnerProfile()),
        run: fixture.run,
      },
    };
    const signals = ['SIGINT', 'SIGTERM'].map((name) =>
      process.listenerCount(name)
    );
    try {
      assert.equal(await runCli(['runner', 'status'], options), 0);
      assert.match(output.join('\n'), /unknown/);
      assert.equal(await runCli(['runner', 'start', 'local'], options), 1);
      assert.equal(
        fixture.calls.every(([, action]) => action === 'probe'),
        true
      );
      assert.doesNotMatch(
        output.join('\n'),
        /PRIVATE|fixture@example|\/fixture/
      );
      assert.deepEqual(
        ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name)),
        signals
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'runner rejects malformed actions and flags before loading profiles or touching a backend',
  { timeout: 3000 },
  async () => {
    let touched = 0;
    const options = {
      log: () => {},
      runner: {
        load: async () => {
          touched += 1;
          throw new Error('PRIVATE');
        },
      },
    };
    for (const args of [
      [],
      ['start'],
      ['start', 'elsewhere'],
      ['status', 'local'],
      ['stop', 'local', 'extra'],
      ['status', '--profile'],
      ['status', '--profile='],
      ['status', '--token=PRIVATE'],
      ['status', '--store=PRIVATE'],
    ]) {
      assert.equal(await runCli(['runner', ...args], options), 1);
    }
    assert.equal(touched, 0);
  }
);
