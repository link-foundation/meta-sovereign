import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunnerController } from '../src/server/runner-controller.js';
import { validateRunnerProfile } from '../src/cli/runner-profile.js';
import {
  runnerProfile,
  runnerFixture,
} from '../../experiments/issue-56/runner-fixture.mjs';

const privateController = async (run) => {
  const dir = await mkdtemp(join(tmpdir(), 'runner-controller-'));
  let profile = runnerProfile();
  const fixture = runnerFixture();
  const controller = createRunnerController({
    directory: () => dir,
    load: async () => validateRunnerProfile(profile),
    run: fixture.run,
  });
  try {
    await run({
      dir,
      fixture,
      controller,
      change: (next) => {
        profile = next;
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

test(
  'controller read does not launch, bind a session or open application data',
  { timeout: 5000 },
  async () =>
    privateController(async ({ dir, fixture, controller }) => {
      const result = await controller.execute({ action: 'status' });
      assert.equal(result.scope, 'isolated-session');
      assert.deepEqual(result.states, { local: 'stopped', server: 'stopped' });
      assert.equal(
        fixture.calls.every(([, action]) => action === 'probe'),
        true
      );
      for (const name of [
        'binding.lino',
        'data.lino',
        'data.bin',
        'data.lock',
      ]) {
        await assert.rejects(stat(join(dir, 'runner-control', name)), {
          code: 'ENOENT',
        });
      }
    })
);

test(
  'durable binding blocks a changed profile from hiding the old target',
  { timeout: 5000 },
  async () =>
    privateController(async ({ dir, fixture, controller, change }) => {
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'server' })).ok,
        true
      );
      const file = join(dir, 'runner-control', 'binding.lino');
      assert.match(await readFile(file, 'utf8'), /fixture@example.invalid/);
      if (process.platform !== 'win32') {
        assert.equal((await stat(file)).mode & 0o777, 0o600);
      }
      const next = runnerProfile();
      next.server.host = 'other@example.invalid';
      change(next);
      const before = fixture.calls.length;
      const refused = await controller.execute({
        action: 'start',
        mode: 'local',
      });
      assert.equal(refused.code, 'runner-profile-change-blocked');
      assert.equal(refused.states.server, 'running');
      assert.equal(
        fixture.calls.slice(before).every(([, action]) => action === 'probe'),
        true
      );
      fixture.state.server = 'unknown';
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'local' })).code,
        'runner-profile-change-blocked'
      );
      fixture.state.server = 'running';
      assert.equal(
        (await controller.execute({ action: 'stop', mode: 'server' })).ok,
        true
      );
      assert.match(await readFile(file, 'utf8'), /fixture@example.invalid/);
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'local' })).ok,
        true
      );
      assert.match(await readFile(file, 'utf8'), /other@example.invalid/);
    })
);

test(
  'missing profile retains read and stop access to the bound target, but refuses start',
  { timeout: 5000 },
  async () =>
    privateController(async ({ fixture, controller, change }) => {
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'server' })).ok,
        true
      );
      change(null);
      const answer = await controller.execute({ action: 'status' });
      assert.equal(answer.ok, true);
      assert.equal(answer.code, 'runner-profile-unavailable');
      assert.equal(answer.states.server, 'running');
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'local' })).ok,
        false
      );
      assert.equal(
        (await controller.execute({ action: 'stop', mode: 'server' })).ok,
        true
      );
      assert.equal(fixture.state.server, 'stopped');
    })
);

test(
  'ambiguous launch has a durable address before issue and cannot be hidden by editing the profile',
  { timeout: 5000 },
  async () =>
    privateController(async ({ dir, change }) => {
      let profile = runnerProfile();
      const fixture = runnerFixture({}, { launchState: 'unknown' });
      const controller = createRunnerController({
        directory: () => dir,
        load: async () => validateRunnerProfile(profile),
        run: async (target, argv, options) => {
          if (argv[1] === '--isolated') {
            assert.match(
              await readFile(
                join(dir, 'runner-control', 'binding.lino'),
                'utf8'
              ),
              /fixture@example.invalid/
            );
          }
          return fixture.run(target, argv, options);
        },
      });
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'server' })).code,
        'runner-start-unconfirmed'
      );
      profile = { ...profile, session: 'another-session' };
      change(profile);
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'local' })).code,
        'runner-profile-change-blocked'
      );
      assert.deepEqual(
        fixture.calls.filter(([, action]) => action !== 'probe'),
        [['server', 'start']]
      );
    })
);

test(
  'corrupt binding refuses before probing or mutating processes',
  { timeout: 5000 },
  async () =>
    privateController(async ({ dir, fixture, controller }) => {
      await controller.execute({ action: 'start', mode: 'local' });
      await writeFile(
        join(dir, 'runner-control', 'binding.lino'),
        'PRIVATE corrupt'
      );
      const count = fixture.calls.length;
      await assert.rejects(
        controller.execute({ action: 'start', mode: 'server' })
      );
      assert.equal(fixture.calls.length, count);
      await assert.rejects(stat(join(dir, 'runner-control', 'data.lock')), {
        code: 'ENOENT',
      });
    })
);

test(
  'a concurrent controller cannot acquire the lease while another launch is draining',
  { timeout: 5000 },
  async () =>
    privateController(async ({ dir, fixture }) => {
      let enter;
      let finish;
      const entered = new Promise((resolve) => {
        enter = resolve;
      });
      const pending = new Promise((resolve) => {
        finish = resolve;
      });
      const options = {
        directory: () => dir,
        load: async () => validateRunnerProfile(runnerProfile()),
        run: async (target, argv, signal) => {
          if (argv[1] === '--isolated') {
            enter();
            await pending;
          }
          return fixture.run(target, argv, signal);
        },
      };
      const first = createRunnerController(options).execute({
        action: 'start',
        mode: 'local',
      });
      try {
        await entered;
        await assert.rejects(
          createRunnerController(options).execute({
            action: 'start',
            mode: 'server',
          }),
          { code: 'STORE_LOCKED' }
        );
      } finally {
        finish();
        assert.equal((await first).ok, true);
      }
    })
);
