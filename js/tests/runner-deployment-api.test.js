import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatIndented, parseIndented } from 'lino-objects-codec';
import { runnerApiFixture } from '../../experiments/issue-56/runner-api-fixture.mjs';
import { requestRunner } from '../src/cli/runner-client.js';
import { runCli } from '../src/cli/index.js';
import { acquireStoreLock } from '../src/storage/store-lock.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const applicationSource = `v1.5.0@${'a'.repeat(64)}`;
const applicationLock = 'b'.repeat(64);
const server = {
  cli: '/fixture/remote/js/bin/meta-sovereign.js',
  applicationSource,
  applicationLock,
};
const endpoint = (fixture, action) => `${fixture.base}/api/runner/${action}`;
const preview = (fixture) =>
  requestRunner({ url: fixture.base, action: 'deploy-plan', mode: 'server' });
const post = (fixture, input, type = LINO_TEXT, extra = {}) =>
  fetch(endpoint(fixture, 'deploy'), {
    method: 'POST',
    headers: { 'content-type': type, accept: type, ...extra },
    body: encodeWire(input, type),
  });

test(
  'source preview and revision-checked preparation leave a running peer untouched',
  { timeout: 10000 },
  async (t) => {
    const calls = [];
    const fixture = await runnerApiFixture({
      overlay: { server },
      initial: { local: 'running' },
      control: {
        async prepareSource(target, plan) {
          calls.push(target);
          return { ...plan, state: 'prepared' };
        },
      },
    });
    t.after(fixture.close);
    const first = await preview(fixture);
    assert.equal(
      first.source,
      'https://github.com/link-foundation/meta-sovereign/releases/download/v1.5.0/meta-sovereign-runner-source.tar.gz'
    );
    assert.equal(first.directory, '/fixture/remote');
    assert.equal(first.host, 'fixture@example.invalid');
    assert.equal(first.applicationLock, applicationLock);
    const changed = { ...server, host: 'reviewed@example.invalid' };
    await writeFile(
      join(fixture.localDir, 'runner.lino'),
      formatIndented({ id: 'runner', obj: { server: changed } })
    );
    assert.deepEqual(
      await readWireResponse(
        await post(fixture, { mode: 'server', revision: first.revision })
      ),
      {
        ok: false,
        code: 'runner-source-plan-changed',
      }
    );
    const input = {
      mode: 'server',
      revision: (await preview(fixture)).revision,
    };
    assert.notEqual(input.revision, first.revision);
    const lease = await acquireStoreLock(join(fixture.dir, 'runner-control'), {
      exclusive: true,
    });
    try {
      assert.equal((await preview(fixture)).revision, input.revision);
      assert.equal((await post(fixture, input)).status, 409);
      assert.deepEqual(calls, []);
    } finally {
      await lease.release();
    }
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const read = await fetch(endpoint(fixture, 'deploy-plan?mode=server'), {
        headers: { accept: type },
      });
      assert.equal(read.headers.get('cache-control'), 'no-store');
      const plan = await readWireResponse(read);
      assert.equal(plan.revision, input.revision);
      assert.equal(plan.host, changed.host);
      assert.deepEqual(
        await readWireResponse(await post(fixture, input, type)),
        { ...plan, state: 'prepared' }
      );
    }
    assert.deepEqual(
      calls.map(({ host }) => host),
      [changed.host, changed.host]
    );
    assert.deepEqual(fixture.backend.calls, []);
    assert.equal(fixture.backend.state.local, 'running');
  }
);

test(
  'source routes enforce bounded requests, app origin and the passcode lock',
  { timeout: 10000 },
  async (t) => {
    const fixture = await runnerApiFixture({ overlay: { server } });
    t.after(fixture.close);
    const input = {
      mode: 'server',
      revision: (await preview(fixture)).revision,
    };
    for (const query of [
      'deploy-plan',
      'deploy-plan?mode=third',
      'deploy-plan?mode=server&mode=local',
    ]) {
      assert.equal((await fetch(endpoint(fixture, query))).status, 400);
    }
    assert.equal(
      (
        await fetch(endpoint(fixture, 'deploy-plan?mode=server'), {
          headers: { origin: 'https://foreign.invalid' },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await post(fixture, input, LINO_TEXT, {
          origin: 'https://foreign.invalid',
        })
      ).status,
      403
    );
    assert.equal(
      (
        await fetch(endpoint(fixture, 'deploy'), {
          headers: { 'content-type': LINO_TEXT },
        })
      ).status,
      405
    );
    assert.equal(
      (await post(fixture, { ...input, directory: '/other' })).status,
      400
    );
    assert.equal(
      (await post(fixture, { ...input, revision: 'invalid' })).status,
      400
    );
    assert.equal(
      (await post(fixture, { ...input, revision: 'a'.repeat(1025) })).status,
      413
    );
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
    assert.equal(
      (await fetch(endpoint(fixture, 'deploy-plan?mode=server'))).status,
      423
    );
    assert.equal((await post(fixture, input)).status, 423);
    assert.deepEqual(fixture.backend.calls, []);
  }
);

test(
  'the public CLI uses the same plan for direct and connected approval',
  { timeout: 10000 },
  async (t) => {
    const prepareSource = async (_target, plan) => ({
      ...plan,
      state: 'present',
    });
    const fixture = await runnerApiFixture({
      overlay: { server },
      control: { prepareSource },
    });
    t.after(fixture.close);
    const lines = [];
    for (const remote of [false, true]) {
      const options = {
        log: (line) => lines.push(line),
        runner: {
          directory: () => {
            assert.equal(remote, false);
            return fixture.dir;
          },
          localDirectory: () => fixture.localDir,
          prepareSource,
        },
      };
      const flags = remote ? [`--url=${fixture.base}`] : [];
      const cli = (...args) => runCli(['runner', ...args, ...flags], options);
      assert.equal(await cli('deploy-plan', 'server'), 0);
      const plan = parseIndented({ text: lines.at(-1) }).obj;
      assert.deepEqual(plan, await preview(fixture));
      assert.equal(await cli('deploy', 'server'), 1);
      assert.equal(
        await cli('deploy', 'server', `--revision=${plan.revision}`),
        0
      );
      assert.equal(parseIndented({ text: lines.at(-1) }).obj.state, 'present');
      const override = `v1.5.0@${'c'.repeat(64)}`;
      assert.equal(
        await cli(
          'deploy-plan',
          'server',
          `--server-application-source=${override}`
        ),
        remote ? 1 : 0
      );
      if (!remote) {
        assert.equal(
          parseIndented({ text: lines.at(-1) }).obj.sha256,
          'c'.repeat(64)
        );
      }
      assert.deepEqual(await preview(fixture), plan);
    }
  }
);
