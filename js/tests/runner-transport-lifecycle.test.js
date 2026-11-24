import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunnerTransport } from '../src/server/runner-transport.js';
import { transportFixture } from '../../experiments/issue-56/runner-transport-fixture.mjs';

const target = { directory: '/fixture' };

test(
  'cancel escalates a stubborn child but retains ownership until close',
  { timeout: 1000 },
  async () => {
    const fixture = transportFixture();
    const phases = [];
    const run = createRunnerTransport({
      ...fixture,
      trace: (phase) => phases.push(phase),
    });
    const abort = new AbortController();
    const work = run(target, ['fixture'], { signal: abort.signal });
    let settled = false;
    work.then(() => {
      settled = true;
    });
    abort.abort();
    assert.deepEqual(fixture.signals, ['SIGTERM']);
    fixture.advance(999);
    assert.deepEqual(fixture.signals, ['SIGTERM']);
    fixture.advance(1);
    assert.deepEqual(fixture.signals, ['SIGTERM', 'SIGKILL']);
    fixture.report();
    await Promise.resolve();
    assert.equal(settled, false);
    fixture.close();
    assert.deepEqual(await work, {
      code: 'ABORT_ERR',
      stdout: '',
      stderr: '',
      aborted: true,
    });
    assert.equal(fixture.pendingTimers, 0);
    assert.deepEqual(phases, ['cancel', 'force-kill', 'closed']);
  }
);

test(
  'command deadline terminates a hung probe and refuses a late zero exit',
  { timeout: 1000 },
  async () => {
    const fixture = transportFixture();
    const run = createRunnerTransport(fixture);
    const work = run(target, ['fixture']);
    fixture.advance(9999);
    assert.deepEqual(fixture.signals, []);
    fixture.advance(1);
    assert.deepEqual(fixture.signals, ['SIGTERM']);
    fixture.advance(1000);
    assert.deepEqual(fixture.signals, ['SIGTERM', 'SIGKILL']);
    fixture.close();
    fixture.report(null, 'late success');
    const result = await work;
    assert.equal(result.code, 'ETIMEDOUT');
    assert.equal(result.aborted, true);
    assert.equal(fixture.pendingTimers, 0);
  }
);

test(
  'normal completion clears deadlines and later cancellation has no effects',
  { timeout: 1000 },
  async () => {
    const fixture = transportFixture();
    const abort = new AbortController();
    const run = createRunnerTransport(fixture);
    const work = run(target, ['fixture', 'literal'], { signal: abort.signal });
    fixture.report(null, 'observed', 'diagnostic');
    fixture.close();
    assert.deepEqual(await work, {
      code: 0,
      stdout: 'observed',
      stderr: 'diagnostic',
      aborted: false,
    });
    abort.abort();
    fixture.advance(20000);
    assert.deepEqual(fixture.signals, []);
    assert.equal(fixture.pendingTimers, 0);
    assert.equal(fixture.invocation.options.maxBuffer, 65536);
    assert.equal(fixture.invocation.options.cwd, '/fixture');
  }
);

test(
  'a cancelled invocation never starts a child',
  { timeout: 1000 },
  async () => {
    const fixture = transportFixture();
    const abort = new AbortController();
    abort.abort();
    const result = await createRunnerTransport(fixture)(target, ['fixture'], {
      signal: abort.signal,
    });
    assert.equal(result.code, 'ABORT_ERR');
    assert.equal(fixture.invocation, undefined);
    assert.equal(fixture.pendingTimers, 0);
  }
);
