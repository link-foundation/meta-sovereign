import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatIndented } from 'lino-objects-codec';
import {
  readRunnerProfile,
  runnerProfileData,
  validateRunnerProfile,
} from '../src/cli/runner-profile.js';
import { runnerProfile } from '../../experiments/issue-56/runner-fixture.mjs';

test('empty profiles stay unconfigured; screen and executable defaults round-trip', () => {
  assert.deepEqual(validateRunnerProfile({}), {});
  const profile = runnerProfile();
  const targets = validateRunnerProfile(profile);
  for (const target of Object.values(targets)) {
    assert.equal(target.isolation, 'screen');
    assert.equal(target.session, profile.session);
    assert.equal(target.node, 'node');
    assert.equal(target.start, '$');
  }
  assert.deepEqual(validateRunnerProfile(runnerProfileData(targets)), targets);
});

test('unsupported, credential-shaped and malformed runner profiles refuse without private values', () => {
  const original = runnerProfile();
  const bad = [
    null,
    [],
    'PRIVATE',
    { token: 'PRIVATE' },
    { session: '-stop' },
    ...[0, 65536, '8123'].map((port) => ({
      ...original,
      local: { ...original.local, port },
    })),
    ...['host', 'token', 'image'].map((key) => ({
      ...original,
      local: { ...original.local, [key]: 'PRIVATE' },
    })),
    ...[
      '-oProxyCommand=PRIVATE',
      'host;PRIVATE',
      'user:PRIVATE@host',
      'host\nPRIVATE',
      '',
    ].map((host) => ({ ...original, server: { ...original.server, host } })),
    ...['directory', 'cli', 'store', 'node', 'start'].map((key) => ({
      ...original,
      local: { ...original.local, [key]: '\0PRIVATE' },
    })),
    { ...original, local: { ...original.local, isolation: 'docker' } },
    { ...original, local: { ...original.local, directory: 'relative' } },
  ];
  for (const value of bad) {
    assert.throws(() => validateRunnerProfile(value), {
      message: 'Runner profile unavailable or invalid.',
    });
  }
});

test(
  'readable Lino profile reads are bounded and do not accept directories or missing files',
  { timeout: 5000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runner-profile-'));
    try {
      const file = join(dir, 'runner.lino');
      const profile = runnerProfile();
      await writeFile(file, formatIndented({ id: 'runner', obj: profile }));
      assert.deepEqual(
        await readRunnerProfile(file),
        validateRunnerProfile(profile)
      );
      for (const text of [
        'PRIVATE malformed',
        'x'.repeat(65537),
        formatIndented({ id: 'runner', obj: { token: 'PRIVATE' } }),
      ]) {
        await writeFile(file, text);
        await assert.rejects(readRunnerProfile(file), {
          message: 'Runner profile unavailable or invalid.',
        });
      }
      await mkdir(join(dir, 'PRIVATE'));
      for (const path of [join(dir, 'PRIVATE'), join(dir, 'PRIVATE-missing')]) {
        await assert.rejects(readRunnerProfile(path), {
          message: 'Runner profile unavailable or invalid.',
        });
      }
      assert.deepEqual(
        await readRunnerProfile(join(dir, 'PRIVATE-missing'), {
          optional: true,
        }),
        {}
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);
