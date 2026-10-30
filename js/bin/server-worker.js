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
const send = (value) =>
  process.stdout.write(
    `${JSON.stringify(value.type ? value : { type: 'response', ...value })}\n`
  );
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
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
input.once('close', () => {
  resources?.stop();
  worker
    ?.close()
    .catch(() => {})
    .finally(() => process.exit(0));
});
