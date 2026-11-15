/** Owned FIFO pacing; durable delivery truth remains in the guarded outbox. */
import { setTimeout as pause } from 'node:timers/promises';
import { vkOutgoingQueues as queues } from './vk-queue-registry.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { safeMessage } from '../server/redact.js';
import {
  paceVkOutgoing,
  requireVkQueuePolicy,
  stopped,
  validateVkPacing,
} from './vk-outgoing-pacing.js';
import {
  readVkOutgoingSettings,
  VK_OUTGOING_PREFIX,
} from './vk-outgoing-settings.js';

const outcomeStatus = (result) =>
  result?.status ?? (result?.confirmed ? 'confirmed' : 'completed');

export const createVkOutgoingQueue = ({
  store,
  sleep = (ms, signal) => pause(ms, undefined, { signal }),
  now = Date.now,
  random = Math.random,
  log = () => {},
  debug = false,
} = {}) => {
  const controller = new AbortController();
  const pending = new Set();
  let tail = Promise.resolve();
  let active = null;
  const trace = (stage) => {
    if (debug) {
      log({
        event: 'vk_outgoing_queue',
        stage,
        waiting: pending.size,
        active: Boolean(active),
      });
    }
  };
  const perform = async (entry, work, admittedPolicy) => {
    const signal = entry.signal
      ? globalThis.AbortSignal.any([controller.signal, entry.signal])
      : controller.signal;
    if (signal.aborted) {
      throw stopped();
    }
    const policy = await admittedPolicy;
    await requireVkQueuePolicy(store, policy);
    if (!policy.enabled) {
      return work();
    }
    // A retained outbox receipt decides duplicate/unknown admission. Avoid even
    // read/typing effects for work the guarded sender will already refuse.
    const prior = await store.get(`outbox:${entry.key}`);
    if (['sent', 'sending', 'unknown'].includes(prior?.status)) {
      return work();
    }
    let state = {
      id: `${VK_OUTGOING_PREFIX}${encodeURIComponent(entry.key)}`,
      tokens: ['vk-outgoing'],
      source: 'vk',
      outboxId: `outbox:${entry.key}`,
      chat: String(entry.draft.chat),
      status: 'pacing',
      startedAt: new Date(now()).toISOString(),
      read: 'not-requested',
      typing: 'not-requested',
    };
    const update = async (patch) => {
      state = { ...state, ...patch };
      await saveAcknowledgedRecord(store, state);
      trace(state.status);
    };
    let completed = false;
    try {
      await update({});
      await paceVkOutgoing({
        entry,
        policy,
        signal,
        update,
        store,
        sleep,
        random,
        log,
      });
      await update({ status: 'ready' });
      await validateVkPacing({ entry, policy, signal, store });
      const result = await work();
      completed = true;
      await update({
        status: outcomeStatus(result),
        finishedAt: new Date(now()).toISOString(),
      });
      return result;
    } catch (error) {
      await update({
        status: completed ? 'unknown' : signal.aborted ? 'stopped' : 'failed',
        error: safeMessage(error),
        finishedAt: new Date(now()).toISOString(),
      }).catch(() => {});
      throw error;
    }
  };
  return {
    run(entry, work) {
      if (controller.signal.aborted) {
        return Promise.reject(stopped());
      }
      if (pending.size >= 100) {
        return Promise.reject(
          Object.assign(new Error('VK outgoing queue is full'), {
            code: 'queue-full',
            definitive: true,
          })
        );
      }
      if (
        typeof entry.key !== 'string' ||
        !entry.key ||
        entry.key.length > 2048 ||
        String(entry.draft.text ?? '').length > 12000
      ) {
        return Promise.reject(new Error('VK outgoing key required'));
      }
      // Capture policy at admission, including while an earlier RPC is held.
      const admittedPolicy = readVkOutgoingSettings(store);
      admittedPolicy.catch(() => {});
      const result = tail.then(async () => {
        active = `${VK_OUTGOING_PREFIX}${encodeURIComponent(entry.key)}`;
        try {
          return await perform(entry, work, admittedPolicy);
        } finally {
          active = null;
        }
      });
      tail = result.catch(() => {});
      pending.add(result);
      const done = () => pending.delete(result);
      result.then(done, done);
      return result;
    },
    inspect: () => ({
      active,
      waiting: pending.size - Number(Boolean(active)),
      stopped: controller.signal.aborted,
    }),
    async close() {
      controller.abort();
      await Promise.allSettled([...pending]);
    },
  };
};

export const vkOutgoingFor = (store, options) => {
  const runtime = queues.get(store)?.inspect();
  // A stopped foreground owner can be replaced after every admitted effect
  // drains. Retain the closed queue meanwhile so no replacement overlaps it.
  if (
    !runtime ||
    (runtime.stopped && !runtime.active && runtime.waiting === 0)
  ) {
    queues.set(store, createVkOutgoingQueue({ store, ...options }));
  }
  return queues.get(store);
};
