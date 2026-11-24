import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as module from 'node:module';
import { exerciseDeferredRoutes } from '../../experiments/issue-56/route-loading-fixture.mjs';

test(
  'deferred provider routes retain guarded first-use behavior in both Lino encodings',
  { timeout: 15000 },
  async (context) => {
    await exerciseDeferredRoutes(undefined, context.signal);
  }
);

test(
  'idle startup and rejected requests do not load unused provider route graphs',
  {
    timeout: 15000,
    skip:
      typeof module.registerHooks !== 'function' ||
      !!globalThis.Deno ||
      !!globalThis.Bun,
  },
  async (context) => {
    const child = spawn(
      process.execPath,
      [
        '--max-old-space-size=384',
        fileURLToPath(
          new URL(
            '../../experiments/issue-56/route-loading-probe.mjs',
            import.meta.url
          )
        ),
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: context.signal,
        env: { ...process.env, MS_LIFECYCLE_DEBUG: '1' },
      }
    );
    let output = '';
    let diagnostics = '';
    child.stdout.on('data', (value) => (output += value));
    child.stderr.on('data', (value) => (diagnostics += value));
    let failure;
    const status = await new Promise((resolve) => {
      child.once('error', (error) => (failure = error));
      child.once('close', resolve);
    });
    assert.ifError(failure);
    assert.equal(status, 0, `${output}\n${diagnostics}`);
    const receipt = JSON.parse(output.trim());
    assert.match(diagnostics, /\[lifecycle\] close_finished/u);
    assert.deepEqual(receipt.loaded.sort(), [
      'routes-cv.js',
      'routes-telegram.js',
      'routes-vacancies.js',
    ]);
    assert.equal(receipt.stages.at(-1), 'finished');
  }
);
