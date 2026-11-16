import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { workerArgs } from '../src/server/worker-client.js';

const source = new URL('../bin/server-worker.js', import.meta.url);
const fixture = new URL(
  '../../experiments/issue-56/worker-loading-fixture.mjs',
  import.meta.url
);

test(
  'worker reports a pending application import before it finishes and drains EOF afterward',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-worker-loading-'));
    const gate = path.join(dir, 'gate');
    const entry = path.join(dir, 'worker.mjs');
    let code = await readFile(source, 'utf8');
    for (const name of [
      '../src/server/rolling-worker.js',
      '../src/server/resource-diagnostics.js',
      '../src/storage/snapshot-memory.js',
    ]) {
      code = code.replaceAll(
        `'${name}'`,
        JSON.stringify(
          name.endsWith('/rolling-worker.js')
            ? fixture.href
            : new URL(name, source).href
        )
      );
    }
    await writeFile(entry, code);
    const child = spawn(process.execPath, workerArgs(entry), {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=192',
        MS_WORKER_LOADING_FIXTURE: gate,
      },
    });
    let output = '',
      errors = '',
      ended = false;
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (errors += String(chunk)));
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (status) => {
        ended = true;
        resolve(status);
      });
    });
    try {
      child.stdin.end(
        `${JSON.stringify({ id: 1, operation: 'init', body: {} })}\n`
      );
      for (let attempt = 0; attempt < 200; attempt++) {
        if (
          await access(`${gate}.entered`).then(
            () => true,
            () => false
          )
        ) {
          break;
        }
        await sleep(10);
      }
      await access(`${gate}.entered`);
      const frames = output.trim().split('\n').filter(Boolean).map(JSON.parse);
      assert.deepEqual(
        frames.map(({ entry: operation }) => [
          operation.operation,
          operation.phase,
        ]),
        [
          ['init', 'started'],
          ['import', 'started'],
        ],
        'The pending module load must be observable before its gate opens'
      );
      assert.equal(ended, false, 'EOF retains ownership of the pending import');
      await writeFile(`${gate}.release`, 'release');
      assert.equal(await closed, 0, errors);
      assert.equal(await readFile(`${gate}.closed`, 'utf8'), 'closed');
      assert.equal(errors, '', 'diagnostics stay off by default');
    } finally {
      if (!ended) {
        await writeFile(`${gate}.release`, 'release');
        child.kill('SIGTERM');
      }
      await closed;
      await rm(dir, { recursive: true, force: true });
    }
  }
);
