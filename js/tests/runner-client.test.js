import test from 'node:test';
import assert from 'node:assert/strict';
import { runnerApiFixture } from '../../experiments/issue-56/runner-api-fixture.mjs';
import { runCli } from '../src/cli/index.js';
import { requestRunner } from '../src/cli/runner-client.js';
import { encodeWire, LINO_TEXT } from '../src/transport/lino.js';

test(
  'real CLI selects the API without touching local control data or replaying a mutation',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture();
    const output = [];
    const options = {
      log: (line) => output.push(line),
      runner: {
        directory: () => {
          throw new Error('Local controller must not be used');
        },
      },
    };
    try {
      for (const args of [
        ['status'],
        ['start', 'server'],
        ['start', 'local'],
      ]) {
        assert.equal(
          await runCli(['runner', ...args, `--url=${fixture.base}`], options),
          0
        );
      }
      assert.deepEqual(
        fixture.backend.calls.filter(([, action]) => action !== 'probe'),
        [
          ['server', 'start'],
          ['server', 'stop'],
          ['local', 'start'],
        ]
      );
      assert.match(output.join('\n'), /isolated-session/);
      assert.doesNotMatch(
        output.join('\n'),
        /PRIVATE|fixture@example|\/fixture/
      );
    } finally {
      await fixture.close();
    }
    assert.equal(
      fixture.backend.state.local,
      'running',
      'closing the control API must not pretend it stopped a detached session'
    );
  }
);

test('runner client refuses invalid origins before issuing a request', async () => {
  let calls = 0;
  for (const url of [
    'file:///PRIVATE',
    'http://u:PRIVATE@host',
    'http://host/path',
    'http://host?token=PRIVATE',
    'http://host#PRIVATE',
    'PRIVATE',
  ]) {
    await assert.rejects(
      requestRunner({ url, action: 'status' }, async () => {
        calls++;
      })
    );
  }
  for (const input of [
    { action: 'delete' },
    { action: 'status', mode: 'local' },
    { action: 'start', mode: 'PRIVATE' },
  ]) {
    await assert.rejects(
      requestRunner({ url: 'http://fixture.invalid', ...input }, async () => {
        calls++;
      })
    );
  }
  assert.equal(calls, 0);
});

test('runner client rejects optimistic, malformed and HTTP failure receipts without retrying', async () => {
  const observed = {
    ok: true,
    scope: 'isolated-session',
    states: { local: 'running', server: 'stopped' },
  };
  for (const value of [
    null,
    { ok: true },
    { ...observed, scope: 'application-ready' },
    { ...observed, states: { local: 'running', server: 'running' } },
    { ...observed, states: { local: 'unknown', server: 'stopped' } },
    { ...observed, code: 'PRIVATE' },
    { ...observed, code: 'runner-start-unconfirmed' },
  ]) {
    let calls = 0;
    await assert.rejects(
      requestRunner(
        { url: 'http://fixture.invalid', action: 'start', mode: 'local' },
        async (_url, init) => {
          calls++;
          assert.equal(init.redirect, 'error');
          return new globalThis.Response(encodeWire(value, LINO_TEXT), {
            headers: { 'content-type': LINO_TEXT },
          });
        }
      )
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    requestRunner(
      { url: 'http://fixture.invalid', action: 'status' },
      async () => new globalThis.Response('PRIVATE', { status: 503 })
    )
  );
  const answer = await requestRunner(
    { url: 'http://fixture.invalid', action: 'start', mode: 'local' },
    async () =>
      new globalThis.Response(
        encodeWire({ ...observed, stderr: 'PRIVATE' }, LINO_TEXT),
        {
          headers: { 'content-type': LINO_TEXT },
        }
      )
  );
  assert.deepEqual(answer, observed);
});
