import { randomUUID } from 'node:crypto';
import { runIn } from './telegram-stickers.js';
import {
  connectFollowTelegram,
  readFollowTelegramOwner,
} from './telegram-follow-client.js';
import { backlinkError } from '../follow/backlink-shape.js';
import { followFailure } from './telegram-follow-shape.js';

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
export const createFollowRuntime = (env, context) => {
  const plans = new Map();
  const pending = new Set();
  let stopped = false;
  let revision = 0;
  const cancelled = (version) =>
    stopped ? 'stopped' : version !== revision ? 'cancelled' : null;
  const owned = (use) => {
    const version = revision;
    const task = Promise.resolve()
      .then(() => {
        if (cancelled(version)) {
          throw followFailure(cancelled(version));
        }
        return use(version);
      })
      .catch(followReadFailure);
    pending.add(task);
    task.finally(() => pending.delete(task));
    return task;
  };
  const connectedRead = async (version, use) => {
    const c = await connectFollowTelegram(env, context);
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
    plans.clear();
    await Promise.allSettled([...pending]);
  };
  return {
    plans,
    owned,
    connectedRead,
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
      revision += 1;
      plans.clear();
      return { ok: true };
    },
  };
};
