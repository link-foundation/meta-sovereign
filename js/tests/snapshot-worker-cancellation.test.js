import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { snapshotInWorker } from '../src/storage/doublets-mirror.js';
import { formatLinoRecords } from '../src/storage/lino-store.js';
import { snapshotMemory } from '../src/storage/snapshot-memory.js';
import { awaitSnapshotWorker } from '../src/storage/snapshot-worker-control.js';

const fixture = async (run) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-snapshot-stop-'));
  try {
    const log = path.join(dir, 'data.lino');
    await fs.writeFile(log, formatLinoRecords([{ id: 'one', body: 'tiny' }]));
    await run(log, path.join(dir, 'data.bin'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

test(
  'worker cleanup errors remain visible during cancellation',
  { timeout: 10000 },
  async () => {
    const worker = new EventEmitter();
    worker.postMessage = () => {};
    worker.terminate = async () => 1;
    const controller = new AbortController();
    const pending = awaitSnapshotWorker(worker, {
      signal: controller.signal,
      progress: () => {},
    });
    controller.abort(new Error('cancelled'));
    worker.emit('message', {
      error: { name: 'Error', message: 'cleanup failed', code: 'EBUSY' },
    });
    await assert.rejects(pending, { message: 'cleanup failed', code: 'EBUSY' });
    assert.equal(worker.listenerCount('message'), 0);
    assert.equal(worker.listenerCount('exit'), 0);
  }
);

test(
  'snapshot cancellation retains ownership until the worker acknowledges closed handles',
  { timeout: 10000 },
  async () => {
    await fixture(async (log, binary) => {
      const created = Promise.withResolvers();
      const controller = new AbortController();
      const reason = new Error('fixture cancellation');
      const worker = new EventEmitter();
      worker.threadId = 90210;
      const requests = [];
      worker.postMessage = (message) => requests.push(message);
      let terminated = false;
      worker.terminate = () => {
        terminated = true;
        worker.emit('exit', 1); // Deno emits exit synchronously on termination.
        return Promise.resolve(1);
      };
      let settled = false;
      const pending = snapshotInWorker(log, binary, {
        signal: controller.signal,
        createWorker: () => {
          created.resolve();
          return worker;
        },
      }).then(
        () => {
          settled = true;
        },
        (error) => {
          settled = true;
          throw error;
        }
      );
      const rejected = assert.rejects(pending, (error) => error === reason);
      try {
        await created.promise;
        controller.abort(reason);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(
          terminated,
          false,
          'termination can interrupt encoder cleanup'
        );
        assert.equal(
          settled,
          false,
          'the owner cannot release a worker still holding files'
        );
        assert.deepEqual(requests, [{ type: 'snapshot-cancel' }]);
      } finally {
        // A final result/ack is sent only after encoder and file cleanup.
        worker.emit('message', { cancelled: true });
        await rejected;
      }
      assert.equal(terminated, true);
      assert.deepEqual(snapshotMemory(), []);
    });
  }
);

test(
  'a real snapshot cancelled after opening its encoder closes its workspace before rejecting',
  { timeout: 10000 },
  async () => {
    await fixture(async (log, binary) => {
      const controller = new AbortController();
      let started = false;
      const pending = snapshotInWorker(log, binary, {
        signal: controller.signal,
        createWorker: (...args) => {
          const worker = new Worker(...args);
          worker.on('message', (message) => {
            if (message.progress && !started) {
              started = true;
              controller.abort(new Error('cancel after encoder opening'));
            }
          });
          return worker;
        },
      });
      await assert.rejects(pending, /cancel after encoder opening/u);
      assert.equal(started, true);
      assert.equal(
        (await fs.readdir(path.dirname(binary))).some((name) =>
          name.startsWith('.snapshot-db-')
        ),
        false
      );
      assert.deepEqual(snapshotMemory(), []);
    });
  }
);
