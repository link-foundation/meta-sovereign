import { randomUUID } from 'node:crypto';
import { runIn } from './telegram-stickers.js';
import {
  connectFollowTelegram,
  readFollowTelegramOwner,
} from './telegram-follow-client.js';
import { backlinkError } from '../follow/backlink-shape.js';
import { followFailure } from './telegram-follow-shape.js';
import { withFollowRetry } from '../follow/retry.js';
import { followReadWait } from '../follow/read-policy.js';

const known = new Set([
  'bad-request',
  'stopped',
  'cancelled',
  'busy',
  'plan-expired',
  'account-changed',
  'user-account-required',
  'target-unavailable',
  'target-changed',
  'membership-unavailable',
  'preferences-unavailable',
  'invitation-required',
  'not-member',
  'pagination-stalled',
]);
export const followError = (error) =>
  known.has(error?.code) ? { code: error.code } : backlinkError(error);
export const followReadFailure = (error) => ({
  ok: false,
  ...followError(error),
});
export const createFollowRuntime = (
  env,
  context,
  { sleep = followReadWait } = {}
) => {
  const plans = new Map();
  const pending = new Set();
  let stopped = false;
  let revision = 0;
  const controls = new Map();
  const validId = (id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);
  const cancelled = (version) =>
    stopped
      ? 'stopped'
      : version.revision !== revision || version.control.signal.aborted
        ? 'cancelled'
        : null;
  const owned = (use, input = {}) => {
    const id = input?.requestId ?? randomUUID();
    const version = { revision, control: new globalThis.AbortController() };
    const task = Promise.resolve()
      .then(() => {
        if (!validId(id)) {
          throw followFailure('bad-request');
        }
        if (controls.has(id)) {
          throw followFailure('busy');
        }
        controls.set(id, version.control);
        if (cancelled(version)) {
          throw followFailure(cancelled(version));
        }
        return use(version);
      })
      .catch(followReadFailure);
    pending.add(task);
    task.finally(() => {
      pending.delete(task);
      if (controls.get(id) === version.control) {
        controls.delete(id);
      }
    });
    return task;
  };
  const readFor = (version, policy, outsideCancelled = () => false) => {
    const signal = version.control.signal;
    return async (use) => {
      const check = () => {
        const code =
          cancelled(version) || (outsideCancelled() ? 'cancelled' : null);
        if (code) {
          throw followFailure(code);
        }
      };
      check();
      try {
        const answer = await withFollowRetry(use, {
          policy,
          sleep: (ms) => sleep(ms, signal),
          cancelled: () => Boolean(cancelled(version) || outsideCancelled()),
        });
        check();
        return answer;
      } catch (error) {
        check();
        throw error;
      }
    };
  };
  const connectedRead = async (
    version,
    use,
    { policy, read = readFor(version, policy) } = {}
  ) => {
    const c = await connectFollowTelegram(env, context, read);
    let actual;
    let queuedError;
    // Own the complete queued read, including identity checks, after a deadline.
    await runIn(env, `follow:read:${randomUUID()}`, () => {
      actual = Promise.resolve().then(async () => {
        if (cancelled(version)) {
          throw followFailure(cancelled(version));
        }
        const owner = await readFollowTelegramOwner(c);
        const result = await use(c, owner);
        if (cancelled(version)) {
          throw followFailure(cancelled(version));
        }
        if (
          (await readFollowTelegramOwner(c)) !== owner ||
          (await context.userClient()) !== c.client
        ) {
          throw followFailure('account-changed');
        }
        return result;
      });
      return actual;
    }).catch((error) => {
      queuedError = error;
    });
    if (!actual) {
      throw queuedError ?? followFailure('read-failed');
    }
    return actual;
  };
  env.followTelegramStop = async () => {
    stopped = true;
    for (const control of controls.values()) {
      control.abort();
    }
    plans.clear();
    await Promise.allSettled([...pending]);
  };
  return {
    plans,
    owned,
    connectedRead,
    readFor,
    cancelled,
    writing: false,
    cancel: async (body = {}) => {
      if (body?.planId !== undefined) {
        if (typeof body.planId !== 'string') {
          return { ok: false, code: 'bad-request' };
        }
        plans.delete(body.planId);
        return { ok: true };
      }
      if (body?.requestId !== undefined) {
        if (!validId(body.requestId)) {
          return { ok: false, code: 'bad-request' };
        }
        controls.get(body.requestId)?.abort();
        return { ok: true };
      }
      revision += 1;
      for (const control of controls.values()) {
        control.abort();
      }
      plans.clear();
      return { ok: true };
    },
  };
};
