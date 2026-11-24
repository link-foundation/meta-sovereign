import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDesktopLocalRunner } from '../electron/local-runner.js';
import { mergeRunnerConfiguration } from '../src/cli/runner-configuration.js';
import {
  runnerProfileData,
  validateRunnerProfile,
} from '../src/cli/runner-profile.js';
import { createRunnerControl } from '../src/server/runner-control.js';
import { acquireStoreLock } from '../src/storage/store-lock.js';
import {
  runnerFixture,
  runnerProfile,
} from '../../experiments/issue-56/runner-fixture.mjs';

const profile = runnerProfile();
const desktop = {
  isolation: 'desktop',
  store: profile.local.store,
  port: 8128,
};
const local = { ...desktop, session: profile.session };
const targets = () => validateRunnerProfile({ ...profile, local: desktop });

test('bundled desktop profiles use only a local listener and store and round-trip', () => {
  assert.deepEqual(targets().local, local);
  assert.deepEqual(runnerProfileData(targets()).local, desktop);
  assert.deepEqual(
    mergeRunnerConfiguration(profile, {
      local: { isolation: 'desktop', port: 8128 },
    }).local,
    local
  );
  assert.deepEqual(validateRunnerProfile(profile).local, {
    ...profile.local,
    isolation: 'screen',
    session: profile.session,
    node: 'node',
    start: '$',
  });
  for (const key of ['host', 'directory', 'cli', 'start', 'node', 'image']) {
    assert.throws(
      () => validateRunnerProfile({ local: { ...desktop, [key]: '/unused' } }),
      /invalid/
    );
  }
  assert.throws(
    () =>
      validateRunnerProfile({
        server: { ...desktop, host: 'worker.example.org' },
      }),
    /invalid/
  );
  for (const store of [undefined, './relative']) {
    assert.throws(
      () => validateRunnerProfile({ local: { ...desktop, store } }),
      /invalid/
    );
  }
});

const worker = (options) => {
  const child = new EventEmitter();
  child.kill = () => child.emit('exit', 1);
  child.postMessage = (message) => {
    child.emit('command', message);
    const replies = {
      prepare: true,
      start: options.start,
      inspect: options.health,
    };
    if (message.action === 'close') {
      child.emit('exit', 0);
    } else if (replies[message.action] !== undefined) {
      child.emit('message', {
        request: message.request,
        value: replies[message.action],
      });
    }
  };
  return child;
};

const ownerFixture = async (t, options = {}) => {
  const ownershipDirectory = await mkdtemp(join(tmpdir(), 'desktop-owner-'));
  const children = [];
  const runner = createDesktopLocalRunner({
    ownershipDirectory,
    startTimeout: 2000,
    stopTimeout: 2000,
    utilityProcess: {
      fork(entry, args) {
        assert.match(entry, /local-runner-worker\.js$/);
        assert.deepEqual(args, []);
        const child = worker(options);
        children.push(child);
        globalThis.queueMicrotask(() =>
          child.emit('message', { loaded: true })
        );
        return child;
      },
    },
  });
  t.after(async () => {
    await runner.close();
    await rm(ownershipDirectory, { recursive: true, force: true });
  });
  return { runner, children, ownershipDirectory };
};

test(
  'desktop marks a worker running only after its exact readiness acknowledgement',
  { timeout: 5000 },
  async (t) => {
    const { runner, children } = await ownerFixture(t, { health: 'ready' });
    assert.equal(await runner.status(local), 'stopped');
    const prepared = await runner.prepare(local);
    assert.equal(await runner.status(local), 'stopped');
    const [child] = children;
    const command = once(child, 'command');
    const starting = prepared.start();
    const [pending] = await command;
    assert.equal(pending.action, 'start');
    assert.equal(pending.store, local.store);
    assert.equal(pending.port, local.port);
    assert.equal(await runner.status(local), 'unknown');
    child.emit('message', { request: pending.request + 1, value: true });
    assert.equal(await runner.status(local), 'unknown');
    child.emit('message', { request: pending.request, value: true });
    assert.equal(await starting, true);
    await prepared.dispose();
    assert.equal(await runner.inspect(local), 'ready');
    assert.equal(await runner.status({ ...local, port: 8799 }), 'unknown');
    assert.equal(await runner.stop(local), true);
    assert.equal(await runner.status(local), 'stopped');
    assert.equal(await runner.inspect(local), 'unknown');
  }
);

test(
  'cancelled starts drain the utility process and permit a later explicit start',
  { timeout: 5000 },
  async (t) => {
    const options = {};
    const { runner, children } = await ownerFixture(t, options);
    const prepared = await runner.prepare(local);
    const controller = new AbortController();
    const starting = prepared.start({ signal: controller.signal });
    controller.abort();
    assert.equal(await starting, false);
    assert.equal(await runner.status(local), 'stopped');
    options.start = true;
    const retry = await runner.prepare(local);
    assert.equal(await retry.start(), true);
    await runner.close();
    assert.equal(await runner.status(local), 'stopped');
    assert.equal(await runner.prepare(local), null);
    assert.equal(children.length, 2);
  }
);

test(
  'another desktop process lease reports unknown and no shell commands run',
  { timeout: 5000 },
  async (t) => {
    const { runner, children, ownershipDirectory } = await ownerFixture(t);
    const lease = await acquireStoreLock(ownershipDirectory, {
      exclusive: true,
    });
    try {
      const fixture = runnerFixture({ server: 'running' });
      const control = createRunnerControl({
        targets: targets(),
        run: fixture.run,
        desktopRunner: runner,
      });
      assert.equal((await control.status()).states.local, 'unknown');
      assert.equal(
        (await control.act('start', 'local')).code,
        'runner-state-unconfirmed'
      );
      assert.equal(fixture.state.server, 'running');
      assert.ok(
        fixture.calls.every(
          (call) => call[1] === 'probe' && call[0] === 'server'
        )
      );
      assert.equal(children.length, 0);
    } finally {
      await lease.release();
    }
    assert.equal(await runner.status(local), 'stopped');
  }
);

test(
  'unavailable Electron support preserves the active remote peer',
  { timeout: 5000 },
  async () => {
    const fixture = runnerFixture({ server: 'running' });
    const control = createRunnerControl({
      targets: targets(),
      run: fixture.run,
    });
    assert.deepEqual((await control.act('start', 'local')).states, {
      local: 'unknown',
      server: 'running',
    });
    assert.ok(
      fixture.calls.every((call) => call[1] === 'probe' && call[0] === 'server')
    );
  }
);

test(
  'prepare precedes remote stop and the prepared worker drains if the peer refuses',
  { timeout: 5000 },
  async (t) => {
    const { runner, children } = await ownerFixture(t, { start: true });
    const fixture = runnerFixture(
      { server: 'running' },
      { stopFails: ['server'] }
    );
    const run = (target, argv, options) => {
      if (argv[1] === '--stop' || (argv[0] === 'screen' && argv[1] === '-S')) {
        assert.equal(children.length, 1);
      }
      return fixture.run(target, argv, options);
    };
    let elapsed = 0;
    const control = createRunnerControl({
      targets: targets(),
      run,
      desktopRunner: runner,
      now: () => elapsed,
      pause: async (milliseconds) => {
        elapsed += milliseconds;
      },
    });
    const outcome = await control.act('start', 'local');
    assert.equal(outcome.code, 'other-runner-stop-unconfirmed');
    assert.deepEqual(outcome.states, { local: 'stopped', server: 'running' });
    assert.equal(await runner.status(local), 'stopped');
    assert.equal(children.length, 1);
  }
);

test(
  'a concurrently changed peer drains the just-started desktop worker',
  { timeout: 5000 },
  async (t) => {
    const { runner } = await ownerFixture(t, { start: true });
    const fixture = runnerFixture({ server: 'stopped' });
    const run = async (target, argv, options) => {
      if ((await runner.status(local)) === 'running') {
        fixture.state.server = 'running';
      }
      return fixture.run(target, argv, options);
    };
    const control = createRunnerControl({
      targets: targets(),
      run,
      desktopRunner: runner,
    });
    const outcome = await control.act('start', 'local');
    assert.equal(outcome.code, 'other-runner-stop-unconfirmed');
    assert.deepEqual(outcome.states, { local: 'stopped', server: 'running' });
    assert.equal(await runner.status(local), 'stopped');
  }
);
