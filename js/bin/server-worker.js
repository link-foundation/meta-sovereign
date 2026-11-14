#!/usr/bin/env node
// Private IPC entry point for the rolling server host; never a public API.
import { createRollingWorker } from '../src/server/rolling-worker.js';
import { createInterface } from 'node:readline';
import { startResourceDiagnostics } from '../src/server/resource-diagnostics.js';
import { snapshotMemory } from '../src/storage/snapshot-memory.js';

let worker = null;
let resources = null;
const build = /releases\/([a-f0-9]{64})/.exec(import.meta.url)?.[1] ?? null;
const phaseAfter = (operation) => {
  const phase = { activate: 'active', resume: 'active', suspend: 'standby' }[
    operation
  ];
  if (phase) {
    resources?.setPhase(phase);
  }
};
let chain = Promise.resolve();
let closing = null;
let inputClosed = false;
const send = (value) =>
  !inputClosed &&
  process.stdout.write(
    `${JSON.stringify(value.type ? value : { type: 'response', ...value })}\n`
  );
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (inputClosed) {
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  chain = chain.then(async () => {
    const { id, operation, body } = message;
    const started = Date.now();
    send({
      type: 'log',
      entry: {
        level: 'debug',
        event: 'server_worker_operation',
        operation,
        phase: 'started',
      },
    });
    try {
      if (operation === 'init') {
        resources = startResourceDiagnostics({
          log: (entry) => send({ type: 'log', entry }),
          phase: 'warming',
          build,
          extra: () => ({
            backgroundSnapshots: snapshotMemory(),
            stores: worker?.resourceStats?.() ?? [],
          }),
        });
        worker = await createRollingWorker({
          ...body,
          log: (entry) => send({ type: 'log', entry }),
        });
        resources.setPhase(body.checkpoints ? 'ready' : 'active');
        send({ id, result: { port: worker.port } });
      } else {
        const result = await worker[operation](body);
        phaseAfter(operation);
        send({ id, result: result ?? null });
        if (operation === 'close') {
          resources?.stop();
          process.exit(0);
        }
      }
      send({
        type: 'log',
        entry: {
          level: 'debug',
          event: 'server_worker_operation',
          operation,
          phase: 'finished',
          duration_ms: Date.now() - started,
        },
      });
    } catch (error) {
      if (operation === 'init') {
        resources?.stop();
      }
      send({
        type: 'log',
        entry: {
          level: 'warn',
          event: 'server_worker_operation',
          operation,
          phase: 'failed',
          duration_ms: Date.now() - started,
          code: error.code,
        },
      });
      send({
        id,
        error: { message: error.message, code: error.code, port: error.port },
      });
    }
  });
});
const drain = () => {
  inputClosed = true;
  // Initialization and accepted operations may still acquire stores/listeners.
  // Keep ownership until they settle, then close their actual resources once.
  closing ??= chain
    .catch(() => {})
    .then(async () => {
      resources?.stop();
      await worker?.close();
    })
    .catch(() => {})
    .finally(() => process.exit(0));
  return closing;
};
input.once('close', drain);
process.stdout.on('error', (error) => {
  if (['EPIPE', 'ERR_STREAM_DESTROYED'].includes(error.code)) {
    void drain();
  } else {
    throw error;
  }
});
