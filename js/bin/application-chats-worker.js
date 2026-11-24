#!/usr/bin/env node
// Private chat supervisor. Credentials arrive through stdin, never argv/disk.
import { createInterface } from 'node:readline';
import { watcherRequest } from '../src/forms/watcher-rpc.js';

let metadata;
let timer;
let pending = Promise.resolve();
let closing;
let chain = Promise.resolve();
let lastHeld = null;
const request = (operation) =>
  watcherRequest(metadata, operation, null, { timeoutMs: 180000 });
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const stop = () =>
  (closing ??= (async () => {
    globalThis.clearTimeout(timer);
    await pending.catch(() => {});
    if (metadata) {
      await request('stop');
    }
  })());
const observe = async () => {
  const status = await request('status');
  const held = status.held && JSON.stringify(status.held);
  if (held && held !== lastHeld) {
    send({
      type: 'log',
      entry: {
        event: 'application-chats-review-held',
        ...status.held,
        passId: status.passId,
      },
    });
  }
  lastHeld = held;
  if (!closing && status.active) {
    timer = globalThis.setTimeout(() => {
      pending = observe();
      void pending.catch(() => {
        void stop().finally(() => process.exit(1));
      });
    }, 1000);
  }
};
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  chain = chain.then(async () => {
    let message;
    try {
      if (line.length > 8192) {
        throw new Error('Application chat control exceeds its limit.');
      }
      message = JSON.parse(line);
      const { id, operation, body } = message;
      if (operation === 'init' && !metadata && !closing) {
        metadata = body;
        const result = await request('start');
        pending = observe();
        void pending.catch(() => {
          void stop().finally(() => process.exit(1));
        });
        send({ type: 'response', id, result });
      } else if (operation === 'close') {
        await stop();
        send({ type: 'response', id, result: null });
        process.exit(0);
      } else {
        throw new Error('Unsupported application chat operation.');
      }
    } catch (error) {
      send({
        type: 'response',
        id: message?.id,
        error: {
          code: error.code ?? 'application-chats-worker',
          message: error.message,
        },
      });
    }
  });
});
const drain = () => {
  void chain.finally(stop).finally(() => process.exit(0));
};
input.once('close', drain);
process.once('SIGTERM', drain);
process.once('SIGINT', drain);
process.stdout.on('error', drain);
