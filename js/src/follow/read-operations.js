import { randomUUID } from 'node:crypto';
import { withFollowRetry } from './retry.js';
import { followReadPolicy, followReadWait } from './read-policy.js';

const fail = (code) => Object.assign(new Error(code), { code });
const validId = (id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);
export const createFollowReadOperations = ({
  sleep = followReadWait,
  trace,
} = {}) => {
  const active = new Map();
  let stopped = false;
  const run = (input, use) => {
    const task = Promise.resolve().then(async () => {
      if (stopped) {
        throw fail('stopped');
      }
      const policy = followReadPolicy(input);
      const id = input.requestId ?? randomUUID();
      if (!validId(id)) {
        throw fail('bad-request');
      }
      if (active.has(id)) {
        throw fail('busy');
      }
      const control = new globalThis.AbortController();
      const check = () => {
        if (stopped) {
          throw fail('stopped');
        }
        if (control.signal.aborted) {
          throw fail('cancelled');
        }
      };
      const read = async (request) => {
        check();
        try {
          const result = await withFollowRetry(request, {
            policy,
            trace,
            sleep: (ms) => sleep(ms, control.signal),
            cancelled: () => stopped || control.signal.aborted,
          });
          check();
          return result;
        } catch (error) {
          check();
          throw error;
        }
      };
      active.set(id, { control, task });
      try {
        return await use({
          read,
          cancelled: () => stopped || control.signal.aborted,
        });
      } finally {
        active.delete(id);
      }
    });
    return task;
  };
  return {
    run,
    cancel: async (body = {}) => {
      if (body.requestId !== undefined && !validId(body.requestId)) {
        throw fail('bad-request');
      }
      for (const [id, operation] of active) {
        if (body.requestId === undefined || body.requestId === id) {
          operation.control.abort();
        }
      }
      return { ok: true };
    },
    stop: async () => {
      stopped = true;
      for (const operation of active.values()) {
        operation.control.abort();
      }
      await Promise.allSettled(
        [...active.values()].map((operation) => operation.task)
      );
    },
  };
};
