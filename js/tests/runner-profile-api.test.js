import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { formatIndented, parseIndented } from 'lino-objects-codec';
import { runnerApiFixture } from '../../experiments/issue-56/runner-api-fixture.mjs';
import { runnerProfile } from '../../experiments/issue-56/runner-fixture.mjs';
import { readRunnerProfile } from '../src/cli/runner-profile.js';
import { requestRunner } from '../src/cli/runner-client.js';
import { runCli } from '../src/cli/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const endpoint = (fixture, action) => `${fixture.base}/api/runner/${action}`;
const post = (fixture, input, type = LINO_TEXT, extra = {}) =>
  fetch(endpoint(fixture, 'configure'), {
    method: 'POST',
    headers: { 'content-type': type, accept: type, ...extra },
    body: encodeWire(input, type),
  });

test(
  'text and binary profile API saves without probing, rejects stale writes and preserves a separate owner edit',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture();
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(endpoint(fixture, 'profile'), {
          headers: { accept: type },
        });
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const before = await readWireResponse(response);
        const profile = parseIndented({ text: before.document }).obj;
        profile.server.host =
          type === LINO_TEXT
            ? 'first@example.invalid'
            : 'second@example.invalid';
        profile.server.cli = posix.join(
          profile.server.directory,
          'js/bin/meta-sovereign.js'
        );
        profile.server.applicationLock = (
          type === LINO_TEXT ? 'a' : 'b'
        ).repeat(64);
        const input = {
          document: formatIndented({ id: 'runner', obj: profile }),
          revision: before.revision,
        };
        const saved = await readWireResponse(await post(fixture, input, type));
        assert.equal(saved.ok, true);
        const { server } = await readRunnerProfile(
          join(fixture.dir, 'runner.lino')
        );
        assert.equal(server.host, profile.server.host);
        assert.equal(server.applicationLock, profile.server.applicationLock);
        const stale = await post(fixture, input, type);
        assert.equal(stale.status, 409);
        const refused = await readWireResponse(stale);
        assert.equal(refused.ok, false);
        assert.equal(refused.code, 'runner-profile-conflict');
      }
      assert.deepEqual(fixture.backend.calls, []);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'profile routes retain origin, passcode, wire and bounded schema protection',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture();
    try {
      const before = await requestRunner({
        url: fixture.base,
        action: 'profile',
      });
      const input = { document: before.document, revision: before.revision };
      assert.equal(
        (
          await fetch(endpoint(fixture, 'profile'), {
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
        (await fetch(endpoint(fixture, 'profile'), { method: 'POST' })).status,
        405
      );
      assert.equal(
        (
          await fetch(endpoint(fixture, 'configure'), {
            headers: { 'content-type': LINO_TEXT },
          })
        ).status,
        405
      );
      assert.equal(
        (
          await fetch(endpoint(fixture, 'configure'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
          })
        ).status,
        415
      );
      for (const bad of [
        { ...input, profile: '/PRIVATE' },
        { ...input, revision: 'PRIVATE' },
        { ...input, document: 'runner:\n  local too many values\n' },
        { ...input, document: '界'.repeat(21846) },
      ]) {
        const rejected = await post(fixture, bad);
        assert.equal(rejected.status, 400);
        assert.doesNotMatch(
          await rejected.text(),
          /PRIVATE|\/fixture|password/
        );
      }
      assert.equal(
        (await post(fixture, { ...input, document: 'x'.repeat(131073) }))
          .status,
        413
      );
      assert.deepEqual(
        await requestRunner({ url: fixture.base, action: 'profile' }),
        before
      );
      for (const [action, body] of [
        ['set', { passcode: 'fixture' }],
        ['lock', {}],
      ]) {
        assert.equal(
          (
            await fetch(`${fixture.base}/api/passcode/${action}`, {
              method: 'POST',
              headers: { 'content-type': LINO_TEXT },
              body: encodeWire(body, LINO_TEXT),
            })
          ).status,
          200
        );
      }
      assert.equal((await fetch(endpoint(fixture, 'profile'))).status, 423);
      assert.equal((await post(fixture, input)).status, 423);
      assert.deepEqual(fixture.backend.calls, []);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'public CLI edits the same default or connected-server profile and validates flags before requests',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture();
    const output = [];
    const inputFile = join(fixture.dir, 'input.lino');
    const beforeSignals = ['SIGINT', 'SIGTERM'].map((name) =>
      process.listenerCount(name)
    );
    try {
      const profile = runnerProfile();
      profile.server.host = 'cli@example.invalid';
      profile.server.cli = posix.join(
        profile.server.directory,
        'js/bin/meta-sovereign.js'
      );
      profile.server.applicationLock = 'c'.repeat(64);
      await writeFile(
        inputFile,
        formatIndented({ id: 'runner', obj: profile })
      );
      for (const remote of [false, true]) {
        const options = {
          log: (line) => output.push(line),
          runner: {
            directory: () => {
              assert.equal(
                remote,
                false,
                'connected CLI must not touch local control state'
              );
              return fixture.dir;
            },
          },
        };
        const flags = remote ? [`--url=${fixture.base}`] : [];
        assert.equal(await runCli(['runner', 'profile', ...flags], options), 0);
        const before = parseIndented({ text: output.at(-1) }).obj;
        assert.equal(
          await runCli(
            [
              'runner',
              'configure',
              `--input=${inputFile}`,
              `--revision=${before.revision}`,
              ...flags,
            ],
            options
          ),
          0
        );
        const { server } = await readRunnerProfile(
          join(fixture.dir, 'runner.lino')
        );
        assert.equal(server.host, profile.server.host);
        assert.equal(server.applicationLock, profile.server.applicationLock);
        profile.server.host = 'cli-next@example.invalid';
        await writeFile(
          inputFile,
          formatIndented({ id: 'runner', obj: profile })
        );
      }
      let requests = 0;
      for (const args of [
        ['configure'],
        ['configure', `--input=${inputFile}`],
        ['configure', '--revision=bad', `--input=${inputFile}`],
        ['profile', '--revision=bad'],
        ['configure', `--revision=${'a'.repeat(64)}`, '--input=/missing'],
      ]) {
        assert.equal(
          await runCli(['runner', ...args, `--url=${fixture.base}`], {
            log: () => {},
            runner: {
              fetchImpl: async () => {
                requests++;
              },
            },
          }),
          1
        );
      }
      assert.equal(requests, 0);
      assert.deepEqual(fixture.backend.calls, []);
      assert.deepEqual(
        ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name)),
        beforeSignals
      );
    } finally {
      await fixture.close();
    }
  }
);
