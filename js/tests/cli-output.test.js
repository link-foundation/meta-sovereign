import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { workerArgs } from '../src/server/worker-client.js';

const invoke = async (context, command) => {
  const fixture = fileURLToPath(
    new URL(
      '../../experiments/issue-56/cli-delayed-output.mjs',
      import.meta.url
    )
  );
  const child = spawn(process.execPath, [...workerArgs(fixture), command], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MS_LIFECYCLE_DEBUG: '1' },
  });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  let settled = false;
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  context.after(async () => {
    if (!settled) {
      console.error(
        `[cli-output] child did not settle: ${JSON.stringify({ command, output: output.slice(-1500), errors: errors.slice(-1500) })}`
      );
      child.kill('SIGTERM');
    }
    await closed.catch(() => {});
  });
  const code = await closed;
  settled = true;
  return { code, output, errors };
};

test(
  'CLI completion drains pending output before preserving its exit status',
  { timeout: 10000 },
  async (context) => {
    const { code, output, errors } = await invoke(context, '--version');
    assert.equal(code, 0, errors);
    assert.match(errors, /\[cli\] version command ready after \d+ ms/u);
    const { version } = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8')
    );
    assert.equal(output, `${version}\n`);
  }
);

test(
  'unsuccessful CLI completion also drains its explanation and retains failure',
  { timeout: 10000 },
  async (context) => {
    const { code, output, errors } = await invoke(
      context,
      'unknown-fixture-command'
    );
    assert.equal(code, 1, errors);
    assert.match(errors, /\[cli\] ordinary commands ready after \d+ ms/u);
    assert.match(output, /meta-sovereign <command>/u);
    assert.match(output, /test-assignment/u);
  }
);
