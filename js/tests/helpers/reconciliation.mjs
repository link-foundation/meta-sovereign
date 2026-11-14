import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createMemoryStore } from '../../src/storage/universal.js';
import { withCausalWrites } from '../../src/storage/causal-writes.js';
import { createPeer } from '../../src/sync/peer.js';

export const causalMemory = (actor) =>
  withCausalWrites(createMemoryStore(), { actor });

export const waitReconciled = async (predicate, message = 'reconciliation') => {
  for (let turn = 0; turn < 1000; turn++) {
    if (await predicate()) {
      return;
    }
    await delay(1);
  }
  assert.fail(`Missing ${message}`);
};

export const captureReconciliation = (store, options = {}, send = () => {}) => {
  const sent = [];
  const errors = [];
  let receive;
  const peer = createPeer(store, {
    schemaVersion: 13,
    onError: (error) => errors.push(error),
    ...options,
  });
  const close = peer.connect({
    send: (event) => {
      sent.push(globalThis.structuredClone(event));
      return send(event);
    },
    onMessage(handler) {
      receive = handler;
      return () => {};
    },
  });
  const session = sent[0].session;
  return {
    sent,
    errors,
    session,
    close,
    hello: (remote = 'remote') =>
      receive({ type: 'hello', schema: 13, session: remote, reconcile: 1 }),
    receive: (event) =>
      receive({ schema: 13, from: 'remote', to: session, ...event }),
  };
};
