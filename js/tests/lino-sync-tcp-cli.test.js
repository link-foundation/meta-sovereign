import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  startSyncListener,
  connectSyncPeer,
} from '../src/sync/tcp-transport.js';
import { LINO_BINARY } from '../src/transport/lino.js';
import { CURRENT_SCHEMA } from '../src/storage/migrations/index.js';
import { openDualStore } from '../src/storage/index.js';
import { workerArgs } from '../src/server/worker-client.js';

const cli = fileURLToPath(new URL('../bin/meta-sovereign.js', import.meta.url));
const link = {
  id: 'tcp:cli',
  body: '你好 Привет 🚀',
  single: [true],
  empty: [],
};
const event = { type: 'put', link, schema: CURRENT_SCHEMA };
const invoke = (directory, command, ...extra) => {
  const child = spawn(
    process.execPath,
    [...workerArgs(cli), command, `--store=${directory}`, ...extra],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  let ready;
  let failed;
  const started = new Promise((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  // Attach the rejection handler before a fast startup failure is possible.
  started.catch(() => {});
  const collect = (chunk) => {
    output = (output + String(chunk)).slice(-64 * 1024);
    const match = output.match(
      /sync (?:listener on|client connected to) tcp:\/\/[^:]+:(\d+)/
    );
    if (match) {
      ready(Number(match[1]));
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.once('error', failed);
  const closed = new Promise((resolve) => {
    child.once('close', (code, signal) => {
      failed(
        new Error(
          `sync CLI exited before startup (${code}, ${signal}): ${output}`
        )
      );
      resolve({ code, signal, output });
    });
  });
  return {
    started,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
      return closed;
    },
  };
};

const persisted = async (directory) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const log = await readFile(path.join(directory, 'data.lino'), 'utf8').catch(
      (error) => {
        if (error.code === 'ENOENT') {
          return '';
        }
        throw error;
      }
    );
    if (log.includes(link.id)) {
      return;
    }
    await sleep(25);
  }
  assert.fail('sync CLI did not persist the incoming record');
};

for (const command of ['sync-listen', 'sync-connect']) {
  test(
    `${command} CLI stays alive for TCP replication and releases its store on shutdown`,
    { timeout: 15_000 },
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'ms-tcp-cli-'));
      let listener;
      let client;
      let running;
      let reopened;
      try {
        if (command === 'sync-listen') {
          running = invoke(directory, command, '--port=0');
          const port = await running.started;
          client = await connectSyncPeer({ port });
          client.transport.send(event);
        } else {
          listener = await startSyncListener({ format: LINO_BINARY });
          running = invoke(
            directory,
            command,
            `--port=${listener.port}`,
            '--sync-format=binary'
          );
          await running.started;
          listener.transport.send(event);
        }
        await persisted(directory);
        const stopped = await running.stop();
        // Windows terminates children directly; POSIX runs the signal cleanup.
        if (globalThis.process.platform !== 'win32') {
          assert.equal(stopped.code, 0, stopped.output);
        }
        reopened = await openDualStore(directory);
        assert.deepEqual(await reopened.get(link.id), link);
      } finally {
        await running?.stop();
        await client?.close();
        await listener?.close();
        await reopened?.close();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
}
