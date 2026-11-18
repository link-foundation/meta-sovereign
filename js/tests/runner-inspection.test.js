import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runnerApiFixture } from '../../experiments/issue-56/runner-api-fixture.mjs';
import { runnerProfile } from '../../experiments/issue-56/runner-fixture.mjs';
import { requestRunner } from '../src/cli/runner-client.js';
import { inspectRunnerApplication } from '../src/server/runner-inspection.js';
import {
  runnerHealthReceipt,
  runnerInspectionReceipt,
} from '../src/transport/runner-health-receipt.js';
import {
  decodeWire,
  encodeWire,
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import { createRunnerApi } from '../src/web/runner-api.js';
import { runCli } from '../src/cli/index.js';
import { formatIndented } from 'lino-objects-codec';
import { writeFileDurable } from '../src/storage/durable.js';

const receipt = (state = 'ready', session = 'running') => ({
  ok: state !== 'unknown',
  scope: 'isolated-session',
  states: { local: session, server: 'stopped' },
  application: { mode: 'local', state },
  ...(state === 'unknown' ? { code: 'runner-application-unconfirmed' } : {}),
});

test(
  'inspection reads each configured application over Lino without launching or binding',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture({ initial: { local: 'running' } });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        for (const state of ['ready', 'locked', 'degraded', 'unknown']) {
          fixture.backend.health.local = state;
          const response = await fetch(
            `${fixture.base}/api/runner/inspect?mode=local`,
            { headers: { accept: type } }
          );
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert.equal(response.status, 200);
          assert.deepEqual(await readWireResponse(response), receipt(state));
        }
      }
      fixture.backend.health.local = 'ready';
      const output = [];
      assert.equal(
        await runCli(['runner', 'inspect', 'local', `--url=${fixture.base}`], {
          log: (line) => output.push(line),
        }),
        0
      );
      assert.equal(decodeWire(output[0], LINO_TEXT).application.state, 'ready');
      assert.ok(
        fixture.backend.calls.every(([, action]) =>
          ['probe', 'health'].includes(action)
        )
      );
      await assert.rejects(
        stat(join(fixture.dir, 'runner-control/binding.lino')),
        { code: 'ENOENT' }
      );
      const count = fixture.backend.calls.filter(
        ([, action]) => action === 'health'
      ).length;
      const stopped = await requestRunner({
        url: fixture.base,
        action: 'inspect',
        mode: 'server',
      });
      assert.equal(stopped.application.state, 'stopped');
      assert.equal(
        fixture.backend.calls.filter(([, action]) => action === 'health')
          .length,
        count
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'inspection retains the bound target after a profile edit',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture();
    try {
      await requestRunner({
        url: fixture.base,
        action: 'start',
        mode: 'server',
      });
      const binding = await readFile(
        join(fixture.dir, 'runner-control/binding.lino'),
        'utf8'
      );
      const profile = runnerProfile();
      profile.server.host = 'new-owner@example.invalid';
      await writeFileDurable(
        join(fixture.dir, 'runner.lino'),
        formatIndented({ id: 'runner', obj: profile })
      );
      // The backend records the exact target passed by the shared controller.
      const index = fixture.backend.targets.length;
      const answer = await requestRunner({
        url: fixture.base,
        action: 'inspect',
        mode: 'server',
      });
      assert.equal(answer.application.state, 'ready');
      assert.equal(answer.code, 'runner-profile-change-blocked');
      assert.equal(
        fixture.backend.targets
          .slice(index)
          .every((target) => target.host !== profile.server.host),
        true
      );
      assert.equal(
        await readFile(
          join(fixture.dir, 'runner-control/binding.lino'),
          'utf8'
        ),
        binding
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'inspection rejects foreign origins, duplicate selectors, bodies and arbitrary targets before execution',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture();
    try {
      for (const query of [
        '',
        '?mode=other',
        '?mode=local&mode=server',
        '?mode=local&host=PRIVATE',
      ]) {
        assert.equal(
          (await fetch(`${fixture.base}/api/runner/inspect${query}`)).status,
          400
        );
      }
      assert.equal(
        (
          await fetch(`${fixture.base}/api/runner/inspect?mode=local`, {
            headers: { origin: 'https://foreign.invalid' },
          })
        ).status,
        403
      );
      assert.equal(
        (
          await fetch(`${fixture.base}/api/runner/inspect?mode=local`, {
            method: 'POST',
            headers: { 'content-type': LINO_TEXT },
            body: 'PRIVATE',
          })
        ).status,
        405
      );
      assert.deepEqual(fixture.backend.calls, []);
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
        await response.arrayBuffer();
      }
      assert.equal(
        (await fetch(`${fixture.base}/api/runner/inspect?mode=local`)).status,
        423
      );
      assert.deepEqual(fixture.backend.calls, []);
    } finally {
      await fixture.close();
    }
  }
);

test('application receipts reject contradictory states and project private diagnostics away', () => {
  assert.deepEqual(
    runnerHealthReceipt({
      ok: true,
      scope: 'application-worker',
      state: 'locked',
      private: 'PRIVATE',
    }),
    { ok: true, scope: 'application-worker', state: 'locked' }
  );
  for (const value of [
    null,
    { ok: true, state: 'ready' },
    { ok: true, scope: 'application-worker', state: 'unknown' },
  ]) {
    assert.throws(() => runnerHealthReceipt(value));
  }
  assert.deepEqual(
    runnerInspectionReceipt({ ...receipt(), private: 'PRIVATE' }, 'local'),
    receipt()
  );
  for (const value of [
    receipt('ready', 'stopped'),
    { ...receipt(), ok: false },
    { ...receipt(), application: { mode: 'server', state: 'ready' } },
  ]) {
    assert.throws(() => runnerInspectionReceipt(value, 'local'));
  }
  assert.throws(() => runnerInspectionReceipt(receipt(), 'PRIVATE'));
});

test(
  'configured health transport rejects failed, noisy, malformed and cancelled replies',
  { timeout: 5000 },
  async () => {
    const target = { ...runnerProfile().server, session: 'fixture' };
    const success = {
      code: 0,
      stdout: encodeWire(
        { ok: true, scope: 'application-worker', state: 'ready' },
        LINO_TEXT
      ),
      stderr: '',
    };
    let invocation;
    assert.equal(
      await inspectRunnerApplication(target, async (...args) => {
        invocation = args;
        return success;
      }),
      'ready'
    );
    assert.deepEqual(invocation[1], [
      'node',
      '--',
      target.cli,
      'runner',
      'health',
      `--store=${target.store}`,
    ]);
    for (const result of [
      { ...success, code: 1 },
      { ...success, stderr: 'PRIVATE' },
      { ...success, stdout: 'PRIVATE' },
      { ...success, aborted: true },
    ]) {
      assert.equal(
        await inspectRunnerApplication(target, async () => result),
        'unknown'
      );
    }
    const abort = new AbortController();
    assert.equal(
      await inspectRunnerApplication(
        target,
        async (_target, _argv, { signal }) => {
          abort.abort();
          assert.equal(signal.aborted, true);
          return success;
        },
        { signal: abort.signal }
      ),
      'unknown'
    );
    assert.equal(
      await inspectRunnerApplication(
        target,
        () => {
          throw new Error('must not call');
        },
        { signal: abort.signal }
      ),
      'unknown'
    );
  }
);

test('browser inspection uses one read without recovery and projects the receipt', async () => {
  const calls = [];
  const api = createRunnerApi({
    serverResponse: async (...args) => {
      calls.push(args);
      return {
        ok: true,
        json: async () => ({ ...receipt(), private: 'PRIVATE' }),
      };
    },
  });
  assert.deepEqual(await api.runnerRequest('inspect', 'local'), receipt());
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/runner/inspect?mode=local');
  assert.equal(calls[0][1].body, undefined);
  assert.equal(calls[0][2].recover, false);
});
