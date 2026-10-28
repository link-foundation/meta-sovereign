import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  execCommandSync,
  spawnCommand,
  spawnCommandSync,
} from '../scripts/command-process.mjs';

test('command arguments remain literal, including spaces and shell metacharacters', () => {
  const args = [
    'a b',
    'x&y',
    'x|y',
    '$(echo injected)',
    'quote"value',
    '%PATH%',
    '^!<>',
  ];
  const output = execCommandSync(
    'node',
    ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', '--', ...args],
    { encoding: 'utf8' }
  );
  assert.deepEqual(JSON.parse(output), args);
});

test('npm and npx shims run with deprecations fatal and preserve failure status', () => {
  const env = { ...process.env, NODE_OPTIONS: '--throw-deprecation' };
  for (const command of ['npm', 'npx']) {
    const output = execCommandSync(command, ['--version'], {
      env,
      encoding: 'utf8',
    });
    assert.match(output.trim(), /^\d+\.\d+\.\d+/);
  }
  const result = spawnCommandSync('node', ['-e', 'process.exit(7)']);
  assert.equal(result.status, 7);
  assert.throws(
    () => execCommandSync('node', ['-e', 'process.exit(7)']),
    (error) => error.status === 7
  );
});

test('async command failures retain their nonzero exit', async () => {
  const child = spawnCommand('node', ['-e', 'process.exit(9)']);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(code, 9);
});
