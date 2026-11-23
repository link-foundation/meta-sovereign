import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  runnerApiFixture,
  runnerApplicationRefusalFixture,
} from '../../experiments/issue-56/runner-api-fixture.mjs';
import { runnerFixture } from '../../experiments/issue-56/runner-fixture.mjs';
import { acquireStoreLock } from '../src/storage/store-lock.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const post = (fixture, action, body, type = LINO_TEXT, extra = {}) =>
  fetch(`${fixture.base}/api/runner/${action}`, {
    method: 'POST',
    headers: { 'content-type': type, accept: type, ...extra },
    body: encodeWire(body, type),
  });

test(
  'a missing runner application keeps the working peer and allows an explicit retry',
  { timeout: 10000 },
  async () => {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const fixture = await runnerApplicationRefusalFixture();
      try {
        const refused = await readWireResponse(
          await post(fixture, 'start', { mode: 'server' }, type)
        );
        assert.deepEqual(refused.states, {
          local: 'running',
          server: 'stopped',
        });
        assert.deepEqual(refused, {
          ok: false,
          code: 'runner-application-unavailable',
          scope: 'isolated-session',
          states: { local: 'running', server: 'stopped' },
        });
        assert.ok(
          fixture.backend.calls.every(([, action]) => action === 'probe')
        );
        fixture.backend.application.server = true;
        const retried = await readWireResponse(
          await post(fixture, 'start', { mode: 'server' }, type)
        );
        assert.deepEqual(retried, {
          ok: true,
          scope: 'isolated-session',
          states: { local: 'stopped', server: 'running' },
        });
      } finally {
        await fixture.close();
      }
    }
  }
);

test(
  'runner API observes and switches both directions through text and binary Lino',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture();
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(`${fixture.base}/api/runner`, {
          headers: { accept: type },
        });
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const observed = await readWireResponse(response);
        assert.equal(observed.scope, 'isolated-session');
        assert.deepEqual(observed.states, {
          local: 'stopped',
          server: 'stopped',
        });
        assert.ok(
          fixture.backend.calls.every(([, action]) => action === 'probe')
        );
        for (const mode of ['local', 'server', 'local']) {
          const result = await readWireResponse(
            await post(fixture, 'start', { mode }, type)
          );
          assert.equal(result.ok, true);
          assert.equal(result.states[mode], 'running');
          assert.equal(
            result.states[mode === 'local' ? 'server' : 'local'],
            'stopped'
          );
        }
        assert.equal(
          (
            await readWireResponse(
              await post(fixture, 'stop', { mode: 'local' }, type)
            )
          ).ok,
          true
        );
        fixture.backend.calls.length = 0;
      }
    } finally {
      await fixture.close();
    }
  }
);

test(
  'runner API rejects foreign origins, arbitrary targets, malformed bodies and JSON by default',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture();
    try {
      assert.equal(
        (
          await fetch(`${fixture.base}/api/runner`, {
            headers: { origin: 'https://foreign.invalid' },
          })
        ).status,
        403
      );
      assert.equal(
        (await fetch(`${fixture.base}/api/runner`, { method: 'DELETE' }))
          .status,
        405
      );
      for (const body of [
        {},
        { mode: 'other' },
        { mode: 'local', profile: '/PRIVATE' },
        { mode: 'local', host: 'PRIVATE' },
      ]) {
        assert.equal((await post(fixture, 'start', body)).status, 400);
      }
      assert.equal(
        (
          await post(fixture, 'start', { mode: 'local' }, LINO_TEXT, {
            origin: 'https://foreign.invalid',
          })
        ).status,
        403
      );
      assert.equal(
        (
          await fetch(`${fixture.base}/api/runner/start`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"mode":"local"}',
          })
        ).status,
        415
      );
      const malformed = await fetch(`${fixture.base}/api/runner/start`, {
        method: 'POST',
        headers: { 'content-type': LINO_TEXT },
        body: '(',
      });
      assert.equal(malformed.status, 400);
      assert.equal(
        (
          await post(fixture, 'start', {
            mode: 'local',
            extra: 'x'.repeat(2048),
          })
        ).status,
        413
      );
      assert.deepEqual(fixture.backend.calls, []);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'runner API retains unknown SSH state and refuses mutations without leaking private transport details',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture({ initial: { server: 'unknown' } });
    try {
      const result = await readWireResponse(
        await post(fixture, 'start', { mode: 'local' })
      );
      assert.equal(result.ok, false);
      assert.equal(result.states.server, 'unknown');
      assert.doesNotMatch(
        JSON.stringify(result),
        /PRIVATE|fixture@example|\/fixture/
      );
      assert.ok(
        fixture.backend.calls.every(([, action]) => action === 'probe')
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'runner status and actions respect the application passcode',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture();
    try {
      for (const [action, body] of [
        ['set', { passcode: 'fixture' }],
        ['lock', {}],
      ]) {
        const response = await fetch(`${fixture.base}/api/passcode/${action}`, {
          method: 'POST',
          headers: { 'content-type': LINO_TEXT },
          body: encodeWire(body, LINO_TEXT),
        });
        assert.equal(response.status, 200);
      }
      assert.equal((await fetch(`${fixture.base}/api/runner`)).status, 423);
      assert.equal(
        (await post(fixture, 'start', { mode: 'local' })).status,
        423
      );
      assert.deepEqual(fixture.backend.calls, []);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'server close aborts runner transports, keeps their lease until drained and retains target binding',
  { timeout: 10000 },
  async () => {
    const backend = runnerFixture();
    const { promise: entered, resolve: enter } = Promise.withResolvers();
    const { promise: aborted, resolve: abort } = Promise.withResolvers();
    const { promise: cleanup, resolve: release } = Promise.withResolvers();
    const fixture = await runnerApiFixture({
      control: {
        run: async (target, argv, options) => {
          if (argv[1] === '--isolated') {
            enter();
            options.signal.addEventListener('abort', abort, { once: true });
            await cleanup;
          }
          return backend.run(target, argv, options);
        },
      },
    });
    let settled = false;
    const pending = post(fixture, 'start', { mode: 'local' }).catch(() => null);
    let closing;
    try {
      await entered;
      closing = fixture.close().then(() => {
        settled = true;
      });
      await aborted;
      assert.equal(settled, false);
      await assert.rejects(
        acquireStoreLock(join(fixture.dir, 'runner-control'), {
          exclusive: true,
        }),
        { code: 'STORE_LOCKED' }
      );
      assert.ok(
        await stat(join(fixture.dir, 'runner-control', 'binding.lino'))
      );
    } finally {
      release();
      await pending;
      await (closing ?? fixture.close());
    }
    assert.equal(settled, true);
  }
);
