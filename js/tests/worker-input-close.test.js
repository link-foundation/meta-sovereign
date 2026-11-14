import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { workerArgs } from '../src/server/worker-client.js';

const entry = fileURLToPath(
  new URL('../bin/server-worker.js', import.meta.url)
);

for (const channel of ['input EOF', 'broken output pipe']) {
  test(
    `worker drains accepted initialization after ${channel}`,
    { timeout: 20000 },
    async (t) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-worker-eof-'));
      const child = spawn(process.execPath, workerArgs(entry), {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=384' },
      });
      let output = '',
        errors = '',
        ended = false;
      child.stdout.on('data', (chunk) => {
        output += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        errors += String(chunk);
      });
      const closed = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => {
          ended = true;
          resolve({ code, signal });
        });
      });
      t.after(async () => {
        if (!ended) {
          child.kill('SIGTERM');
        }
        await closed;
        await rm(dir, { recursive: true, force: true });
      });
      // EOF is delivered with the request, while the asynchronous init still owns
      // its store/server startup. There will be no second input-close event.
      const request = `${JSON.stringify({
        id: 1,
        operation: 'init',
        body: {
          storeDir: dir,
          front: { port: 0, tls: false },
          options: {
            tls: false,
            telegramAccount: false,
            enableSync: false,
            enableHandlers: false,
            automations: { scheduler: false },
            emailPoll: false,
            backups: { intervalHours: 0 },
          },
        },
      })}\n`;
      if (channel === 'input EOF') {
        child.stdin.end(request);
      } else {
        child.stdout.destroy();
        child.stdin.write(request);
      }
      const deadline = new AbortController();
      try {
        const result = await Promise.race([
          closed,
          sleep(15000, null, { signal: deadline.signal }).then(() => {
            throw new Error(
              `Worker retained initialization after ${channel}.\n${output}\n${errors}`
            );
          }),
        ]);
        assert.deepEqual(result, { code: 0, signal: null }, errors);
      } finally {
        deadline.abort();
      }
    }
  );
}
