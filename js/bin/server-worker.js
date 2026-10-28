#!/usr/bin/env node
// Private IPC entry point for the rolling server host; never a public API.
import { createRollingWorker } from '../src/server/rolling-worker.js';
import { createInterface } from 'node:readline';

let worker = null;
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
        worker = await createRollingWorker({
          ...body,
          log: (entry) => send({ type: 'log', entry }),
        });
        send({ id, result: { port: worker.port } });
      } else {
        const result = await worker[operation](body);
        send({ id, result: result ?? null });
        if (operation === 'close') {
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
        },
      });
    } catch (error) {
      send({
        id,
        error: { message: error.message, code: error.code, port: error.port },
      });
    }
  });
});
input.once('close', () => {
  worker
    ?.close()
    .catch(() => {})
    .finally(() => process.exit(0));
});
