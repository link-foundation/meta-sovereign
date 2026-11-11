import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { workerArgs } from '../src/server/worker-client.js';

const invoke = async (command) => {
  const fixture = fileURLToPath(
    new URL(
      '../../experiments/issue-56/cli-delayed-output.mjs',
      import.meta.url
    )
  );
  const child = spawn(process.execPath, [...workerArgs(fixture), command], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return { code, output, errors };
};

test(
  'CLI completion drains pending output before preserving its exit status',
  { timeout: 10000 },
  async () => {
    const { code, output, errors } = await invoke('--version');
    assert.equal(code, 0, errors);
    const { version } = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8')
    );
    assert.equal(output, `${version}\n`);
  }
);

test(
  'unsuccessful CLI completion also drains its explanation and retains failure',
  { timeout: 10000 },
  async () => {
    const { code, output, errors } = await invoke('unknown-fixture-command');
    assert.equal(code, 1, errors);
    assert.match(output, /meta-sovereign <command>/u);
    assert.match(output, /test-assignment/u);
  }
);
